import type { APIRoute } from 'astro';
import { createTextStreamResponse, isStepCount, streamText, toTextStream } from 'ai';
import { z } from 'zod';
import { buildSystemPrompt, createDeepSeek } from '../../lib/ai';
import { createOctokit, getFileContent, listRepoFiles } from '../../lib/github-edge';
import { resolveSecret } from '../../lib/vault';

/**
 * POST /api/chat — DeepSeek streaming (`deepseek-chat`).
 * Injects the active site system prompt and resolves the client API key
 * (encrypted vault, global env fallback). Response: plain text stream.
 *
 * REPO READ ACCESS: when a Git token is available (site vault or session),
 * the model gets `listFiles` / `readFile` tools executed server-side, so it
 * can locate and read existing files before editing them.
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

  const body = (await request.json().catch(() => null)) as { messages?: unknown[] } | null;
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

  const result = streamText({
    model: createDeepSeek(apiKey),
    system: buildSystemPrompt(site),
    messages: messages as never,
    temperature: 0.6,
    maxOutputTokens: 8192,
    // Allow the tool loop (listFiles/readFile) to run for a few steps:
    // AI SDK v7 defaults to a single step (isStepCount(1)).
    stopWhen: isStepCount(5),
    tools:
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
              inputSchema: z.object({ path: z.string().describe('Absolute repo path, e.g. src/content/rdv/clarte.md') }),
              execute: async ({ path }) => {
                if (path.startsWith('/') || path.includes('..')) {
                  return { found: false, error: `Invalid path: ${path}` };
                }
                const file = await getFileContent(octokit, site.repo, path, site.defaultBranch);
                if (!file) return { found: false, error: `File not found: ${path}` };
                return { found: true, path, size: file.size, content: file.content };
              },
            },
          }
        : undefined,
  });

  // AI SDK v7: standalone helpers (toTextStreamResponse is deprecated).
  return createTextStreamResponse({ stream: toTextStream({ stream: result.stream }) });
};
