import { defineMiddleware } from 'astro:middleware';
import { env as cfEnv } from 'cloudflare:workers';
import { buildRegistry, getSiteByHost, type SiteConfig, type SiteRegistry } from './config/sites';
import { parseEnv } from './env';
import { detectLocale, isLocale, type Locale } from './i18n';

/**
 * Global middleware — Host-based router, context loader & auth guard.
 *
 * 1. Load the Cloudflare bindings (Zod-validated) into `locals.env` ;
 * 2. Resolve the HOST site from the subdomain (runtime domain mapping —
 *    domains are configured via env vars, never hardcoded) ;
 * 3. Super-Admin (agency domain): resolve the ACTIVE site — `?site=` param >
 *    `sc_site` cookie > `DEFAULT_SITE_ID` > the agency site. Non-agency hosts
 *    are locked to their own site (multi-tenant isolation) ;
 * 4. Resolve the UI locale (`?lang=` param → `sc_lang` cookie → Accept-Language) ;
 * 5. Resolve the GitHub OAuth session (`sc_session` cookie → KV) ;
 * 6. Auth guard: private pages → /login, private APIs → 401 ;
 * 7. Block unknown domains (404) ;
 * 8. Apply security headers to every response.
 */

const PUBLIC_PAGE = '/login';
// Public API prefixes: OAuth endpoints + the out-of-band draft fetch
// (unguessable UUID token = capability, like presigned R2 upload URLs).
const PUBLIC_API_PREFIXES = ['/api/auth/', '/api/draft/'];
const ASSET_RE = /\.(css|js|svg|png|jpe?g|webp|avif|gif|ico|woff2?|ttf|map|json|txt)$/i;

/** Security headers applied to every response (OWASP best practices). */
const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-DNS-Prefetch-Control': 'off',
};

const LANG_COOKIE = 'sc_lang';
const SITE_COOKIE = 'sc_site';
const PREFS_TTL = 60 * 60 * 24 * 365;

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);
  const host = context.request.headers.get('host') ?? '';

  // ── 1. Bindings ───────────────────────────────────────────────────
  context.locals.env = parseEnv(cfEnv as unknown as Record<string, unknown>);
  const env = context.locals.env;

  // ── 2. Host site (runtime domain mapping) ─────────────────────────
  const hostSite = getSiteByHost(host, env);
  const isAgency = hostSite?.isAgency ?? false;
  context.locals.hostSite = hostSite;
  context.locals.isAgency = isAgency;
  context.locals.user = null;

  // ── 3. Active site (Super-Admin switching) ────────────────────────
  let activeSite: SiteConfig | null = hostSite;
  let siteRegistry: SiteRegistry | null = null;
  const siteParam = url.searchParams.get('site');
  if (isAgency) {
    siteRegistry = buildRegistry(env);
    const siteCookie = context.cookies.get(SITE_COOKIE)?.value;
    const targetId = siteParam ?? siteCookie ?? env.DEFAULT_SITE_ID;
    if (targetId) activeSite = siteRegistry.byId.get(targetId) ?? hostSite;
  }
  context.locals.siteConfig = activeSite;

  // ── 4+5. Locale + OAuth session ───────────────────────────────────
  const isApi = url.pathname.startsWith('/api/');
  let shouldRedirectClean = false;

  const langParam = url.searchParams.get('lang');
  let lang: Locale;
  if (isLocale(langParam)) {
    lang = langParam;
    context.cookies.set(LANG_COOKIE, lang, {
      path: '/',
      maxAge: PREFS_TTL,
      sameSite: 'lax',
      secure: url.protocol === 'https:',
    });
    url.searchParams.delete('lang');
    shouldRedirectClean = true;
  } else {
    const langCookie = context.cookies.get(LANG_COOKIE)?.value;
    lang = isLocale(langCookie)
      ? langCookie
      : detectLocale(context.request.headers.get('accept-language'));
  }
  context.locals.lang = lang;

  const sessionId = context.cookies.get('sc_session')?.value;
  if (sessionId && env.KV) {
    try {
      const raw = await env.KV.get(`session:${sessionId}`, 'text');
      if (raw) context.locals.user = JSON.parse(raw);
    } catch (error) {
      console.warn('[middleware] Unreadable session:', error);
    }
  }

  // Persist the site switch and clean the URL.
  if (isAgency && siteRegistry && siteParam && siteRegistry.byId.has(siteParam)) {
    context.cookies.set(SITE_COOKIE, siteParam, {
      path: '/',
      maxAge: PREFS_TTL,
      sameSite: 'lax',
      secure: url.protocol === 'https:',
    });
    url.searchParams.delete('site');
    shouldRedirectClean = true;
  }
  if (shouldRedirectClean && !isApi) {
    return context.redirect(url.pathname + url.search);
  }

  const isPublic =
    url.pathname === PUBLIC_PAGE || PUBLIC_API_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
  const isAsset = ASSET_RE.test(url.pathname) || url.pathname.startsWith('/_astro/');

  // ── 6. Unknown domains → hard rejection ───────────────────────────
  if (!hostSite && !isPublic && !isAsset) {
    return isApi
      ? json({ error: 'Domain not configured for Studio Clarté' }, 404)
      : new Response('Domain not configured for Studio Clarté', {
          status: 404,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
  }

  // ── 7. Auth guard ─────────────────────────────────────────────────
  if (!context.locals.user && !isPublic && !isAsset) {
    if (isApi) return json({ error: 'Authentication required' }, 401);
    const nextPath =
      url.pathname === '/' ? '' : `?next=${encodeURIComponent(url.pathname + url.search)}`;
    return context.redirect(`/login${nextPath}`);
  }

  // ── 8. Security headers (without overriding existing ones) ────────
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
