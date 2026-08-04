import type { APIRoute } from 'astro';
import { createUploadUrl, extensionFromMime, mediaKey } from '../../lib/storage';

/**
 * POST /api/upload-url — Génère une URL présignée R2 pour l'upload direct.
 * Le navigateur a déjà compressé l'image en WebP (Canvas) ; il reçoit ici
 * l'URL de PUT signée + la clé objet + l'URL publique CDN.
 */

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const site = locals.siteConfig;
  if (!site) return json({ error: 'Site inconnu' }, 404);

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
