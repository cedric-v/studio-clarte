import type { APIRoute } from 'astro';
import { getSiteById } from '../../../../config/sites';
import { createOctokit, getPRStatus } from '../../../../lib/github-edge';
import { resolveSecret } from '../../../../lib/vault';

/**
 * GET /api/status/[siteId]/[prNumber] — Polling du statut de preview
 * Cloudflare Pages attaché à la PR (via GitHub Deployments / Check Runs).
 */

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export const GET: APIRoute = async ({ params, locals }) => {
  const site = getSiteById(params.siteId ?? '');
  const prNumber = Number(params.prNumber);
  if (!site || !Number.isInteger(prNumber) || prNumber <= 0) {
    return json({ error: 'Paramètres invalides' }, 400);
  }

  const pat =
    (await resolveSecret(locals.env, site.id, 'GITHUB_PAT')) ?? locals.user?.token ?? undefined;
  if (!pat) return json({ error: 'GITHUB_PAT non configuré pour ce site' }, 400);

  try {
    const status = await getPRStatus(createOctokit(pat), site.repo, prNumber);
    return json(status);
  } catch (error) {
    console.error('[status]', error);
    return json(
      { error: error instanceof Error ? error.message : 'Statut indisponible' },
      502,
    );
  }
};
