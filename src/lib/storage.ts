import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { CloudflareEnv } from '../env';

/**
 * Cloudflare R2 connector — presigned URLs for direct browser uploads.
 *
 * The client compresses the image to WebP (Canvas API) then PUTs the object
 * directly to R2 via the presigned URL (no bytes transit through the Worker).
 * Public reads are served from the bucket CDN domain (e.g. cdn.client-a.ch).
 *
 * AWS SigV4 signing is handled by @aws-sdk/s3-request-presigner
 * (Workers compatibility: `nodejs_compat` flag required in wrangler).
 */

let cachedClient: S3Client | null = null;

export class StorageError extends Error {}

function getR2Client(env: CloudflareEnv): S3Client {
  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    throw new StorageError(
      'R2 not configured (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY)',
    );
  }
  cachedClient ??= new S3Client({
    region: 'auto',
    // R2 S3 endpoint, path-style (bucket in the path).
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
  /** Presigned URL (direct PUT from the browser). */
  uploadUrl: string;
  /** Object key in the bucket. */
  key: string;
  /** Public CDN URL (display + AI referencing). */
  publicUrl: string;
  /** Presigned URL validity in seconds. */
  expiresIn: number;
}

export async function createUploadUrl(
  env: CloudflareEnv,
  opts: { key: string; contentType: string; expiresIn?: number },
): Promise<UploadTarget> {
  const bucket = env.R2_BUCKET_NAME;
  if (!bucket) throw new StorageError('R2_BUCKET_NAME not configured');
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

/** Public CDN URL of an object key (custom domain or default endpoint). */
export function publicMediaUrl(env: CloudflareEnv, key: string): string {
  const base = (env.R2_PUBLIC_URL ?? `https://${env.R2_ACCOUNT_ID ?? 'r2'}.r2.cloudflarestorage.com`).replace(/\/+$/, '');
  return `${base}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * Generates a hierarchical object key: uploads/{siteId}/{YYYY}/{MM}/{uuid}.{ext}
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
