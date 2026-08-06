/** Unit test — /api/draft/[token] route with a mocked KV binding. */
import { GET } from '../src/pages/api/draft/[token]';

const kv = new Map<string, string>();
kv.set(
  'draft:11111111-2222-3333-4444-555555555555',
  JSON.stringify({ title: 't', summary: 's', files: [{ path: 'a.md', content: 'hello' }] }),
);
const locals = {
  env: {
    KV: {
      get: async (key: string) => kv.get(key) ?? null,
    },
  },
};

const ok = await GET({ params: { token: '11111111-2222-3333-4444-555555555555' }, locals } as any);
console.log('valid token  →', ok.status, JSON.stringify(JSON.parse(await ok.text())));

const missing = await GET({ params: { token: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }, locals } as any);
console.log('missing token →', missing.status, await missing.text());

const garbage = await GET({ params: { token: 'garbage; DROP TABLE' }, locals } as any);
console.log('invalid token →', garbage.status, await garbage.text());

const noparams = await GET({ params: {}, locals } as any);
console.log('no token     →', noparams.status, await noparams.text());
