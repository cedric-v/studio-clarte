import { z } from 'zod';

/**
 * Zod validation of Cloudflare environment variables / bindings.
 *
 * All values are OPTIONAL at the schema level: the middleware and API routes
 * return explicit errors when a capability is missing (e.g. R2 not configured)
 * instead of failing the whole deployment at boot.
 *
 * In production (Cloudflare Compute), these values come from the `env` binding
 * (`cloudflare:workers`) — secrets + vars from the wrangler file.
 */

export const EnvSchema = z.object({
  // ── API key vault (AES-GCM) ──────────────────────────────────────
  /** Master key used to derive the AES-256 key (hashed via SHA-256). */
  VAULT_MASTER_KEY: z.string().min(16).optional(),

  // ── Global fallbacks (site not configured in the vault) ──────────
  // One per AI provider — AGENCY SITE ONLY (clients bring their own keys).
  DEEPSEEK_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GROK_API_KEY: z.string().optional(),
  OPENCODE_API_KEY: z.string().optional(),

  // ── GitHub OAuth (collaborator authentication) ───────────────────
  OAUTH_GITHUB_CLIENT_ID: z.string().optional(),
  OAUTH_GITHUB_CLIENT_SECRET: z.string().optional(),
  /** Optional whitelist of allowed GitHub logins (comma-separated). */
  ALLOWED_GITHUB_LOGINS: z.string().optional(),

  // ── Site registry (domains are deployment config — never hardcoded) ─
  /** Webmaster studio subdomain (e.g. studio.cedricv.com) → Super-Admin mode + default site. */
  AGENCY_DOMAIN: z.string().optional(),
  /** Site opened by default on the agency domain (defaults to the agency site id). */
  DEFAULT_SITE_ID: z.string().optional(),
  /** JSON map siteId → custom domain, e.g. {"client-a":"studio.client-a.ch"}. */
  SITE_DOMAINS: z.string().optional(),
  /** JSON map siteId → partial site overrides (repo, cdnDomain, name, systemPromptAddon…). */
  SITE_OVERRIDES: z.string().optional(),

  // ── Session ──────────────────────────────────────────────────────
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 7),
});

/** Minimal structural signatures for the Cloudflare KV / R2 bindings. */
export interface KVNamespace {
  get(key: string, type?: 'text'): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number; expiration?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(opts?: { prefix?: string; limit?: number }): Promise<{ keys: { name: string }[]; list_complete: boolean }>;
}

export interface R2Bucket {
  put(key: string, value: ArrayBuffer | ReadableStream | string): Promise<unknown>;
  get(key: string): Promise<unknown>;
  delete(key: string): Promise<void>;
}

/** Typed Cloudflare environment: validated vars + KV/R2 bindings. */
export type CloudflareEnv = z.infer<typeof EnvSchema> & {
  KV?: KVNamespace;
  R2?: R2Bucket;
};

const DEFAULT_ENV: Pick<CloudflareEnv, 'SESSION_TTL_SECONDS'> = {
  SESSION_TTL_SECONDS: 60 * 60 * 24 * 7,
};

/**
 * Validates the raw bindings (the `env` object from the Cloudflare runtime)
 * and keeps only the known fields. Errors are logged but do not block boot.
 */
export function parseEnv(raw: Record<string, unknown>): CloudflareEnv {
  const result = EnvSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join(' | ');
    console.warn('[env] Incomplete configuration:', problems);
    return { ...DEFAULT_ENV, KV: raw.KV as KVNamespace | undefined, R2: raw.R2 as R2Bucket | undefined };
  }
  return { ...result.data, KV: raw.KV as KVNamespace | undefined, R2: raw.R2 as R2Bucket | undefined };
}

/** GitHub OAuth user session (stored in KV, never exposed to the client). */
export interface SessionUser {
  login: string;
  name: string | null;
  avatarUrl: string;
  /** GitHub session token — server-side only (PAT fallback). */
  token: string;
}
