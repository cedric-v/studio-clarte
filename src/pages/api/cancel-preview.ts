import type { APIRoute } from 'astro';
import { closeDraftPR, createOctokit } from '../../lib/github-edge';

/**
 * POST /api/cancel-preview — Cancels the current preview draft.
 *
 * Closes the draft PR (with a short comment) and deletes its `draft/*`
 * branch — WITHOUT merging anything to `main`. Human action, same
 * authorization as /api/merge (the logged-in collaborator's own OAuth token).
 *
 * This is the explicit counterpart of the automatic draft hygiene: when a
 * new preview is created, previous open `draft/*` PRs are closed
 * automatically; this endpoint covers the "I don't want this preview at all"
 * case, so the GitHub repo never accumulates stale preview PRs.
 */

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const site = locals.siteConfig;
  if (!site) return json({ error: 'Unknown site' }, 404);

  const body = (await request.json().catch(() => null)) as { prNumber?: number } | null;
  const prNumber = Number(body?.prNumber);
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    return json({ error: 'Parameter "prNumber" required' }, 400);
  }

  const gitToken = locals.user?.token;
  if (!gitToken) {
    return json({ error: 'Authentification requise — reconnectez-vous pour annuler la preview.' }, 401);
  }

  try {
    await closeDraftPR(createOctokit(gitToken), site.repo, prNumber);
    return json({ closed: true, prNumber });
  } catch (error) {
    console.error('[cancel-preview]', error);
    return json(
      { error: error instanceof Error ? error.message : 'Unable to cancel the preview' },
      502,
    );
  }
};
