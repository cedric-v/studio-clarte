import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { CloudflareEnv } from '../env';
import type { SiteConfig } from '../config/sites';
import { decryptVault } from './vault';

/**
 * Cloudflare R2 connector — presigned URLs for direct browser uploads.
 *
 * COST MODEL (per-client storage): each site can store its images in its OWN
 * Cloudflare account bucket (`r2AccountId` + `r2Bucket` in the site config,
 * access keys in the write-only vault). Storage & egress are then billed to
 * the client. Sites without their own R2 fall back to the global bucket
 * (webmaster's vars R2_ACCOUNT_ID / R2_BUCKET_NAME / R2_ACCESS_KEY_ID /
 * R2_SECRET_ACCESS_KEY).
 *
 * The client compresses the image to WebP (Canvas API) then PUTs the object
 * directly to R2 via the presigned URL (no bytes transit through the Worker).
 * Public reads are served from the site's `cdnDomain` (client CDN) or the
 * global `R2_PUBLIC_URL`.
 *
 * AWS SigV4 signing is handled by @aws-sdk/s3-request-presigner
 * (Workers compatibility: `nodejs_compat` flag required in wrangler).
 */

export class StorageError extends Error {}

export interface R2Target {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/** R2 client cache keyed by account (each client account gets its own client). */
const clientCache = new Map<string, S3Client>();

function getR2Client(target: R2Target): S3Client {
  let client = clientCache.get(target.accountId);
  if (!client) {
    client = new S3Client({
      region: 'auto',
      // R2 S3 endpoint, path-style (bucket in the path).
      endpoint: `https://${target.accountId}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
      credentials: {
        accessKeyId: target.accessKeyId,
        secretAccessKey: target.secretAccessKey,
      },
    });
    clientCache.set(target.accountId, client);
  }
  return client;
}

/**
 * Resolves where a site's images are stored:
 *  1. Per-site R2 (client's own account): keys from the vault, public CDN =
 *     the site's `cdnDomain` ;
 *  2. Global fallback (webmaster's bucket): public CDN = `R2_PUBLIC_URL`.
 */
export async function resolveR2UploadTarget(
  env: CloudflareEnv,
  site: SiteConfig | null,
): Promise<{ target: R2Target; publicBase: string }> {
  if (site?.r2AccountId && site.r2Bucket && site.cdnDomain) {
    const keys = await decryptVault(env, site.id);
    // The client bucket REQUIRES the client's own keys: never mix global
    // credentials with a per-site bucket (auth would fail on upload).
    const accessKeyId = keys.R2_ACCESS_KEY_ID;
    const secretAccessKey = keys.R2_SECRET_ACCESS_KEY;
    if (accessKeyId && secretAccessKey) {
      return {
        target: {
          accountId: site.r2AccountId,
          bucket: site.r2Bucket,
          accessKeyId,
          secretAccessKey,
        },
        publicBase: site.cdnDomain,
      };
    }
    console.warn(
      `[storage] Site ${site.id} has per-site R2 config but no R2 keys in the vault — falling back to the global bucket`,
    );
  }

  if (!env.R2_ACCOUNT_ID || !env.R2_BUCKET_NAME || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    throw new StorageError(
      'R2 not configured: set per-site R2 (r2AccountId/r2Bucket + vault keys) or the global R2 vars',
    );
  }
  const publicBase =
    env.R2_PUBLIC_URL ?? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  return {
    target: {
      accountId: env.R2_ACCOUNT_ID,
      bucket: env.R2_BUCKET_NAME,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
    publicBase,
  };
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
  target: R2Target,
  opts: { key: string; contentType: string; expiresIn?: number },
  publicBase: string,
): Promise<UploadTarget> {
  const expiresIn = opts.expiresIn ?? 3600;

  const command = new PutObjectCommand({
    Bucket: target.bucket,
    Key: opts.key,
    ContentType: opts.contentType,
  });
  const uploadUrl = await getSignedUrl(getR2Client(target), command, { expiresIn });

  return {
    uploadUrl,
    key: opts.key,
    publicUrl: publicMediaUrl(publicBase, opts.key),
    expiresIn,
  };
}

/** Public CDN URL of an object key (custom domain or default endpoint). */
export function publicMediaUrl(publicBase: string, key: string): string {
  const base = publicBase.replace(/\/+$/, '');
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
