import type { APIRoute } from 'astro';
import type { SessionUser } from '../../../env';

/**
 * GET /api/auth/callback — Échange le code OAuth contre un token GitHub,
 * vérifie la liste blanche (optionnelle), crée la session en KV et pose le
 * cookie `sc_session` (HttpOnly, SameSite=Lax, Secure en HTTPS).
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

  if (!code || !state) return json({ error: 'code/state manquants' }, 400);

  const kv = env.KV;
  const storedRaw = kv ? await kv.get(`oauth:${state}`, 'text') : null;
  if (!storedRaw) return json({ error: 'État OAuth invalide ou expiré' }, 400);
  if (kv) await kv.delete(`oauth:${state}`);

  if (!env.OAUTH_GITHUB_CLIENT_ID || !env.OAUTH_GITHUB_CLIENT_SECRET) {
    return json({ error: 'OAuth GitHub non configuré' }, 500);
  }

  // 1. Échange du code contre un access token
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      client_id: env.OAUTH_GITHUB_CLIENT_ID,
      client_secret: env.OAUTH_GITHUB_CLIENT_SECRET,
      code,
    }),
  });
  const tokenData = (await tokenRes.json().catch(() => null)) as { access_token?: string } | null;
  const accessToken = tokenData?.access_token;
  if (!accessToken) return json({ error: 'Échange de code GitHub échoué' }, 401);

  // 2. Profil utilisateur
  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json',
      'user-agent': 'studio-clarte',
    },
  });
  if (!userRes.ok) return json({ error: 'Profil GitHub illisible' }, 502);
  const ghUser = (await userRes.json()) as GitHubUser;

  // 3. Liste blanche optionnelle
  const allowlist = (env.ALLOWED_GITHUB_LOGINS ?? '')
    .split(',')
    .map((login) => login.trim().toLowerCase())
    .filter(Boolean);
  if (allowlist.length > 0 && !allowlist.includes(ghUser.login.toLowerCase())) {
    return json({ error: `Compte GitHub non autorisé (${ghUser.login})` }, 403);
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
