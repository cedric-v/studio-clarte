import type { APIRoute } from 'astro';
import {
  getAiProvider,
  DEFAULT_PROVIDER_ID,
  DEFAULT_MODEL_ID,
} from '../../../lib/ai';
import {
  maskKey,
  readAiConfig,
  readVaultDisplay,
  writeAiConfig,
  writeSecrets,
  type SecretName,
} from '../../../lib/vault';
import { SECRET_KEYS } from '../../../lib/vault';

/**
 * Client API key vault — WRITE-ONLY + site AI selection.
 *
 * GET  /api/settings/keys  → lists the EFFECTIVE configuration in MASKED form
 *                            (`sk-••••••••1234`). Precedence: site vault first,
 *                            then the global env fallback (Worker secret).
 *                            Each key reports its `source` ('vault' | 'env').
 *                            Also returns the site's ACTIVE AI provider/model
 *                            (`ai: { provider, model }`). Plaintext is NEVER
 *                            returned.
 * POST /api/settings/keys  → encrypts (AES-256-GCM) and stores the provided
 *                            keys (absent values are left untouched, partial
 *                            update). A vault key overrides the global one.
 *                            Accepts `aiProvider` / `aiModel` (non-secret) to
 *                            set the ACTIVE provider/model. Returns only the
 *                            masked versions + the new AI selection.
 */

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export const GET: APIRoute = async ({ locals }) => {
  const site = locals.siteConfig;
  if (!site) return json({ error: 'Unknown site' }, 404);

  const display = await readVaultDisplay(locals.env, site.id);
  const configured: Record<string, string> = {};
  const sources: Record<string, 'vault' | 'env'> = {};
  const env = locals.env as unknown as Record<string, string | undefined>;

  for (const name of SECRET_KEYS) {
    if (display[name]) {
      configured[name] = display[name]!;
      sources[name] = 'vault';
    } else if (site.isAgency && env[name]) {
      // Global fallback (Worker secret / var) — AGENCY SITES ONLY.
      // Clients never inherit global keys: they must provide their own.
      configured[name] = maskKey(env[name]!);
      sources[name] = 'env';
    }
  }

  // Active AI selection (site-level, non-secret) — validated provider id.
  const stored = await readAiConfig(locals.env, site.id);
  const ai =
    stored && getAiProvider(stored.provider)
      ? stored
      : { provider: DEFAULT_PROVIDER_ID, model: DEFAULT_MODEL_ID };

  return json({ siteId: site.id, configured, sources, ai });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const site = locals.siteConfig;
  if (!site) return json({ error: 'Unknown site' }, 404);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  const secrets: Partial<Record<SecretName, string>> = {};
  for (const key of SECRET_KEYS) {
    const value = body?.[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      secrets[key] = value.trim();
    }
  }

  // Active AI selection (non-secret, per-site): accepted even with no keys.
  let ai: { provider?: string; model?: string } | null = null;
  const provider = typeof body?.aiProvider === 'string' ? body.aiProvider.trim() : '';
  const model = typeof body?.aiModel === 'string' ? body.aiModel.trim() : '';
  if (provider || model) {
    if (provider && !getAiProvider(provider)) {
      return json({ error: `Fournisseur d'IA inconnu : ${provider}` }, 400);
    }
    ai = { provider, model };
  }

  if (Object.keys(secrets).length === 0 && !ai) {
    return json({ error: 'No keys to save' }, 400);
  }

  // Guard: a CLIENT site must never store the AGENCY's global keys (any AI
  // provider: DeepSeek, OpenRouter, OpenAI, Gemini, Grok). Clients must
  // provide their own keys (no API costs are ever paid on their behalf).
  if (!site.isAgency) {
    const env = locals.env as unknown as Record<string, string | undefined>;
    for (const key of SECRET_KEYS) {
      const value = secrets[key];
      const globalValue = env[key];
      if (value && globalValue && value === globalValue) {
        return json(
          {
            error: `Cette clé ${key} est celle de l'agence — un site client doit saisir sa propre clé API. La clé de l'agence ne peut pas être stockée dans son coffre-fort.`,
          },
          403,
        );
      }
    }
  }

  try {
    const masked = await writeSecrets(locals.env, site.id, secrets);
    if (ai) {
      // Merge with the current selection (partial updates keep the other field).
      const current = await readAiConfig(locals.env, site.id);
      const next = {
        provider: ai.provider || current?.provider || DEFAULT_PROVIDER_ID,
        model: ai.model || current?.model || DEFAULT_MODEL_ID,
      };
      await writeAiConfig(locals.env, site.id, next);
      ai = next;
    }
    return json({
      ok: true,
      siteId: site.id,
      configured: masked,
      ai,
      note: 'Clés chiffrées (AES-256-GCM) en write-only — elles ne peuvent plus être relues ni copiées.',
    });
  } catch (error) {
    console.error('[settings/keys]', error);
    return json(
      { error: error instanceof Error ? error.message : 'Unable to save' },
      500,
    );
  }
};
