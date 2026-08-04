import type { CloudflareEnv, KVNamespace } from '../env';

/**
 * Coffre-fort de clés API (WRITE-ONLY VAULT).
 *
 * Sécurité :
 * - Chaque clé est chiffrée en AES-256-GCM (Web Crypto) avec une IV aléatoire.
 * - La clé maîtresse (`VAULT_MASTER_KEY`) est dérivée via SHA-256 → 32 octets.
 * - Le blob chiffré est stocké dans Cloudflare KV : `vault:{siteId}`.
 * - Une fois écrite, une clé ne peut JAMAIS être relue : l'interface et l'API
 *   n'exposent que la version masquée `sk-••••••••1234`.
 */

const VAULT_PREFIX = 'vault:';
const IV_BYTES = 12;

export const SECRET_KEYS = ['DEEPSEEK_API_KEY', 'GITHUB_PAT'] as const;
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
  if (!master) throw new Error('VAULT_MASTER_KEY non configurée — impossible de chiffrer les clés');
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
  if (!master) throw new Error('VAULT_MASTER_KEY non configurée — impossible de déchiffrer');
  const key = await deriveKey(master);
  const data = fromB64(token);
  if (data.length <= IV_BYTES) throw new Error('Blob chiffré invalide');
  const iv = data.slice(0, IV_BYTES);
  const cipher = data.slice(IV_BYTES);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return decoder.decode(plain);
}

interface VaultRecord {
  v: 1;
  /** name → blob chiffré base64 (jamais de clair). */
  data: Partial<Record<SecretName, string>>;
  /** name → version MASQUÉE (sk-••••••••1234) calculée à l'écriture. */
  display: Partial<Record<SecretName, string>>;
}

function vaultKey(siteId: string): string {
  return `${VAULT_PREFIX}${siteId}`;
}

/** Lit le blob chiffré brut (sans déchiffrer). */
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
 * Lit les versions MASQUÉES (sk-••••••••1234) stockées à l'écriture.
 * C'est la SEULE représentation des clés exposée au client — le clair et le
 * chiffré ne sortent jamais de l'API.
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

/** Déchiffre toutes les clés du site (usage serveur uniquement). */
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
      console.error(`[vault] Échec de déchiffrement de ${name} pour ${siteId}`, error);
    }
  }
  return out;
}

/**
 * Écrit (remplace) les clés fournies pour un site. Les clés absentes du payload
 * sont conservées telles quelles (mise à jour partielle).
 * Retourne la version MASQUÉE (jamais le clair).
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
 * Résout une clé pour un site : vault du client d'abord, fallback sur la
 * variable d'environnement globale.
 */
export async function resolveSecret(
  env: CloudflareEnv,
  siteId: string,
  name: SecretName,
): Promise<string | undefined> {
  const vault = await decryptVault(env, siteId);
  return vault[name] ?? env[name];
}

/**
 * Masquage d'affichage : `sk-••••••••1234`.
 * Seuls les 3 premiers et les 4 derniers caractères restent visibles.
 * Cette fonction est la SEULE sortie publique des clés.
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
