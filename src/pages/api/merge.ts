import type { APIRoute } from 'astro';
import { createOctokit, mergePR } from '../../lib/github-edge';
import { resolveSecret } from '../../lib/vault';

/**
 * POST /api/merge — Final validation: squash & merge to `main`,
 * then deletion of the temporary `draft/*` branch.
 * This is the ONLY operation allowed to write to `main` (human action).
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

  const pat =
    (await resolveSecret(locals.env, site, 'GITHUB_PAT')) ?? locals.user?.token ?? undefined;
  if (!pat) return json({ error: 'GITHUB_PAT not configured for this site' }, 400);

  try {
    const result = await mergePR(createOctokit(pat), site.repo, prNumber, 'squash');
    return json(result);
  } catch (error) {
    console.error('[merge]', error);
    return json(
      { error: error instanceof Error ? error.message : 'Unable to merge' },
      502,
    );
  }
};
