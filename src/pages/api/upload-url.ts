import type { APIRoute } from 'astro';
import { createUploadUrl, extensionFromMime, mediaKey } from '../../lib/storage';

/**
 * POST /api/upload-url — Generates a presigned R2 URL for direct upload.
 * The browser has already compressed the image to WebP (Canvas); it receives
 * the signed PUT URL + object key + public CDN URL here.
 */

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const site = locals.siteConfig;
  if (!site) return json({ error: 'Unknown site' }, 404);

  const body = (await request.json().catch(() => null)) as { contentType?: string } | null;
  const contentType =
    typeof body?.contentType === 'string' && body.contentType.length > 0
      ? body.contentType
      : 'image/webp';

  try {
    const extension = extensionFromMime(contentType);
    const key = mediaKey(site.id, extension);
    const target = await createUploadUrl(locals.env, { key, contentType });
    return json(target);
  } catch (error) {
    console.error('[upload-url]', error);
    return json(
      { error: error instanceof Error ? error.message : 'R2 non configuré' },
      500,
    );
  }
};
