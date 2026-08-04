import { z } from 'zod';

/**
 * Validation Zod des variables d'environnement / bindings Cloudflare.
 *
 * Toutes les valeurs sont OPTIONNELLES côté schéma : le middleware et les routes
 * API renvoient des erreurs explicites quand une capacité manque (ex: R2 non
 * configuré) plutôt que de faire échouer tout le déploiement au boot.
 *
 * En production (Cloudflare Compute), ces valeurs proviennent du binding `env`
 * (`cloudflare:workers`) — secrets + vars du fichier wrangler.
 */

export const EnvSchema = z.object({
  // ── Cloudflare R2 (upload direct via URL présignée) ──────────────
  R2_ACCOUNT_ID: z.string().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  R2_BUCKET_NAME: z.string().min(1).optional(),
  /** Domaine public du bucket (ex: https://cdn.client-a.ch) */
  R2_PUBLIC_URL: z.url().optional(),

  // ── Coffre-fort des clés API (AES-GCM) ───────────────────────────
  /** Clé maîtresse servant à dériver la clé AES-256 (chiffrée via SHA-256). */
  VAULT_MASTER_KEY: z.string().min(16).optional(),

  // ── Fallbacks globaux (site non configuré en vault) ──────────────
  DEEPSEEK_API_KEY: z.string().optional(),
  GITHUB_PAT: z.string().optional(),

  // ── GitHub OAuth (authentification des collaborateurs) ───────────
  OAUTH_GITHUB_CLIENT_ID: z.string().optional(),
  OAUTH_GITHUB_CLIENT_SECRET: z.string().optional(),
  /** Liste blanche optionnelle de logins GitHub autorisés (virgules). */
  ALLOWED_GITHUB_LOGINS: z.string().optional(),

  // ── Session ──────────────────────────────────────────────────────
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 7),
});

/** Bindings Cloudflare KV / R2 (signatures structurelles minimales). */
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

/** Environnement Cloudflare typé : vars validées + bindings KV/R2. */
export type CloudflareEnv = z.infer<typeof EnvSchema> & {
  KV?: KVNamespace;
  R2?: R2Bucket;
};

const DEFAULT_ENV: Pick<CloudflareEnv, 'SESSION_TTL_SECONDS'> = {
  SESSION_TTL_SECONDS: 60 * 60 * 24 * 7,
};

/**
 * Valide les bindings bruts (objet `env` du runtime Cloudflare) et ne retient
 * que les champs connus. Les erreurs sont loggées mais ne bloquent pas le boot.
 */
export function parseEnv(raw: Record<string, unknown>): CloudflareEnv {
  const result = EnvSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join(' | ');
    console.warn('[env] Configuration incomplète :', problems);
    return { ...DEFAULT_ENV, KV: raw.KV as KVNamespace | undefined, R2: raw.R2 as R2Bucket | undefined };
  }
  return { ...result.data, KV: raw.KV as KVNamespace | undefined, R2: raw.R2 as R2Bucket | undefined };
}

/** Session utilisateur GitHub OAuth (stockée chiffrée-adjacente en KV, jamais exposée). */
export interface SessionUser {
  login: string;
  name: string | null;
  avatarUrl: string;
  /** Jeton GitHub de session — usage serveur uniquement (fallback PAT). */
  token: string;
}
