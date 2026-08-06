#!/usr/bin/env node
/**
 * verify-deploy.mjs — deploy safety net for Studio Clarté.
 *
 * WHY THIS EXISTS: studio.cedricv.com broke TWICE with "Domain not
 * configured" because the plain vars (AGENCY_DOMAIN, DEFAULT_SITE_ID,
 * SITE_DOMAINS, SITE_OVERRIDES) were set ONLY in the Cloudflare dashboard.
 * In the Workers "Versions & Deployments" model, plain vars are part of the
 * VERSION config: every `wrangler deploy` rebuilds the version from the
 * local config file, so dashboard-only vars are silently dropped → the site
 * serves "Domain not configured" 404s.
 *
 * This script makes that failure LOUD:
 *   1. (config mode, default) asserts the generated config
 *      (`dist/server/wrangler.json` — what wrangler actually deploys)
 *      contains the 4 required plain vars, and that the KV id is present.
 *   2. (--smoke mode) hits the live agency domain and fails if it answers
 *      "Domain not configured".
 *
 * Usage (wired into `npm run deploy`):
 *   astro build && node scripts/verify-deploy.mjs && wrangler deploy && node scripts/verify-deploy.mjs --smoke
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const generatedConfig = join(here, '..', 'dist', 'server', 'wrangler.json');

/** Plain vars that MUST be part of every deployment (domain registry). */
const REQUIRED_VARS = ['AGENCY_DOMAIN', 'DEFAULT_SITE_ID', 'SITE_DOMAINS', 'SITE_OVERRIDES'];

function fail(message) {
  console.error(`\n❌ verify-deploy: ${message}\n`);
  process.exit(1);
}

function checkConfig() {
  let config;
  try {
    config = JSON.parse(readFileSync(generatedConfig, 'utf8'));
  } catch (error) {
    return fail(
      `Cannot read the generated deploy config at ${generatedConfig}.\n` +
        '   Did you run `npm run build` first? (the Astro adapter generates it)'
    );
  }

  const vars = config.vars ?? {};
  const missing = REQUIRED_VARS.filter((name) => vars[name] === undefined || vars[name] === '');

  if (missing.length > 0) {
    return fail(
      `Deploy config is MISSING required plain vars: ${missing.join(', ')}\n` +
        '   ⚠️  In the Workers "Versions" model, plain vars are part of the VERSION config.\n' +
        '   ⚠️  Dashboard-only vars are silently DROPPED on every `wrangler deploy`\n' +
        '   ⚠️  (this exact bug broke studio.cedricv.com twice → "Domain not configured").\n' +
        '   ➜  Add them to your GITIGNORED local `wrangler.jsonc` (vars section) and redeploy.\n' +
        '       See wrangler.jsonc.example for the template. Secrets stay worker-level\n' +
        '       (`npx wrangler secret put <NAME>`) — they survive deploys, vars don\'t.'
    );
  }

  const kv = (config.kv_namespaces ?? []).find((b) => b.binding === 'KV');
  if (!kv?.id) {
    return fail('Deploy config is missing the KV namespace id (kv_namespaces → KV).');
  }

  console.log('✅ verify-deploy: config OK');
  for (const name of REQUIRED_VARS) {
    const value = vars[name];
    console.log(`   ${name} = ${value.length > 60 ? value.slice(0, 57) + '…' : value}`);
  }
  console.log(`   KV namespace = ${kv.id}`);
}

async function smokeTest() {
  let config;
  try {
    config = JSON.parse(readFileSync(generatedConfig, 'utf8'));
  } catch {
    return fail(`Cannot read ${generatedConfig} for the smoke test URL.`);
  }
  const agencyDomain = config.vars?.AGENCY_DOMAIN;
  if (!agencyDomain) return fail('AGENCY_DOMAIN missing — cannot run the smoke test.');

  const url = `https://${agencyDomain}/`;
  try {
    const res = await fetch(url, { redirect: 'manual' });
    const body = await res.text();
    if (res.status === 404 && body.includes('Domain not configured')) {
      return fail(
        `LIVE smoke test FAILED: ${url} → HTTP 404 "Domain not configured".\n` +
          '   The deployed version lost the domain vars (dashboard-only vars are dropped\n' +
          '   by the Versions model). Re-run with the vars in wrangler.jsonc and redeploy.'
      );
    }
    console.log(`✅ verify-deploy: live smoke test OK — ${url} → HTTP ${res.status} (${res.headers.get('location') ?? 'no redirect'})`);
  } catch (error) {
    return fail(`Live smoke test error for ${url}: ${error.message}`);
  }
}

const mode = process.argv[2] === '--smoke' ? 'smoke' : 'config';
if (mode === 'smoke') await smokeTest();
else checkConfig();
