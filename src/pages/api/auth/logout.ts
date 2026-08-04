import type { APIRoute } from 'astro';

/**
 * POST /api/auth/logout — Invalidates the KV session and deletes the cookie.
 */

export const POST: APIRoute = async ({ cookies, locals, redirect, url }) => {
  const sessionId = cookies.get('sc_session')?.value;
  if (sessionId && locals.env.KV) {
    await locals.env.KV.delete(`session:${sessionId}`).catch(() => undefined);
  }
  cookies.delete('sc_session', { path: '/' });
  return redirect(url.origin === '' ? '/login' : `${url.origin}/login`);
};
