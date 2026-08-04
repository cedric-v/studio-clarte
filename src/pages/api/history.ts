import type { APIRoute } from 'astro';
import { createOctokit, getBranchHistory } from '../../lib/github-edge';
import { resolveSecret } from '../../lib/vault';

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

  const pat =
    (await resolveSecret(locals.env, site.id, 'GITHUB_PAT')) ?? locals.user?.token ?? undefined;
  if (!pat) return json({ error: 'GITHUB_PAT not configured for this site' }, 400);

  try {
    const commits = await getBranchHistory(createOctokit(pat), site.repo, site.defaultBranch, 10);
    return json({ branch: site.defaultBranch, head: commits[0]?.sha ?? null, commits });
  } catch (error) {
    console.error('[history]', error);
    return json(
      { error: error instanceof Error ? error.message : 'Unable to load history' },
      502,
    );
  }
};
