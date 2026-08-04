import { z } from 'zod';

/**
 * Configuration multi-tenant « Marque Blanche ».
 * Chaque site client possède son sous-domaine d'admin, son dépôt git cible,
 * son framework, son prompt système additionnel et son CDN d'images.
 */

export const SiteConfigSchema = z.object({
  /** Identifiant interne stable (ex: "client-a"). */
  id: z.string(),
  /** Nom commercial affiché dans le header. */
  name: z.string(),
  /** Sous-domaine d'administration (ex: "studio.client-a.ch"). */
  domain: z.string(),
  /** Dépôt GitHub cible au format "owner/repo". */
  repo: z.string(),
  framework: z.enum(['astro', 'eleventy', 'generic']),
  /** Directives additionnelles injectées dans le system prompt DeepSeek. */
  systemPromptAddon: z.string().default(''),
  /** Domaine CDN des médias (ex: "https://cdn.client-a.ch"). */
  cdnDomain: z.url(),
  /** Branche de base pour les PR (ne JAMAIS pousser directement dessus). */
  defaultBranch: z.string().default('main'),
  theme: z
    .object({
      primaryColor: z.string().optional(),
      logoUrl: z.url().optional(),
    })
    .optional(),
  /** Si vrai → domaine de l'agence : mode Super-Admin actif. */
  isAgency: z.boolean().default(false),
});

export type SiteConfig = z.infer<typeof SiteConfigSchema>;

// ═══════════════════════════════════════════════════════════════════
// REGISTRE DES SITES CLIENTS
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

/** Détection du site par sous-domaine (le host est normalisé sans port). */
export function getSiteByHost(host: string): SiteConfig | null {
  const hostname = host.split(':')[0].toLowerCase();
  return SITES.find((site) => site.domain === hostname) ?? null;
}

export function getSiteById(id: string): SiteConfig | null {
  return SITES.find((site) => site.id === id) ?? null;
}

/** Liste des sites visibles (tous — le filtrage se fait côté UI). */
export function listSites(): SiteConfig[] {
  return SITES;
}

/** Mode Super-Admin : le domaine appartient à l'agence. */
export function isAgencyDomain(host: string): boolean {
  return getSiteByHost(host)?.isAgency ?? false;
}
