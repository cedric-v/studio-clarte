import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { CloudflareEnv } from '../env';
import type { SiteConfig } from '../config/sites';
import { decryptVault } from './vault';

/**
 * Media storage strategy — DEDICATED per-site storage, no webmaster bucket.
 *
 * Cost model: every site stores its images on ITS OWN Cloudflare account
 * (`r2AccountId` + `r2Bucket` in the site config, access keys in the
 * write-only vault). Storage & egress are billed to the client; the Worker
 * only signs presigned URLs (no bytes transit through it).
 *
 * GIT FALLBACK: if a site has no R2 configuration (or its vault keys are
 * missing), images are NOT uploaded anywhere — they are committed directly
 * into the site's repo (`public/images/{siteId}/…`) as part of the draft PR,
 * referenced via relative URLs (`/images/{siteId}/…`).
 *
 * There is deliberately NO fallback on a webmaster/global bucket.
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

export type UploadTarget =
  | { mode: 'r2'; target: R2Target; publicBase: string }
  | { mode: 'git' };

/**
 * Resolves where a site's images are stored:
 *  1. Per-site R2 (client's own account) when configured AND its vault keys
 *     are present — public CDN = the site's `cdnDomain` ;
 *  2. Otherwise → `git` mode: images are committed to the site repo (no R2).
 */
export async function resolveUploadTarget(
  env: CloudflareEnv,
  site: SiteConfig | null,
): Promise<UploadTarget> {
  if (site?.r2AccountId && site.r2Bucket && site.cdnDomain) {
    const keys = await decryptVault(env, site.id);
    // The client bucket REQUIRES the client's own keys: never mix global
    // credentials with a per-site bucket (auth would fail on upload).
    const accessKeyId = keys.R2_ACCESS_KEY_ID;
    const secretAccessKey = keys.R2_SECRET_ACCESS_KEY;
    if (accessKeyId && secretAccessKey) {
      return {
        mode: 'r2',
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
      `[storage] Site ${site.id}: per-site R2 configured but keys missing in the vault — images will be committed to Git`,
    );
  }
  return { mode: 'git' };
}

export interface R2UploadResult {
  uploadUrl: string;
  key: string;
  publicUrl: string;
  expiresIn: number;
}

export async function createUploadUrl(
  target: R2Target,
  opts: { key: string; contentType: string; expiresIn?: number },
  publicBase: string,
): Promise<R2UploadResult> {
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
 * Generates a hierarchical R2 object key: uploads/{siteId}/{YYYY}/{MM}/{uuid}.{ext}
 */
export function mediaKey(siteId: string, extension = 'webp'): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `uploads/${siteId}/${year}/${month}/${crypto.randomUUID()}.${extension}`;
}

/**
 * Git-fallback target: the image is committed to the site repo under
 * `public/images/{siteId}/…` and referenced with the relative URL
 * `/images/{siteId}/…` (works with Astro `public/`, Eleventy passthrough…).
 */
export function gitMediaRef(siteId: string, extension = 'webp'): { path: string; ref: string } {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const name = `${crypto.randomUUID()}.${extension}`;
  return {
    path: `public/images/${siteId}/${year}/${month}/${name}`,
    ref: `/images/${siteId}/${year}/${month}/${name}`,
  };
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
