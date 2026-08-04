/**
 * In-browser image compression (Canvas API) → WebP.
 *
 * "Zero-Click Upload" goal: a 12 MB smartphone photo becomes a ~150 KB WebP
 * in <300 ms, before any R2 upload.
 * - Resizing capped at maxWidth (default 1920 px — ratio preserved) ;
 * - WebP conversion (quality 0.82) ;
 * - Fallback: if createImageBitmap fails (e.g. undecodable HEIC), the original
 *   file is returned (the server gives it a suitable extension).
 */

export interface ProcessedImage {
  blob: Blob;
  /** Final width in pixels (0 on fallback). */
  width: number;
  /** Final height in pixels (0 on fallback). */
  height: number;
  /** MIME type of the produced blob. */
  contentType: string;
  /** True if the WebP compression succeeded. */
  compressed: boolean;
}

export async function processImageFile(
  file: File,
  opts: { maxWidth?: number; quality?: number } = {},
): Promise<ProcessedImage> {
  const maxWidth = opts.maxWidth ?? 1920;
  const quality = opts.quality ?? 0.82;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxWidth / bitmap.width);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable');

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('WebP conversion failed'))),
        'image/webp',
        quality,
      );
    });

    bitmap.close();
    return {
      blob,
      width,
      height,
      contentType: blob.type || 'image/webp',
      compressed: blob.type === 'image/webp',
    };
  } catch (error) {
    console.warn('[image-processor] Compression failed, falling back to the original file:', error);
    return {
      blob: file,
      width: 0,
      height: 0,
      contentType: file.type || 'application/octet-stream',
      compressed: false,
    };
  }
}

/** Local preview (Data URL) of an image file — thumbnails before upload. */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
