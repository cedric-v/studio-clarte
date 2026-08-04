import type { APIRoute } from 'astro';
import {
  createUploadUrl,
  extensionFromMime,
  gitMediaRef,
  mediaKey,
  resolveUploadTarget,
} from '../../lib/storage';

/**
 * POST /api/upload-url — Resolves the storage target for an image.
 *
 * DEDICATED per-site storage (no webmaster bucket):
 *   - `{ mode: 'r2', uploadUrl, key, publicUrl }` — the image is PUT directly
 *     to the CLIENT's own R2 bucket (keys from the write-only vault), served
 *     from the site's `cdnDomain` ;
 *   - `{ mode: 'git', path, ref }` — no R2 configured: the image will be
 *     committed to the site repo (`path` = repo path, `ref` = relative URL).
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
  const extension = extensionFromMime(contentType);

  try {
    const resolved = await resolveUploadTarget(locals.env, site);

    if (resolved.mode === 'git') {
      const { path, ref } = gitMediaRef(site.id, extension);
      return json({ mode: 'git', path, ref });
    }

    const key = mediaKey(site.id, extension);
    const target = await createUploadUrl(
      resolved.target,
      { key, contentType },
      resolved.publicBase,
    );
    return json({ mode: 'r2', ...target });
  } catch (error) {
    console.error('[upload-url]', error);
    return json({ error: error instanceof Error ? error.message : 'Upload target unavailable' }, 500);
  }
};
