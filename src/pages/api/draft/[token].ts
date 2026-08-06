import type { APIRoute } from 'astro';

/**
 * GET /api/draft/[token] — fetch a generated draft payload OUT OF BAND.
 *
 * The chat stream carries only a compact `[[PAYLOAD:<token>]]` marker; the
 * actual payload (full file contents ≈ 15-30 KB) is stored in KV at
 * generation time (2h TTL) and fetched here. This is what keeps the chat
 * stream small and immune to truncation ("Réponse tronquée").
 *
 * SECURITY: the token is an unguessable UUID — a capability, like the
 * presigned R2 upload URLs used elsewhere in the app. The route is public
 * (see middleware PUBLIC_API_PREFIXES) but only authed sessions can CREATE
 * drafts in the first place, and the UUID cannot be enumerated.
 */

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export const GET: APIRoute = async ({ params, locals }) => {
  const token = params.token ?? '';
  if (!TOKEN_RE.test(token)) return json({ error: 'Not found' }, 404);

  const raw = await locals.env.KV?.get(`draft:${token}`, 'text');
  if (!raw) return json({ error: 'Not found' }, 404);

  return new Response(raw, {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
