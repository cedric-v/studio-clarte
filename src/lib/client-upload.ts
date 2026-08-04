import { processImageFile } from './image-processor';

/**
 * Upload direct vers Cloudflare R2 via URL présignée.
 * 1. Compression WebP in-browser (Canvas) ;
 * 2. POST /api/upload-url → URL présignée + clé + URL CDN ;
 * 3. PUT du blob directement sur R2 (aucun octet via le Worker).
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
    throw new Error(err?.error ?? `Upload impossible (${tokenRes.status})`);
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
    throw new Error(`Téléversement R2 échoué (${putRes.status})`);
  }

  return {
    key: target.key,
    publicUrl: target.publicUrl,
    contentType: processed.contentType,
    compressed: processed.compressed,
  };
}
