import type { CloudflareEnv, KVNamespace } from '../env';
import type { SiteConfig } from '../config/sites';

/**
 * Write-only API key vault.
 *
 * Security:
 * - Every key is encrypted with AES-256-GCM (Web Crypto) and a random IV.
 * - The master key (`VAULT_MASTER_KEY`) is derived via SHA-256 → 32 bytes.
 * - The encrypted blob is stored in Cloudflare KV: `vault:{siteId}`.
 * - Once written, a key can NEVER be read back: the UI and the API only expose
 *   the masked form `sk-••••••••1234`.
 */

const VAULT_PREFIX = 'vault:';
const AI_CONFIG_PREFIX = 'ai:config:';
const IV_BYTES = 12;

/**
 * Site-level AI selection: ONE active provider + model (multiple providers
 * can be configured in the vault, but only this one is used for generation).
 * Not a secret — stored as plain JSON in KV (`ai:config:{siteId}`).
 */
export interface AiConfig {
  provider: string;
  model: string;
}

export const SECRET_KEYS = [
  // ── AI providers (OpenAI-compatible endpoints) ───────────────────
  // One key per provider: DeepSeek (default), OpenRouter (many models via
  // a single key), OpenAI (GPT-5.x, incl. GPT-5.6 Luna), Google Gemini,
  // Grok (xAI). The chat lets the user pick provider + model; the server
  // resolves the matching key from here.
  'DEEPSEEK_API_KEY',
  'OPENROUTER_API_KEY',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'GROK_API_KEY',
  'OPENCODE_API_KEY',
  // ── Images / R2 (per-site storage) ───────────────────────────────
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  // Per-site GitHub OAuth (client self-login on their own subdomain).
  // A GitHub OAuth App has a SINGLE callback URL, so each client subdomain
  // needs its OWN app: OAUTH_GITHUB_CLIENT_ID / OAUTH_GITHUB_CLIENT_SECRET
  // in the site vault. The global env app only matches the agency domain.
  'OAUTH_GITHUB_CLIENT_ID',
  'OAUTH_GITHUB_CLIENT_SECRET',
  // Optional per-site login allowlist (comma-separated GitHub logins).
  // Empty = any GitHub account with access to the site's repo can log in.
  'ALLOWED_GITHUB_LOGINS',
] as const;
export type SecretName = (typeof SECRET_KEYS)[number];

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toB64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromB64(token: string): Uint8Array {
  const binary = atob(token);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(masterKey: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(masterKey));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptSecret(env: CloudflareEnv, plaintext: string): Promise<string> {
  const master = env.VAULT_MASTER_KEY;
  if (!master) throw new Error('VAULT_MASTER_KEY not configured — cannot encrypt keys');
  const key = await deriveKey(master);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plaintext));
  const payload = new Uint8Array(IV_BYTES + cipher.byteLength);
  payload.set(iv, 0);
  payload.set(new Uint8Array(cipher), IV_BYTES);
  return toB64(payload);
}

export async function decryptSecret(env: CloudflareEnv, token: string): Promise<string> {
  const master = env.VAULT_MASTER_KEY;
  if (!master) throw new Error('VAULT_MASTER_KEY not configured — cannot decrypt');
  const key = await deriveKey(master);
  const data = fromB64(token);
  if (data.length <= IV_BYTES) throw new Error('Invalid encrypted blob');
  const iv = data.slice(0, IV_BYTES);
  const cipher = data.slice(IV_BYTES);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return decoder.decode(plain);
}

interface VaultRecord {
  v: 1;
  /** name → base64 encrypted blob (never plaintext). */
  data: Partial<Record<SecretName, string>>;
  /** name → MASKED form (sk-••••••••1234) computed at write time. */
  display: Partial<Record<SecretName, string>>;
}

function vaultKey(siteId: string): string {
  return `${VAULT_PREFIX}${siteId}`;
}

/** Reads the raw encrypted blob (without decrypting). */
export async function readEncryptedVault(
  env: CloudflareEnv,
  siteId: string,
): Promise<Partial<Record<SecretName, string>>> {
  const kv: KVNamespace | undefined = env.KV;
  if (!kv) return {};
  try {
    const raw = await kv.get(vaultKey(siteId), 'text');
    if (!raw) return {};
    const parsed = JSON.parse(raw) as VaultRecord;
    return parsed.data ?? {};
  } catch {
    return {};
  }
}

/**
 * Reads the MASKED versions (sk-••••••••1234) stored at write time.
 * This is the ONLY representation of the keys exposed to the client —
 * plaintext and ciphertext never leave the API.
 */
export async function readVaultDisplay(
  env: CloudflareEnv,
  siteId: string,
): Promise<Partial<Record<SecretName, string>>> {
  const kv: KVNamespace | undefined = env.KV;
  if (!kv) return {};
  try {
    const raw = await kv.get(vaultKey(siteId), 'text');
    if (!raw) return {};
    const parsed = JSON.parse(raw) as VaultRecord;
    return parsed.display ?? {};
  } catch {
    return {};
  }
}

/** Decrypts all keys of a site (server-side use only). */
export async function decryptVault(
  env: CloudflareEnv,
  siteId: string,
): Promise<Partial<Record<SecretName, string>>> {
  const encrypted = await readEncryptedVault(env, siteId);
  const out: Partial<Record<SecretName, string>> = {};
  for (const [name, token] of Object.entries(encrypted)) {
    if (!token) continue;
    try {
      out[name as SecretName] = await decryptSecret(env, token);
    } catch (error) {
      console.error(`[vault] Failed to decrypt ${name} for ${siteId}`, error);
    }
  }
  return out;
}

/**
 * Writes (replaces) the provided keys for a site. Keys absent from the payload
 * are kept as-is (partial update). Returns the MASKED version (never plaintext).
 */
export async function writeSecrets(
  env: CloudflareEnv,
  siteId: string,
  secrets: Partial<Record<SecretName, string>>,
): Promise<Partial<Record<SecretName, string>>> {
  const current = await readEncryptedVault(env, siteId);
  const display: Partial<Record<SecretName, string>> = {};
  for (const [name, value] of Object.entries(secrets)) {
    if (typeof value === 'string' && value.length > 0) {
      current[name as SecretName] = await encryptSecret(env, value);
      display[name as SecretName] = maskKey(value);
    }
  }
  const kv: KVNamespace | undefined = env.KV;
  if (kv) {
    const previous = await readVaultDisplay(env, siteId);
    const mergedDisplay: Partial<Record<SecretName, string>> = { ...previous, ...display };
    const payload: VaultRecord = { v: 1, data: current, display: mergedDisplay };
    await kv.put(vaultKey(siteId), JSON.stringify(payload));
    return mergedDisplay;
  }
  return display;
}

/**
 * Reads the site's ACTIVE AI provider/model selection (plain KV, non-secret).
 * Returns null when never configured — callers fall back to the default
 * provider/model (DeepSeek chat).
 */
export async function readAiConfig(
  env: CloudflareEnv,
  siteId: string,
): Promise<AiConfig | null> {
  const kv: KVNamespace | undefined = env.KV;
  if (!kv) return null;
  try {
    const raw = await kv.get(`${AI_CONFIG_PREFIX}${siteId}`, 'text');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v?: number; provider?: unknown; model?: unknown };
    if (typeof parsed.provider === 'string' && typeof parsed.model === 'string') {
      return { provider: parsed.provider, model: parsed.model };
    }
  } catch {
    // Corrupted/partial record → treat as unset.
  }
  return null;
}

/** Persists the site's ACTIVE AI provider/model selection. */
export async function writeAiConfig(
  env: CloudflareEnv,
  siteId: string,
  config: AiConfig,
): Promise<void> {
  const kv: KVNamespace | undefined = env.KV;
  if (!kv) return;
  await kv.put(`${AI_CONFIG_PREFIX}${siteId}`, JSON.stringify({ v: 1, ...config }));
}

/** Resolves a key for a site: the site vault first, then — ONLY for the
 * webmaster's own site (`isAgency`) — the global env fallback (Worker secret).
 *
 * Clients NEVER inherit global keys: each client must provide its own
 * (no API costs are ever paid on their behalf).
 */
export async function resolveSecret(
  env: CloudflareEnv,
  site: SiteConfig | null,
  name: SecretName,
): Promise<string | undefined> {
  if (!site) return undefined;
  const vault = await decryptVault(env, site.id);
  if (vault[name]) return vault[name];
  if (site.isAgency) {
    // Env fallback only exists for schema fields (the AI provider keys);
    // the R2 keys are vault-only (dedicated per-site storage).
    return (env as unknown as Record<string, string | undefined>)[name];
  }
  return undefined;
}

/**
 * Resolves the GitHub OAuth credentials for a site's login.
 *
 * Per-site creds (stored encrypted in the site vault) take precedence —
 * required for CLIENT subdomains, whose callback URL can never match the
 * global app (a GitHub OAuth App accepts a single callback URL). Falls back
 * to the global Worker secrets (which match the agency domain only).
 */
export async function resolveOAuthCredentials(
  env: CloudflareEnv,
  site: SiteConfig | null,
): Promise<{ clientId: string; clientSecret: string } | null> {
  if (site) {
    const vault = await decryptVault(env, site.id);
    if (vault.OAUTH_GITHUB_CLIENT_ID && vault.OAUTH_GITHUB_CLIENT_SECRET) {
      return {
        clientId: vault.OAUTH_GITHUB_CLIENT_ID,
        clientSecret: vault.OAUTH_GITHUB_CLIENT_SECRET,
      };
    }
  }
  if (env.OAUTH_GITHUB_CLIENT_ID) {
    return {
      clientId: env.OAUTH_GITHUB_CLIENT_ID,
      clientSecret: env.OAUTH_GITHUB_CLIENT_SECRET ?? '',
    };
  }
  return null;
}

/**
 * Display masking: `sk-••••••••1234`.
 * Only the first 3 and the last 4 characters remain visible.
 * This function is the ONLY public output of the keys.
 */
export function maskKey(raw: string): string {
  if (!raw) return '';
  const tail = raw.slice(-4);
  if (raw.length <= 8) return `••••••••${tail}`;
  return `${raw.slice(0, 3)}••••••••${tail}`;
}

export function maskVault(vault: Partial<Record<string, string>>): Partial<Record<string, string>> {
  const out: Partial<Record<string, string>> = {};
  for (const [name, value] of Object.entries(vault)) {
    out[name] = value ? maskKey(value) : '';
  }
  return out;
}
