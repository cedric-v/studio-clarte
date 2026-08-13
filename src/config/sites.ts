import { z } from 'zod';
import type { CloudflareEnv } from '../env';

/**
 * Multi-tenant "White Label" site registry.
 *
 * SECURITY / BEST PRACTICE: customer domains are NEVER hardcoded in code.
 * They are deployment configuration provided at runtime via Cloudflare vars:
 *   - `AGENCY_DOMAIN`   → the webmaster's studio subdomain (Super-Admin mode +
 *                         default working site), e.g. studio.cedricv.com ;
 *   - `SITE_DOMAINS`    → JSON map siteId → custom domain (client domains) ;
 *   - `DEFAULT_SITE_ID` → site opened by default on the agency domain ;
 *   - `SITE_OVERRIDES`  → JSON map siteId → partial site overrides
 *                         (repo, cdnDomain, name, systemPromptAddon…).
 *
 * The definitions below are only SEED defaults (business config: repos,
 * prompts, themes). Any value can be overridden per deployment.
 */

export const SiteConfigSchema = z.object({
  /** Stable internal identifier (e.g. "client-a"). */
  id: z.string(),
  /** Commercial name shown in the header. */
  name: z.string(),
  /** Target GitHub repo as "owner/repo". */
  repo: z.string(),
  framework: z.enum(['astro', 'eleventy', 'generic']),
  /** Extra directives injected into the DeepSeek system prompt. */
  systemPromptAddon: z.string().default(''),
  /**
   * Per-site AI "skills": repo-relative paths to SKILL.md files (frontmatter
   * `name` + `description`), loaded from the SITE's own repo via the GitHub
   * API and injected into the prompts ONLY when the user request matches the
   * skill description. Empty for sites without skills — other tenants are
   * completely unaffected. Configurable per site via `SITE_OVERRIDES`.
   */
  skillPaths: z.array(z.string()).default([]),
  /** Media CDN domain (e.g. "https://cdn.cedricv.com"). */
  cdnDomain: z.url(),
  /** Base branch for PRs (never push directly to it). */
  defaultBranch: z.string().default('main'),
  theme: z
    .object({
      primaryColor: z.string().optional(),
      logoUrl: z.url().optional(),
    })
    .optional(),
  /** If true → the webmaster's own site: Super-Admin mode is active on its domain. */
  isAgency: z.boolean().default(false),
  /**
   * Per-site R2 storage (non-secret identifiers): when set, images are
   * uploaded to the CLIENT's own Cloudflare bucket (account id + bucket name),
   * with the access keys stored in the write-only vault. The site's `cdnDomain`
   * then serves as the public CDN. Falls back to the global R2 vars otherwise.
   */
  r2AccountId: z.string().optional(),
  r2Bucket: z.string().optional(),
  /**
   * Resolved at runtime from `AGENCY_DOMAIN` / `SITE_DOMAINS`.
   * Always undefined in the seed config — never hardcoded.
   */
  domain: z.string().optional(),
});

export type SiteConfig = z.infer<typeof SiteConfigSchema>;

// ═══════════════════════════════════════════════════════════════════
// SEED DEFAULTS — business config only (no domains).
// Override per deployment via `SITE_OVERRIDES` / `AGENCY_DOMAIN` /
// `SITE_DOMAINS` (Cloudflare vars).
// ═══════════════════════════════════════════════════════════════════
const SEED_SITES: SiteConfig[] = [
  {
    id: 'agence',
    name: 'Studio Clarté (webmaster)',
    repo: 'studio-clarte/site-agence',
    framework: 'generic',
    cdnDomain: 'https://cdn.example.com', // override via SITE_OVERRIDES
    defaultBranch: 'main',
    isAgency: true,
    systemPromptAddon:
      'Site vitrine du webmaster : services, offres d\'accompagnement, témoignages clients. Ton expert et rassurant.',
    skillPaths: [],
    theme: { primaryColor: '#3b82f6' },
  },
];

export interface SiteRegistry {
  sites: SiteConfig[];
  byId: Map<string, SiteConfig>;
  /** hostname (lowercase, no port) → siteId. */
  domainMap: Map<string, string>;
  /** Site opened by default on the agency domain. */
  defaultSiteId: string;
}

function safeJson<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn('[sites] Invalid JSON config:', error);
    return fallback;
  }
}

/** Builds the effective registry: seed defaults + env overrides + domain mapping. */
export function buildRegistry(env: CloudflareEnv): SiteRegistry {
  const overrides = safeJson<Record<string, Partial<SiteConfig>>>(env.SITE_OVERRIDES, {});
  const domainInput = safeJson<Record<string, string>>(env.SITE_DOMAINS, {});

  // Seed sites (overridable per deployment) + config-driven NEW client sites:
  // any extra entry in SITE_OVERRIDES whose id is not a seed is a brand-new
  // site — no code change or redeploy needed to onboard a client.
  const sites: SiteConfig[] = [
    ...SEED_SITES.map((seed) => ({ ...seed, ...(overrides[seed.id] ?? {}) })),
    ...Object.entries(overrides)
      .filter(([id]) => !SEED_SITES.some((seed) => seed.id === id))
      .map(([id, override]) => ({
        id,
        name: override.name ?? id,
        repo: override.repo ?? '',
        framework: override.framework ?? 'generic',
        systemPromptAddon: override.systemPromptAddon ?? '',
        skillPaths: override.skillPaths ?? [],
        cdnDomain: override.cdnDomain ?? 'https://cdn.example.com',
        defaultBranch: override.defaultBranch ?? 'main',
        isAgency: false,
        theme: override.theme,
      })),
  ];

  // Resolve domains (deployment config, never in code)
  for (const site of sites) {
    site.domain = domainInput[site.id];
  }
  if (env.AGENCY_DOMAIN) {
    const agency = sites.find((site) => site.isAgency);
    if (agency) agency.domain = env.AGENCY_DOMAIN;
  }

  const domainMap = new Map<string, string>();
  for (const site of sites) {
    if (site.domain) domainMap.set(site.domain.split(':')[0].toLowerCase(), site.id);
  }

  const defaultSiteId =
    env.DEFAULT_SITE_ID && sites.some((site) => site.id === env.DEFAULT_SITE_ID)
      ? env.DEFAULT_SITE_ID
      : (sites.find((site) => site.isAgency)?.id ?? sites[0]?.id ?? '');

  return { sites, byId: new Map(sites.map((site) => [site.id, site])), domainMap, defaultSiteId };
}

/** Detects the site from the host subdomain (runtime domain mapping). */
export function getSiteByHost(host: string, env: CloudflareEnv): SiteConfig | null {
  const hostname = host.split(':')[0].toLowerCase();
  const registry = buildRegistry(env);
  const siteId = registry.domainMap.get(hostname);
  return siteId ? (registry.byId.get(siteId) ?? null) : null;
}

export function getSiteById(id: string, env: CloudflareEnv): SiteConfig | null {
  return buildRegistry(env).byId.get(id) ?? null;
}

/** All sites (used by the Super-Admin site switcher — agency only). */
export function listSites(env: CloudflareEnv): SiteConfig[] {
  return buildRegistry(env).sites;
}

/** Multi-tenant isolation: non-agency users are locked to their own site. */
export function canAccessSite(locals: { isAgency: boolean; siteConfig: SiteConfig | null }, siteId: string): boolean {
  return locals.isAgency || locals.siteConfig?.id === siteId;
}
