import type { APIRoute } from 'astro';
import type { SessionUser } from '../../../env';
import { resolveOAuthCredentials } from '../../../lib/vault';

/**
 * GET /api/auth/callback — Exchanges the OAuth code for a GitHub token,
 * checks the optional whitelist, creates the KV session and sets the
 * `sc_session` cookie (HttpOnly, SameSite=Lax, Secure over HTTPS).
 */

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
}

export const GET: APIRoute = async ({ locals, cookies, redirect, url }) => {
  const env = locals.env;
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code || !state) return json({ error: 'Missing code/state' }, 400);

  const kv = env.KV;
  const storedRaw = kv ? await kv.get(`oauth:${state}`, 'text') : null;
  if (!storedRaw) return json({ error: 'Invalid or expired OAuth state' }, 400);
  if (kv) await kv.delete(`oauth:${state}`);

  // Same resolution as /api/auth/login: the site's OWN OAuth app when
  // configured in the vault, else the global env app (agency domain).
  const oauth = await resolveOAuthCredentials(env, locals.siteConfig);
  if (!oauth?.clientId || !oauth.clientSecret) {
    return json({ error: 'GitHub OAuth not configured' }, 500);
  }

  // 1. Exchange the code for an access token
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      client_id: oauth.clientId,
      client_secret: oauth.clientSecret,
      code,
    }),
  });
  const tokenData = (await tokenRes.json().catch(() => null)) as { access_token?: string } | null;
  const accessToken = tokenData?.access_token;
  if (!accessToken) return json({ error: 'GitHub code exchange failed' }, 401);

  // 2. User profile
  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json',
      'user-agent': 'studio-clarte',
    },
  });
  if (!userRes.ok) return json({ error: 'Unable to read the GitHub profile' }, 502);
  const ghUser = (await userRes.json()) as GitHubUser;

  // 3. Liste blanche optionnelle
  const allowlist = (env.ALLOWED_GITHUB_LOGINS ?? '')
    .split(',')
    .map((login) => login.trim().toLowerCase())
    .filter(Boolean);
  if (allowlist.length > 0 && !allowlist.includes(ghUser.login.toLowerCase())) {
    return json({ error: `GitHub account not authorized (${ghUser.login})` }, 403);
  }

  // 4. Session en KV + cookie
  const sessionId = crypto.randomUUID();
  const session: SessionUser = {
    login: ghUser.login,
    name: ghUser.name ?? ghUser.login,
    avatarUrl: ghUser.avatar_url,
    token: accessToken,
  };
  const ttl = env.SESSION_TTL_SECONDS ?? 60 * 60 * 24 * 7;
  if (kv) await kv.put(`session:${sessionId}`, JSON.stringify(session), { expirationTtl: ttl });

  cookies.set('sc_session', sessionId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: url.protocol === 'https:',
    maxAge: ttl,
  });

  const stored = JSON.parse(storedRaw) as { next?: string };
  return redirect(stored.next ?? '/');
};
