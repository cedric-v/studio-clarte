import { z } from 'zod';

/**
 * Multi-tenant "White Label" configuration.
 * Each client site has its own admin subdomain, target git repo, framework,
 * system-prompt addon and media CDN.
 */

export const SiteConfigSchema = z.object({
  /** Stable internal identifier (e.g. "client-a"). */
  id: z.string(),
  /** Commercial name shown in the header. */
  name: z.string(),
  /** Admin subdomain (e.g. "studio.client-a.ch"). */
  domain: z.string(),
  /** Target GitHub repo as "owner/repo". */
  repo: z.string(),
  framework: z.enum(['astro', 'eleventy', 'generic']),
  /** Extra directives injected into the DeepSeek system prompt. */
  systemPromptAddon: z.string().default(''),
  /** Media CDN domain (e.g. "https://cdn.client-a.ch"). */
  cdnDomain: z.url(),
  /** Base branch for PRs (never push directly to it). */
  defaultBranch: z.string().default('main'),
  theme: z
    .object({
      primaryColor: z.string().optional(),
      logoUrl: z.url().optional(),
    })
    .optional(),
  /** If true → agency domain: Super-Admin mode is active. */
  isAgency: z.boolean().default(false),
});

export type SiteConfig = z.infer<typeof SiteConfigSchema>;

// ═══════════════════════════════════════════════════════════════════
// CLIENT SITES REGISTRY
// ═══════════════════════════════════════════════════════════════════
const SITES: SiteConfig[] = [
  {
    id: 'client-a',
    name: 'Client A',
    domain: 'studio.client-a.ch',
    repo: 'studio-clarte/client-a-site',
    framework: 'astro',
    cdnDomain: 'https://cdn.client-a.ch',
    defaultBranch: 'main',
    isAgency: false,
    systemPromptAddon:
      'Site « Client A » : ton chaleureux et direct, tutoiement. Structure : src/content/offres/*.md (frontmatter title, description, price), src/data/config.json.',
    theme: { primaryColor: '#8b5cf6' },
  },
  {
    id: 'client-b',
    name: 'Client B',
    domain: 'studio.client-b.ch',
    repo: 'studio-clarte/client-b-site',
    framework: 'eleventy',
    cdnDomain: 'https://cdn.client-b.ch',
    defaultBranch: 'main',
    isAgency: false,
    systemPromptAddon:
      'Site « Client B » : ton formel, vouvoiement. Contenu dans content/ (Eleventy), pages Nunjucks à ne pas modifier.',
    theme: { primaryColor: '#06b6d4' },
  },
  {
    id: 'agence',
    name: 'Studio Clarté',
    domain: 'studio.mon-agence.ch',
    repo: 'studio-clarte/site-agence',
    framework: 'generic',
    cdnDomain: 'https://cdn.mon-agence.ch',
    defaultBranch: 'main',
    isAgency: true,
    systemPromptAddon:
      'Site vitrine de l\'agence Studio Clarté : services, offres d\'accompagnement, témoignages clients. Ton expert et rassurant.',
    theme: { primaryColor: '#3b82f6' },
  },
];

/** Detects the site from the subdomain (host normalized without port). */
export function getSiteByHost(host: string): SiteConfig | null {
  const hostname = host.split(':')[0].toLowerCase();
  return SITES.find((site) => site.domain === hostname) ?? null;
}

export function getSiteById(id: string): SiteConfig | null {
  return SITES.find((site) => site.id === id) ?? null;
}

/** Returns all sites (filtering is done in the UI). */
export function listSites(): SiteConfig[] {
  return SITES;
}

/** Super-Admin mode: the domain belongs to the agency. */
export function isAgencyDomain(host: string): boolean {
  return getSiteByHost(host)?.isAgency ?? false;
}
