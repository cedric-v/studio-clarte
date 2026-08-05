import type { APIRoute } from 'astro';
import { createTextStreamResponse } from 'ai';
import type { ModelMessage } from 'ai';
import { z } from 'zod';
import { createDeepSeek } from '../../lib/ai';
import { createOctokit, getFileContent, listRepoFiles } from '../../lib/github-edge';
import { runGeneration } from '../../lib/generator';
import { resolveSecret } from '../../lib/vault';

/**
 * POST /api/chat — DeepSeek streaming (`deepseek-chat`).
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
  } | null;
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  if (!messages.length) return json({ error: 'Parameter "messages" required' }, 400);

  const apiKey = await resolveSecret(locals.env, site, 'DEEPSEEK_API_KEY');
  if (!apiKey) {
    return json(
      { error: 'DeepSeek key not configured for this site — add it in ⚙️ Settings.' },
      400,
    );
  }

  // Git token for the read tools (site vault > global fallback > session).
  const gitToken =
    (await resolveSecret(locals.env, site, 'GITHUB_PAT')) ?? locals.user?.token ?? undefined;
  const octokit = gitToken ? createOctokit(gitToken) : null;

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
        for await (const chunk of runGeneration(createDeepSeek(apiKey), site, {
          messages,
          tools,
        })) {
          controller.enqueue(chunk);
        }
      } catch (error) {
        console.error('[chat] generation failed:', error);
        controller.enqueue('\n⚠️ La génération a échoué. Réessayez.');
      } finally {
        controller.close();
      }
    },
  });

  return createTextStreamResponse({ stream });
};
