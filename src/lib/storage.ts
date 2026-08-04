import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { CloudflareEnv } from '../env';

/**
 * Connecteur Cloudflare R2 — URLs présignées pour upload direct navigateur.
 *
 * Le client compresse l'image en WebP (Canvas API) puis PUT l'objet directement
 * sur R2 via l'URL présignée (aucun octet ne transite par le Worker).
 * La lecture publique se fait via le domaine CDN du bucket (ex: cdn.client-a.ch).
 *
 * Signature AWS SigV4 gérée par @aws-sdk/s3-request-presigner
 * (compatibilité Workers : flag `nodejs_compat` requis dans wrangler).
 */

let cachedClient: S3Client | null = null;

export class StorageError extends Error {}

function getR2Client(env: CloudflareEnv): S3Client {
  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    throw new StorageError(
      'R2 non configuré (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY)',
    );
  }
  cachedClient ??= new S3Client({
    region: 'auto',
    // Endpoint S3 de R2, chemin path-style (bucket dans le path).
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
  return cachedClient;
}

export interface UploadTarget {
  /** URL présignée (PUT direct depuis le navigateur). */
  uploadUrl: string;
  /** Clé objet dans le bucket. */
  key: string;
  /** URL publique CDN (affichage + référencement IA). */
  publicUrl: string;
  /** Nombre de secondes de validité de l'URL présignée. */
  expiresIn: number;
}

export async function createUploadUrl(
  env: CloudflareEnv,
  opts: { key: string; contentType: string; expiresIn?: number },
): Promise<UploadTarget> {
  const bucket = env.R2_BUCKET_NAME;
  if (!bucket) throw new StorageError('R2_BUCKET_NAME non configuré');
  const expiresIn = opts.expiresIn ?? 3600;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: opts.key,
    ContentType: opts.contentType,
  });
  const uploadUrl = await getSignedUrl(getR2Client(env), command, { expiresIn });

  return {
    uploadUrl,
    key: opts.key,
    publicUrl: publicMediaUrl(env, opts.key),
    expiresIn,
  };
}

/** URL publique CDN d'une clé objet (domaine custom ou endpoint public par défaut). */
export function publicMediaUrl(env: CloudflareEnv, key: string): string {
  const base = (env.R2_PUBLIC_URL ?? `https://${env.R2_ACCOUNT_ID ?? 'r2'}.r2.cloudflarestorage.com`).replace(/\/+$/, '');
  return `${base}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * Génère une clé objet hiérarchisée : uploads/{siteId}/{AAAA}/{MM}/{uuid}.{ext}
 */
export function mediaKey(siteId: string, extension = 'webp'): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `uploads/${siteId}/${year}/${month}/${crypto.randomUUID()}.${extension}`;
}

const MIME_TO_EXT: Record<string, string> = {
  'image/webp': 'webp',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

export function extensionFromMime(contentType: string): string {
  return MIME_TO_EXT[contentType.toLowerCase()] ?? 'bin';
}
