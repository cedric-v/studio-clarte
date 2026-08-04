import type { APIRoute } from 'astro';

/**
 * GET /api/auth/login — Redirige vers GitHub OAuth authorize.
 * Un jeton d'état (CSRF) est stocké en KV avec le `next` à 10 min.
 */

function json(data: unknown, status = 500): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export const GET: APIRoute = async ({ locals, url, redirect }) => {
  const clientId = locals.env.OAUTH_GITHUB_CLIENT_ID;
  if (!clientId) {
    return json({ error: 'OAuth GitHub non configuré (OAUTH_GITHUB_CLIENT_ID manquant)' }, 500);
  }

  const state = crypto.randomUUID();
  const next = url.searchParams.get('next') ?? '/';

  const kv = locals.env.KV;
  if (kv) {
    await kv.put(
      `oauth:${state}`,
      JSON.stringify({ siteId: locals.siteConfig?.id ?? null, next }),
      { expirationTtl: 600 },
    );
  }

  const redirectUri = `${url.origin}/api/auth/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'read:user repo',
    state,
  });

  return redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
};
