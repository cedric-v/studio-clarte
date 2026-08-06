import type { APIRoute } from 'astro';
import { createDraftPR, createOctokit, type DraftFile } from '../../lib/github-edge';
import { resolveSecret } from '../../lib/vault';

/**
 * POST /api/commit-draft — Runs on Cloudflare Compute.
 *
 * Receives the generated file list and creates, via Octokit's Git API:
 *   git.createTree → git.createCommit → git.createRef (draft/*) → pulls.create
 * All in ~1-2 seconds, WITHOUT ever touching `main` directly.
 * Creating the PR triggers the Cloudflare Pages preview build.
 */

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

const MAX_FILES = 20;
/** Cap on base64 image payloads (≈2.25 MB binary per file). */
const MAX_BINARY_CHARS = 3_000_000;
/** Cap on the total JSON payload size (protects the Worker + GitHub API). */
const MAX_TOTAL_CHARS = 12_000_000;

export const POST: APIRoute = async ({ request, locals }) => {
  const site = locals.siteConfig;
  if (!site) return json({ error: 'Unknown site' }, 404);

  const body = (await request.json().catch(() => null)) as {
    files?: DraftFile[];
    title?: string;
    summary?: string;
  } | null;

  const files = Array.isArray(body?.files) ? body.files.slice(0, MAX_FILES) : [];
  if (!files.length) return json({ error: 'No files to commit' }, 400);

  // Every file must look like a valid git path
  let totalChars = 0;
  for (const file of files) {
    if (typeof file.path !== 'string' || typeof file.content !== 'string') {
      return json({ error: 'Invalid files (path/content required)' }, 400);
    }
    if (file.path.startsWith('/') || file.path.includes('..')) {
      return json({ error: `Invalid file path: ${file.path}` }, 400);
    }
    if (file.base64 && file.content.length > MAX_BINARY_CHARS) {
      return json({ error: `Binary file too large: ${file.path}` }, 413);
    }
    totalChars += file.content.length;
  }
  if (totalChars > MAX_TOTAL_CHARS) {
    return json({ error: 'Payload too large' }, 413);
  }

  const pat =
    locals.user?.token ?? (await resolveSecret(locals.env, site, 'GITHUB_PAT'));
  if (!pat) {
    return json(
      { error: 'GITHUB_PAT not configured for this site — add it in ⚙️ Settings.' },
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
      { error: error instanceof Error ? error.message : 'Unable to create the draft' },
      502,
    );
  }
};
