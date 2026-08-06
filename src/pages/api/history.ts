import type { APIRoute } from 'astro';
import { createOctokit, getBranchHistory } from '../../lib/github-edge';

/**
 * GET /api/history — Production version history (recent commits on the
 * site's default branch). Powers the "Time machine / Rollback" panel.
 * Read-only; no write to the repo.
 */

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export const GET: APIRoute = async ({ locals }) => {
  const site = locals.siteConfig;
  if (!site) return json({ error: 'Unknown site' }, 404);

  // Every git action runs with the logged-in collaborator's own OAuth token:
  // commits/PRs/merges are attributed to THEM (no GITHUB_PAT — it was a
  // legacy shared identity that broke per-collaborator attribution).
  const gitToken = locals.user?.token;
  if (!gitToken) {
    return json({ error: 'Authentification requise — reconnectez-vous pour agir sur le dépôt.' }, 401);
  }

  try {
    const commits = await getBranchHistory(createOctokit(gitToken), site.repo, site.defaultBranch, 10);
    return json({ branch: site.defaultBranch, head: commits[0]?.sha ?? null, commits });
  } catch (error) {
    console.error('[history]', error);
    return json(
      { error: error instanceof Error ? error.message : 'Unable to load history' },
      502,
    );
  }
};
