import { defineMiddleware } from 'astro:middleware';
import { env as cfEnv } from 'cloudflare:workers';
import { getSiteByHost } from './config/sites';
import { parseEnv } from './env';
import { detectLocale, isLocale, type Locale } from './i18n';

/**
 * Global middleware — Host-based router, context loader & auth guard.
 *
 * 1. Detect the client site from the subdomain (e.g. studio.client-a.ch) ;
 * 2. Load the Cloudflare bindings (Zod-validated) into `locals.env` ;
 * 3. Resolve the GitHub OAuth session (`sc_session` cookie → KV) ;
 * 4. Resolve the UI locale (`?lang=` param → `sc_lang` cookie → Accept-Language) ;
 * 5. Auth guard: private pages → /login, private APIs → 401 ;
 * 6. Block unknown domains (404) ;
 * 7. Apply security headers to every response.
 */

const PUBLIC_PAGE = '/login';
const PUBLIC_API_PREFIX = '/api/auth/';
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
const LANG_TTL = 60 * 60 * 24 * 365;

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

  // ── 1+2. Multi-tenant context + bindings ─────────────────────────
  context.locals.siteConfig = site;
  context.locals.isAgency = site?.isAgency ?? false;
  context.locals.env = parseEnv(cfEnv as unknown as Record<string, unknown>);
  context.locals.user = null;

  // ── 3. OAuth session ─────────────────────────────────────────────
  const sessionId = context.cookies.get('sc_session')?.value;
  if (sessionId && context.locals.env.KV) {
    try {
      const raw = await context.locals.env.KV.get(`session:${sessionId}`, 'text');
      if (raw) context.locals.user = JSON.parse(raw);
    } catch (error) {
      console.warn('[middleware] Unreadable session:', error);
    }
  }

  // ── 4. Locale (param > cookie > Accept-Language) ─────────────────
  const isApi = url.pathname.startsWith('/api/');
  const langParam = url.searchParams.get('lang');
  let lang: Locale;
  if (isLocale(langParam)) {
    lang = langParam;
    context.cookies.set(LANG_COOKIE, lang, {
      path: '/',
      maxAge: LANG_TTL,
      sameSite: 'lax',
      secure: url.protocol === 'https:',
    });
    // Clean the URL so the param does not linger in the address bar.
    if (!isApi) {
      url.searchParams.delete('lang');
      return context.redirect(url.pathname + url.search);
    }
  } else {
    const langCookie = context.cookies.get(LANG_COOKIE)?.value;
    lang = isLocale(langCookie)
      ? langCookie
      : detectLocale(context.request.headers.get('accept-language'));
  }
  context.locals.lang = lang;

  const isPublic = url.pathname === PUBLIC_PAGE || url.pathname.startsWith(PUBLIC_API_PREFIX);
  const isAsset = ASSET_RE.test(url.pathname) || url.pathname.startsWith('/_astro/');

  // ── 5. Unknown domains → hard rejection ──────────────────────────
  if (!site && !isPublic && !isAsset) {
    return isApi
      ? json({ error: 'Domain not configured for Studio Clarté' }, 404)
      : new Response('Domain not configured for Studio Clarté', {
          status: 404,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
  }

  // ── 6. Auth guard ────────────────────────────────────────────────
  if (!context.locals.user && !isPublic && !isAsset) {
    if (isApi) return json({ error: 'Authentication required' }, 401);
    const nextPath =
      url.pathname === '/' ? '' : `?next=${encodeURIComponent(url.pathname + url.search)}`;
    return context.redirect(`/login${nextPath}`);
  }

  // ── 7. Security headers (without overriding existing ones) ───────
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
