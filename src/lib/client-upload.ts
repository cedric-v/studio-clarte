import { processImageFile } from './image-processor';

/**
 * Direct upload to Cloudflare R2 via presigned URL.
 * 1. In-browser WebP compression (Canvas) ;
 * 2. POST /api/upload-url → presigned URL + key + CDN URL ;
 * 3. PUT the blob directly to R2 (no bytes transit through the Worker).
 */

export interface UploadedImage {
  key: string;
  publicUrl: string;
  contentType: string;
  compressed: boolean;
}

export async function uploadImage(file: File): Promise<UploadedImage> {
  const processed = await processImageFile(file, { maxWidth: 1920, quality: 0.82 });

  const tokenRes = await fetch('/api/upload-url', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contentType: processed.contentType }),
  });
  if (!tokenRes.ok) {
    const err = await tokenRes.json().catch(() => null);
    throw new Error(err?.error ?? `Upload failed (${tokenRes.status})`);
  }
  const target = (await tokenRes.json()) as {
    uploadUrl: string;
    key: string;
    publicUrl: string;
  };

  const putRes = await fetch(target.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': processed.contentType },
    body: processed.blob,
  });
  if (!putRes.ok) {
    throw new Error(`R2 upload failed (${putRes.status})`);
  }

  return {
    key: target.key,
    publicUrl: target.publicUrl,
    contentType: processed.contentType,
    compressed: processed.compressed,
  };
}
