import type { APIRoute } from 'astro';
import { createTextStreamResponse } from 'ai';
import type { ModelMessage } from 'ai';
import { z } from 'zod';
import { t } from '../../i18n';
import {
  createAiModel,
  DEFAULT_MODEL_ID,
  DEFAULT_PROVIDER_ID,
  getAiProvider,
  modelSupportsJsonMode,
} from '../../lib/ai';
import { createOctokit, getFileContent, listRepoFiles } from '../../lib/github-edge';
import { runGeneration } from '../../lib/generator';
import { loadSkill, loadSkillContent, skillMatches, type ActiveSkill } from '../../lib/skills';
import { readAiConfig, resolveSecret } from '../../lib/vault';

/**
 * POST /api/chat — AI streaming.
 *
 * The site's ACTIVE AI provider + model are chosen in ⚙️ Settings (one per
 * site: several providers can be configured, one is active). The server
 * resolves the matching API key from the site vault (or the agency's global
 * env fallback) and streams the reply.
 *
 * Orchestrates generation via `runGeneration`:
 *   - conversational requests → streamed natural reply ;
 *   - content requests → plan first, then ONE model call per file (each
 *     within the output token limit), assembled into a single payload so a
 *     multi-page prompt produces ONE draft PR.
 *
 * REPO READ ACCESS: when a Git token is available (site vault or session),
 * the plan step gets `listFiles` / `readFile` tools executed server-side.
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

  const body = (await request.json().catch(() => null)) as {
    messages?: ModelMessage[];
    draft?: { path: string; content: string; original?: string }[];
  } | null;
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  if (!messages.length)
    return json({ error: t(locals.lang, 'chat.errorMessagesRequired') }, 400);

  // ── Active AI provider + model (site-level, chosen in ⚙️ Settings) ──
  const stored = await readAiConfig(locals.env, site.id);
  const providerId =
    stored && getAiProvider(stored.provider) ? stored.provider : DEFAULT_PROVIDER_ID;
  const provider = getAiProvider(providerId);
  if (!provider) {
    return json({ error: t(locals.lang, 'chat.errorUnknownProvider', providerId) }, 400);
  }
  const modelId =
    (stored && stored.model.trim()) || provider.models[0]?.id || DEFAULT_MODEL_ID;

  const apiKey = await resolveSecret(locals.env, site, provider.apiKeyName);
  if (!apiKey) {
    return json(
      {
        error: t(locals.lang, 'chat.errorMissingKey', provider.label),
      },
      400,
    );
  }

  // Git token for the read tools: the logged-in collaborator's own OAuth
  // token (no GITHUB_PAT — legacy shared identity).
  const gitToken = locals.user?.token;
  const octokit = gitToken ? createOctokit(gitToken) : null;

  // ── Per-site skills (ex: la skill « ajouter une offre » d'instant-academie) ──
  // Chargées depuis le repo DU SITE (jamais un autre tenant), injectées dans
  // les prompts UNIQUEMENT quand la dernière demande utilisateur correspond à
  // la description de la skill (sémantique identique aux skills des agents CLI).
  // Site sans `skillPaths` → aucun impact.
  let activeSkill: ActiveSkill | null = null;
  if (octokit && site.repo && site.skillPaths.length) {
    // Dernière demande réelle de l'utilisateur (le message « [BROUILLON EN
    // COURS …] » synthétique du client ne doit pas déclencher la skill).
    let userText = '';
    for (const m of [...messages].reverse()) {
      if (
        m.role === 'user' &&
        typeof m.content === 'string' &&
        !m.content.startsWith('[BROUILLON EN COURS')
      ) {
        userText = m.content;
        break;
      }
    }
    for (const path of site.skillPaths) {
      const skill = await loadSkill(octokit, site.repo, path, site.defaultBranch);
      if (skill && skillMatches(userText, skill)) {
        activeSkill = await loadSkillContent(octokit, site.repo, path, site.defaultBranch);
        if (activeSkill) break;
      }
    }
  }

  const tools =
    octokit && site.repo
      ? {
          listFiles: {
            description:
              'List the tracked file paths of the site repository (absolute paths from the repo root).',
            inputSchema: z.object({}),
            execute: async () => listRepoFiles(octokit, site.repo, site.defaultBranch),
          },
          readFile: {
            description:
              'Read the content of a text file in the site repository (absolute path from the repo root). Returns { found, path, content } or { found: false, error }.',
            inputSchema: z.object({
              path: z.string().describe('Absolute repo path, e.g. src/content/rdv/clarte.md'),
            }),
            execute: async ({ path }: { path: string }) => {
              if (path.startsWith('/') || path.includes('..')) {
                return { found: false, error: `Invalid path: ${path}` };
              }
              const file = await getFileContent(octokit, site.repo, path, site.defaultBranch);
              if (!file) return { found: false, error: `File not found: ${path}` };
              return { found: true, path, size: file.size, content: file.content };
            },
          },
        }
      : undefined;

  const stream = new ReadableStream<string>({
    async start(controller) {
      try {
        // Out-of-band payload delivery: store the assembled draft in KV under
        // an unguessable token (2h TTL) and stream only a compact marker. The
        // client fetches the payload from /api/draft/<token>. Falls back to
        // inline JSON if KV is unavailable.
        const storeDraft = async (payload: {
          title: string;
          summary: string;
          files: { path: string; content: string; original?: string }[];
        }): Promise<string> => {
          if (!locals.env.KV) throw new Error('KV binding unavailable');
          const token = crypto.randomUUID();
          await locals.env.KV.put(`draft:${token}`, JSON.stringify(payload), {
            expirationTtl: 2 * 60 * 60,
          });
          return token;
        };
        for await (const chunk of runGeneration(createAiModel(provider, modelId, apiKey), site, {
          messages,
          tools,
          activeSkill,
          storeDraft,
          draft: Array.isArray(body?.draft)
            ? body.draft.filter((f) => typeof f.path === 'string' && typeof f.content === 'string')
            : undefined,
          // For MINIMAL edits of existing files: the generator fetches the
          // current content and instructs the model to preserve it.
          readExisting: octokit
            ? (path) => getFileContent(octokit, site.repo, path, site.defaultBranch)
            : undefined,
          // Reasoning models (Grok Reasoning, Gemini thinking…) reject
          // `response_format: json_object` — the generator drops it.
          jsonMode: modelSupportsJsonMode(provider, modelId),
          // UI locale — fallback language for the model's replies + localizes
          // the progress lines streamed into the chat.
          lang: locals.lang,
        })) {
          controller.enqueue(chunk);
        }
      } catch (error) {
        console.error('[chat] generation failed:', error);
        controller.enqueue(t(locals.lang, 'chat.generationFailed'));
      } finally {
        controller.close();
      }
    },
  });

  return createTextStreamResponse({ stream });
};
