import type { APIRoute } from 'astro';
import { createOctokit, mergePR } from '../../lib/github-edge';
import { resolveSecret } from '../../lib/vault';

/**
 * POST /api/merge — Validation finale : squash & merge vers `main`,
 * puis suppression de la branche temporaire `draft/*`.
 * C'est la SEULE opération autorisée à écrire sur `main` (action humaine).
 */

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const site = locals.siteConfig;
  if (!site) return json({ error: 'Site inconnu' }, 404);

  const body = (await request.json().catch(() => null)) as { prNumber?: number } | null;
  const prNumber = Number(body?.prNumber);
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    return json({ error: 'Paramètre "prNumber" requis' }, 400);
  }

  const pat =
    (await resolveSecret(locals.env, site.id, 'GITHUB_PAT')) ?? locals.user?.token ?? undefined;
  if (!pat) return json({ error: 'GITHUB_PAT non configuré pour ce site' }, 400);

  try {
    const result = await mergePR(createOctokit(pat), site.repo, prNumber, 'squash');
    return json(result);
  } catch (error) {
    console.error('[merge]', error);
    return json(
      { error: error instanceof Error ? error.message : 'Fusion impossible' },
      502,
    );
  }
};
