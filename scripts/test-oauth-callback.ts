/**
 * Unit test — GitHub OAuth callback authorization model.
 *
 * Validates the multi-tenant rules:
 *   1. Repo access (owner/collaborator) is the authorization gate.
 *   2. The GLOBAL allowlist applies to the AGENCY only — clients are never
 *      restricted by it (they use the per-site vault allowlist, or repo access).
 *   3. No access to the repo → 403 with a clear message.
 */
import { GET } from '../src/pages/api/auth/callback';

interface Case {
  name: string;
  isAgency: boolean;
  repo: string;
  repoAccess: number; // 200 or 404
  globalAllowlist: string;
  ghLogin: string;
  expect: number;
}

const cases: Case[] = [
  {
    name: 'client, global allowlist set, repo access → LOGIN OK (global ignored for clients)',
    isAgency: false,
    repo: 'client-org/client-a-site',
    repoAccess: 200,
    globalAllowlist: 'cedric-v',
    ghLogin: 'instant-academie',
    expect: 302,
  },
  {
    name: 'client, repo access 404 → 403',
    isAgency: false,
    repo: 'client-org/client-a-site',
    repoAccess: 404,
    globalAllowlist: '',
    ghLogin: 'nobody',
    expect: 403,
  },
  {
    name: 'agency, global allowlist WITHOUT the login → 403',
    isAgency: true,
    repo: 'cedric-v/cedric-v',
    repoAccess: 200,
    globalAllowlist: 'cedric-v',
    ghLogin: 'other',
    expect: 403,
  },
  {
    name: 'agency, global allowlist WITH the login → LOGIN OK',
    isAgency: true,
    repo: 'cedric-v/cedric-v',
    repoAccess: 200,
    globalAllowlist: 'cedric-v',
    ghLogin: 'cedric-v',
    expect: 302,
  },
  {
    name: 'client, no repo configured → LOGIN OK (repo check skipped)',
    isAgency: false,
    repo: '',
    repoAccess: 200,
    globalAllowlist: 'cedric-v',
    ghLogin: 'alice',
    expect: 302,
  },
];

async function runCase(c: Case) {
  const kvStore = new Map<string, string>();
  kvStore.set('oauth:state-1', JSON.stringify({ next: '/' }));

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any) => {
    const urlStr = String(input);
    if (urlStr.includes('/login/oauth/access_token')) {
      return new Response(JSON.stringify({ access_token: 'tok-1' }), { status: 200 });
    }
    if (urlStr.includes('/api.github.com/user')) {
      return new Response(
        JSON.stringify({ login: c.ghLogin, name: c.ghLogin, avatar_url: '' }),
        { status: 200 },
      );
    }
    if (urlStr.includes('/api.github.com/repos/')) {
      return new Response('', { status: c.repoAccess });
    }
    return new Response('', { status: 500 });
  }) as typeof fetch;

  const ctx: any = {
    locals: {
      siteConfig: { id: 't', repo: c.repo, isAgency: c.isAgency, domain: 'studio.test.ch' },
      env: {
        KV: {
          get: async (k: string) => kvStore.get(k) ?? null,
          put: async (k: string, v: string) => void kvStore.set(k, v),
          delete: async (k: string) => void kvStore.delete(k),
        },
        ALLOWED_GITHUB_LOGINS: c.globalAllowlist,
        SESSION_TTL_SECONDS: 3600,
        OAUTH_GITHUB_CLIENT_ID: 'client-id',
        OAUTH_GITHUB_CLIENT_SECRET: 'client-secret',
      },
    },
    cookies: { set: () => {} },
    redirect: (p: string) =>
      new Response(null, { status: 302, headers: { location: p } }),
    url: new URL('https://studio.test.ch/api/auth/callback?code=abc&state=state-1'),
  };

  try {
    const res = await GET(ctx);
    const ok = res.status === c.expect;
    console.log(`${ok ? '✅' : '❌'} ${c.name} → ${res.status} (expected ${c.expect})`);
    if (!ok) console.log(`   body: ${(await res.text()).slice(0, 200)}`);
    return ok;
  } finally {
    globalThis.fetch = originalFetch;
  }
}

let pass = 0;
for (const c of cases) {
  if (await runCase(c)) pass++;
}
console.log(`\n${pass}/${cases.length} cases passed`);
process.exit(pass === cases.length ? 0 : 1);
