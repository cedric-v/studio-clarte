import type { APIRoute } from 'astro';
import type { SessionUser } from '../../../env';
import { resolveOAuthCredentials, resolveSecret } from '../../../lib/vault';

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

  // 3. Repo access = the authorization (multi-tenant model). The account must
  //    be able to access the site's repo (owner or collaborator) — GitHub
  //    returns 404 for private repos the user cannot access. This is what
  //    makes client self-login work automatically, with NO global whitelist.
  const repo = locals.siteConfig?.repo;
  if (repo) {
    const [owner, repoName] = repo.split('/');
    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: 'application/json',
        'user-agent': 'studio-clarte',
      },
    });
    if (repoRes.status === 404) {
      return json(
        { error: `Ce compte GitHub (${ghUser.login}) n'a pas accès au dépôt ${repo}. Ajoutez-le comme collaborateur du dépôt.` },
        403,
      );
    }
    if (!repoRes.ok) {
      return json({ error: 'Impossible de vérifier l\'accès au dépôt — réessayez.' }, 502);
    }
  }

  // 4. Optional whitelist — PER-SITE only (site vault). resolveSecret()
  //    already applies the global env var for the AGENCY ONLY — clients are
  //    never restricted by the global list (repo access is their gate).
  //    Empty = any account with repo access is allowed.
  const allowlistRaw = (await resolveSecret(env, locals.siteConfig, 'ALLOWED_GITHUB_LOGINS')) ?? '';
  const allowlist = allowlistRaw
    .split(',')
    .map((login) => login.trim().toLowerCase())
    .filter(Boolean);
  if (allowlist.length > 0 && !allowlist.includes(ghUser.login.toLowerCase())) {
    return json(
      { error: `Ce compte GitHub (${ghUser.login}) n'est pas autorisé sur ce site.` },
      403,
    );
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
