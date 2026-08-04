import type { APIRoute } from 'astro';

/**
 * POST /api/auth/logout — Invalide la session KV et supprime le cookie.
 */

export const POST: APIRoute = async ({ cookies, locals, redirect, url }) => {
  const sessionId = cookies.get('sc_session')?.value;
  if (sessionId && locals.env.KV) {
    await locals.env.KV.delete(`session:${sessionId}`).catch(() => undefined);
  }
  cookies.delete('sc_session', { path: '/' });
  return redirect(url.origin === '' ? '/login' : `${url.origin}/login`);
};
