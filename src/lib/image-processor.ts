/**
 * Compression d'image IN-BROWSER (Canvas API) → WebP.
 *
 * Objectif « Zero-Click Upload » : une photo smartphone de 12 Mo devient un
 * WebP de ~150 Ko en <300 ms, avant tout téléversement R2.
 * - Redimensionnement plafonné (maxWidth, défaut 1920 px — ratio conservé) ;
 * - Conversion WebP (qualité 0.82) ;
 * - Fallback : si createImageBitmap échoue (ex: HEIC non décodable), on renvoie
 *   le fichier d'origine (le serveur lui donnera une extension adaptée).
 */

export interface ProcessedImage {
  blob: Blob;
  /** Largeur finale en pixels (0 si fallback). */
  width: number;
  /** Hauteur finale en pixels (0 si fallback). */
  height: number;
  /** Type MIME du blob produit. */
  contentType: string;
  /** True si la compression WebP a réussi. */
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
    if (!ctx) throw new Error('Canvas 2D indisponible');

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('Conversion WebP échouée'))),
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
    console.warn('[image-processor] Compression impossible, fallback fichier d\'origine :', error);
    return {
      blob: file,
      width: 0,
      height: 0,
      contentType: file.type || 'application/octet-stream',
      compressed: false,
    };
  }
}

/** Aperçu local (Data URL) d'un fichier image — vignettes avant upload. */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
