import { processImageFile } from './image-processor';

/**
 * Image upload — dedicated per-site storage, no webmaster bucket.
 *
 * 1. In-browser WebP compression (Canvas) ;
 * 2. POST /api/upload-url → resolves the storage mode:
 *    - `r2`  : presigned URL → the blob is PUT directly to the CLIENT's R2
 *              bucket (no bytes transit through the Worker) ;
 *    - `git` : nothing is uploaded — the image stays in the browser and will
 *              be committed to the site repo with the next draft PR
 *              (base64 payload file).
 */

export type UploadedImage =
  | {
      mode: 'r2';
      key: string;
      publicUrl: string;
      contentType: string;
      compressed: boolean;
    }
  | {
      mode: 'git';
      /** Repo path (e.g. public/images/client-a/2026/08/uuid.webp). */
      path: string;
      /** Relative URL reference (e.g. /images/client-a/2026/08/uuid.webp). */
      ref: string;
      /** Local preview (data URL) for thumbnails + base64 payload. */
      dataUrl: string;
      contentType: string;
      compressed: boolean;
    };

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
  const target = (await tokenRes.json()) as
    | { mode: 'r2'; uploadUrl: string; key: string; publicUrl: string }
    | { mode: 'git'; path: string; ref: string };

  if (target.mode === 'git') {
    const dataUrl = await fileToDataUrl(processed.blob);
    return {
      mode: 'git',
      path: target.path,
      ref: target.ref,
      dataUrl,
      contentType: processed.contentType,
      compressed: processed.compressed,
    };
  }

  const putRes = await fetch(target.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': processed.contentType },
    body: processed.blob,
  });
  if (!putRes.ok) {
    throw new Error(`R2 upload failed (${putRes.status})`);
  }

  return {
    mode: 'r2',
    key: target.key,
    publicUrl: target.publicUrl,
    contentType: processed.contentType,
    compressed: processed.compressed,
  };
}

/** Converts a blob to a data URL (local preview / base64 payload). */
export function fileToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
