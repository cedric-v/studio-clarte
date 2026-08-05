import type { APIRoute } from 'astro';
import { createTextStreamResponse, streamText, toTextStream } from 'ai';
import { buildSystemPrompt, createDeepSeek } from '../../lib/ai';
import { resolveSecret } from '../../lib/vault';

/**
 * POST /api/chat — DeepSeek streaming (`deepseek-chat`).
 * Injects the active site system prompt and resolves the client API key
 * (encrypted vault, global env fallback). Response: plain text stream
 * (`createTextStreamResponse`).
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

  const result = streamText({
    model: createDeepSeek(apiKey),
    system: buildSystemPrompt(site),
    messages: messages as never,
    temperature: 0.6,
    maxOutputTokens: 8192,
  });

  // AI SDK v7: standalone helpers (toTextStreamResponse is deprecated).
  return createTextStreamResponse({ stream: toTextStream({ stream: result.stream }) });
};
