import type { APIRoute } from 'astro';
import { createDraftPR, createOctokit, type DraftFile } from '../../lib/github-edge';
import { resolveSecret } from '../../lib/vault';

/**
 * POST /api/commit-draft — Exécuté sur Cloudflare Compute.
 *
 * Reçoit la liste des fichiers générés et crée, via l'API Git d'Octokit :
 *   git.createTree → git.createCommit → git.createRef (draft/*) → pulls.create
 * Le tout en ~1-2 secondes, SANS jamais toucher `main` directement.
 * La création de la PR déclenche le build de preview Cloudflare Pages.
 */

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

const MAX_FILES = 20;

export const POST: APIRoute = async ({ request, locals }) => {
  const site = locals.siteConfig;
  if (!site) return json({ error: 'Site inconnu' }, 404);

  const body = (await request.json().catch(() => null)) as {
    files?: DraftFile[];
    title?: string;
    summary?: string;
  } | null;

  const files = Array.isArray(body?.files) ? body.files.slice(0, MAX_FILES) : [];
  if (!files.length) return json({ error: 'Aucun fichier à commiter' }, 400);

  // Chaque fichier doit ressembler à un chemin git valide
  for (const file of files) {
    if (typeof file.path !== 'string' || typeof file.content !== 'string') {
      return json({ error: 'Fichiers invalides (path/content requis)' }, 400);
    }
    if (file.path.startsWith('/') || file.path.includes('..')) {
      return json({ error: `Chemin de fichier invalide : ${file.path}` }, 400);
    }
  }

  const pat =
    (await resolveSecret(locals.env, site.id, 'GITHUB_PAT')) ?? locals.user?.token ?? undefined;
  if (!pat) {
    return json(
      { error: 'GITHUB_PAT non configuré pour ce site — ajoutez-le dans ⚙️ Paramètres.' },
      400,
    );
  }

  const title =
    typeof body?.title === 'string' && body.title.trim()
      ? body.title.trim().slice(0, 120)
      : `Contenu ${site.name} — ${new Date().toLocaleDateString('fr-CH')}`;
  const summary = typeof body?.summary === 'string' ? body.summary : '';
  const checklist = files.map((file) => `- [ ] \`${file.path}\``).join('\n');

  try {
    const draft = await createDraftPR(createOctokit(pat), site.repo, files, {
      title,
      base: site.defaultBranch,
      body: [
        `Généré depuis **Studio Clarté** (admin : ${site.domain}).`,
        '',
        summary ? `**Résumé :** ${summary}` : '',
        '',
        '## Fichiers',
        checklist,
        '',
        '> ⚠️ Branche de brouillon — aucune fusion automatique. Valider la preview Cloudflare puis merger.',
      ].join('\n'),
    });
    return json(draft);
  } catch (error) {
    console.error('[commit-draft]', error);
    return json(
      { error: error instanceof Error ? error.message : 'Création du draft impossible' },
      502,
    );
  }
};
