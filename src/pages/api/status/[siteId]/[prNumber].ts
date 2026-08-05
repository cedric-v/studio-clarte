import type { APIRoute } from 'astro';
import { canAccessSite, getSiteById } from '../../../../config/sites';
import { createOctokit, getPRStatus } from '../../../../lib/github-edge';
import { resolveSecret } from '../../../../lib/vault';

/**
 * GET /api/status/[siteId]/[prNumber] — Polls the Cloudflare Pages preview
 * status attached to the PR (via GitHub Deployments / Check Runs).
 *
 * Multi-tenant isolation: non-agency users can only poll their own site
 * (the `siteId` must match their active site).
 */

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export const GET: APIRoute = async ({ params, locals }) => {
  const siteId = params.siteId ?? '';
  const site = getSiteById(siteId, locals.env);
  const prNumber = Number(params.prNumber);
  if (!site || !Number.isInteger(prNumber) || prNumber <= 0) {
    return json({ error: 'Invalid parameters' }, 400);
  }

  // Multi-tenant isolation: locked sites cannot poll other sites' PRs.
  if (!canAccessSite(locals, site.id)) {
    return json({ error: 'Forbidden' }, 403);
  }

  const pat =
    (await resolveSecret(locals.env, site, 'GITHUB_PAT')) ?? locals.user?.token ?? undefined;
  if (!pat) return json({ error: 'GITHUB_PAT not configured for this site' }, 400);

  try {
    const status = await getPRStatus(createOctokit(pat), site.repo, prNumber);
    return json(status);
  } catch (error) {
    console.error('[status]', error);
    return json(
      { error: error instanceof Error ? error.message : 'Status unavailable' },
      502,
    );
  }
};
