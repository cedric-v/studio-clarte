import type { APIRoute } from 'astro';
import { createOctokit, getParentSha, restoreToCommit } from '../../lib/github-edge';
import { resolveSecret } from '../../lib/vault';

/**
 * POST /api/restore — Emergency rollback to a previous production version.
 *
 * Body (one of):
 *   { "sha": "<commit sha>" }        → restore the branch to THIS version's content
 *   { "revert": "<commit sha>" }     → undo that single commit (restore to its parent),
 *                                      used by the "Undo publish" toast after a merge.
 *
 * The restore is NON-DESTRUCTIVE: a new `revert:` commit is created on the
 * default branch (fast-forward, history preserved) and Cloudflare Pages
 * rebuilds production automatically. Human-confirmed action only.
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

  const body = (await request.json().catch(() => null)) as { sha?: string; revert?: string } | null;
  const sha = typeof body?.sha === 'string' && body.sha.length >= 7 ? body.sha : null;
  const revert = typeof body?.revert === 'string' && body.revert.length >= 7 ? body.revert : null;
  if (!sha && !revert) {
    return json({ error: 'Parameter "sha" (restore to a version) or "revert" (undo a commit) required' }, 400);
  }

  const pat =
    (await resolveSecret(locals.env, site, 'GITHUB_PAT')) ?? locals.user?.token ?? undefined;
  if (!pat) return json({ error: 'GITHUB_PAT not configured for this site' }, 400);

  try {
    const octokit = createOctokit(pat);
    const target = sha ?? (revert ? await getParentSha(octokit, site.repo, revert) : null);
    if (!target) return json({ error: 'Invalid target version' }, 400);

    const result = await restoreToCommit(octokit, site.repo, target, site.defaultBranch);
    return json({ restored: true, ...result });
  } catch (error) {
    console.error('[restore]', error);
    return json(
      { error: error instanceof Error ? error.message : 'Unable to restore this version' },
      502,
    );
  }
};
