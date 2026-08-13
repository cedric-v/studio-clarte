import type { APIRoute } from 'astro';
import { maskKey, readVaultDisplay, writeSecrets, type SecretName } from '../../../lib/vault';
import { SECRET_KEYS } from '../../../lib/vault';

/**
 * Client API key vault — WRITE-ONLY.
 *
 * GET  /api/settings/keys  → lists the EFFECTIVE configuration in MASKED form
 *                            (`sk-••••••••1234`). Precedence: site vault first,
 *                            then the global env fallback (Worker secret).
 *                            Each key reports its `source` ('vault' | 'env').
 *                            Plaintext is NEVER returned.
 * POST /api/settings/keys  → encrypts (AES-256-GCM) and stores the provided
 *                            keys (absent values are left untouched, partial
 *                            update). A vault key overrides the global one.
 *                            Returns only the masked versions.
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

  return json({ siteId: site.id, configured, sources });
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

  if (Object.keys(secrets).length === 0) {
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
    return json({
      ok: true,
      siteId: site.id,
      configured: masked,
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
