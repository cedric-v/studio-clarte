import type { APIRoute } from 'astro';
import { readVaultDisplay, writeSecrets, type SecretName } from '../../../lib/vault';
import { SECRET_KEYS } from '../../../lib/vault';

/**
 * Client API key vault — WRITE-ONLY.
 *
 * GET  /api/settings/keys  → lists the configured keys in MASKED form
 *                            (`sk-••••••••1234`). Plaintext is NEVER returned.
 * POST /api/settings/keys  → encrypts (AES-256-GCM) and stores the provided
 *                            keys (absent values are left untouched, partial
 *                            update). Returns only the masked versions.
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
  return json({ siteId: site.id, configured: display });
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
