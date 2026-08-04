import type { APIRoute } from 'astro';
import { createTextStreamResponse, streamText, toTextStream } from 'ai';
import { buildSystemPrompt, createDeepSeek } from '../../lib/ai';
import { resolveSecret } from '../../lib/vault';

/**
 * POST /api/chat — Streaming DeepSeek (`deepseek-chat`).
 * Injecte le system prompt du site actif + résout la clé API du client
 * (vault chiffré, fallback env globale). Réponse : flux texte brut
 * (`streamText().toTextStreamResponse()`).
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

  const body = (await request.json().catch(() => null)) as { messages?: unknown[] } | null;
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  if (!messages.length) return json({ error: 'Paramètre "messages" requis' }, 400);

  const apiKey = await resolveSecret(locals.env, site.id, 'DEEPSEEK_API_KEY');
  if (!apiKey) {
    return json(
      { error: 'Clé DeepSeek non configurée pour ce site — ajoutez-la dans ⚙️ Paramètres.' },
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

  // AI SDK v7 : helpers standalone (toTextStreamResponse est déprécié).
  return createTextStreamResponse({ stream: toTextStream({ stream: result.stream }) });
};
