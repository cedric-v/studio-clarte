import type { APIRoute } from 'astro';
import { canAccessSite, getSiteById } from '../../../../config/sites';
import { createOctokit, getPRStatus } from '../../../../lib/github-edge';

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
    // Diagnostic: echo the received values so the UI can surface them.
    console.error('[status] invalid parameters', { siteId, prNumber, resolved: site?.id ?? null });
    return json(
      {
        error: `Invalid parameters (siteId=${JSON.stringify(params.siteId)}, prNumber=${JSON.stringify(params.prNumber)})`,
      },
      400,
    );
  }

  // Multi-tenant isolation: locked sites cannot poll other sites' PRs.
  if (!canAccessSite(locals, site.id)) {
    return json({ error: 'Forbidden' }, 403);
  }

  const gitToken = locals.user?.token;
  if (!gitToken) {
    return json({ error: 'Authentification requise — reconnectez-vous pour agir sur le dépôt.' }, 401);
  }

  try {
    const status = await getPRStatus(createOctokit(gitToken), site.repo, prNumber);
    return json(status);
  } catch (error) {
    console.error('[status]', error);
    return json(
      { error: error instanceof Error ? error.message : 'Status unavailable' },
      502,
    );
  }
};
