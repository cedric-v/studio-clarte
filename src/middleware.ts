import { defineMiddleware } from 'astro:middleware';
import { env as cfEnv } from 'cloudflare:workers';
import { getSiteByHost } from './config/sites';
import { parseEnv } from './env';

/**
 * Middleware global — Router Host-Based, Context Loader & Auth Guard.
 *
 * 1. Détection du site client par sous-domaine (ex: studio.client-a.ch) ;
 * 2. Chargement des bindings Cloudflare (validés par Zod) dans `locals.env` ;
 * 3. Résolution de la session GitHub OAuth (cookie `sc_session` → KV) ;
 * 4. Garde d'authentification : pages privées → /login, API privées → 401 ;
 * 5. Blocage des domaines non configurés (404).
 */

const PUBLIC_PAGE = '/login';
const PUBLIC_API_PREFIX = '/api/auth/';
const ASSET_RE = /\.(css|js|svg|png|jpe?g|webp|avif|gif|ico|woff2?|ttf|map|json|txt)$/i;

/** Headers de sécurité appliqués à toutes les réponses (bonnes pratiques OWASP). */
const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-DNS-Prefetch-Control': 'off',
};

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);
  const host = context.request.headers.get('host') ?? '';
  const site = getSiteByHost(host);

  // ── 1+2. Contexte multi-tenant + bindings ─────────────────────────
  context.locals.siteConfig = site;
  context.locals.isAgency = site?.isAgency ?? false;
  context.locals.env = parseEnv(cfEnv as unknown as Record<string, unknown>);
  context.locals.user = null;

  // ── 3. Session OAuth ──────────────────────────────────────────────
  const sessionId = context.cookies.get('sc_session')?.value;
  if (sessionId && context.locals.env.KV) {
    try {
      const raw = await context.locals.env.KV.get(`session:${sessionId}`, 'text');
      if (raw) context.locals.user = JSON.parse(raw);
    } catch (error) {
      console.warn('[middleware] Session illisible :', error);
    }
  }

  const isApi = url.pathname.startsWith('/api/');
  const isPublic = url.pathname === PUBLIC_PAGE || url.pathname.startsWith(PUBLIC_API_PREFIX);
  const isAsset = ASSET_RE.test(url.pathname) || url.pathname.startsWith('/_astro/');

  // ── 4. Domaines inconnus → refus net ──────────────────────────────
  if (!site && !isPublic && !isAsset) {
    return isApi
      ? json({ error: 'Domaine non configuré pour Studio Clarté' }, 404)
      : new Response('Domaine non configuré pour Studio Clarté', {
          status: 404,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
  }

  // ── 5. Garde d'authentification ───────────────────────────────────
  if (!context.locals.user && !isPublic && !isAsset) {
    if (isApi) return json({ error: 'Authentification requise' }, 401);
    const nextPath =
      url.pathname === '/' ? '' : `?next=${encodeURIComponent(url.pathname + url.search)}`;
    return context.redirect(`/login${nextPath}`);
  }

  // ── 6. Headers de sécurité (sans écraser ceux déjà posés) ─────────
  const response = await next();
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});
