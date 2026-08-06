import type { APIRoute } from 'astro';
import { resolveOAuthCredentials } from '../../../lib/vault';

/**
 * GET /api/auth/login — Redirects to GitHub OAuth authorize.
 * A state token (CSRF) is stored in KV with `next` for 10 minutes.
 * Uses the site's OWN OAuth app when configured in the vault (each client
 * subdomain needs its own app — a GitHub OAuth App has a single callback
 * URL), falling back to the global env app (agency domain).
 */

function json(data: unknown, status = 500): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export const GET: APIRoute = async ({ locals, url, redirect }) => {
  const oauth = await resolveOAuthCredentials(locals.env, locals.siteConfig);
  if (!oauth?.clientId) {
    return json(
      {
        error:
          "GitHub OAuth not configured — add OAUTH_GITHUB_CLIENT_ID / OAUTH_GITHUB_CLIENT_SECRET to this site's vault (or the global env)",
      },
      500,
    );
  }
  const clientId = oauth.clientId;

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
