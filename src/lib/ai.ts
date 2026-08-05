import { createOpenAI } from '@ai-sdk/openai';
import type { SiteConfig } from '../config/sites';

export const DEEPSEEK_MODEL = 'deepseek-chat';
export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

/**
 * DeepSeek client via @ai-sdk/openai.
 *
 * ⚠️ IMPORTANT (AI SDK v5+): the OpenAI provider uses the "Responses API" by
 * default; DeepSeek exposes a "Chat Completions"-compatible API. We therefore
 * use `.chat('deepseek-chat')` to target DeepSeek's `/chat/completions`
 * endpoint.
 */
export function createDeepSeek(apiKey: string) {
  return createOpenAI({
    apiKey,
    baseURL: DEEPSEEK_BASE_URL,
  }).chat(DEEPSEEK_MODEL);
}

/**
 * Multi-tenant system prompt: client site context (white label), STRICT JSON
 * output format (structured for the Git pipeline) and rules for referencing
 * media already uploaded to the R2 CDN.
 *
 * The prompt content stays in French: it drives the CONTENT language of the
 * (French-speaking) client sites, independently of the UI locale.
 */
export function buildSystemPrompt(site: SiteConfig): string {
  return [
    `Tu es « Studio Clarté », l'assistant de création de contenu de l'équipe de contenu pour le site « ${site.name} » (framework: ${site.framework}).`,
    '',
    '## Règles de production',
    `- Tu génères UNIQUEMENT des fichiers de contenu (Markdown, JSON, YAML) destinés à être commités dans le dépôt git « ${site.repo} ».`,
    '- Chemin de fichier ABSOLU depuis la racine du dépôt (ex: src/content/offres/accompagnement.md).',
    '- Les images déjà téléversées par l\'utilisateur sont référencées dans les messages par leur URL CDN (https://cdn...) ou leur chemin relatif dans le dépôt (/images/client-a/...). Réutilise ces références TELLES QUELLES avec un texte alternatif accessible (alt), au format : ![Texte alternatif descriptif](<référence>). Ne modifie ni le domaine CDN ni le chemin.',
    '- Frontmatter YAML correctement formé pour les fichiers .md si le framework attend du frontmatter (title, description, date…).',
    '- Contenu en français, rédactionnel de haute qualité, sans lorem ipsum.',
    '',
    '## Accès au dépôt — OUTILS',
    '- Tu disposes de deux outils pour LIRE le dépôt du site : `listFiles` (liste des chemins) et `readFile` (contenu d\'un fichier, chemin absolu depuis la racine).',
    '- Pour MODIFIER une page existante : commence par `listFiles`, repère le bon chemin (ex. src/content/rdv/clarte.md), lis-le avec `readFile`, puis renvoie le fichier COMPLET corrigé dans files[].',
    '- N\'invente JAMAIS un chemin ni un contenu : utilise les outils si tu dois lire le dépôt. Si un fichier est introuvable, demande le chemin à l\'utilisateur ou propose les fichiers les plus proches trouvés par listFiles.',
    '',
    '## Format de réponse — STRICT',
    '- SOIS CONCIS : ne décris jamais ta démarche, ne réfléchis pas à voix haute. Après avoir éventuellement utilisé les outils de lecture, produis DIRECTEMENT le payload final.',
    '- Conversation simple (pas de génération de fichier) → réponds naturellement en français, SANS JSON.',
    '- Génération de contenu → termine par un bloc ```json contenant UNIQUEMENT le payload, au format :',
    '{',
    '  "title": "Titre court de la PR (max 80 caractères)",',
    '  "summary": "Résumé des changements en 2-3 phrases",',
    '  "files": [',
    '    { "path": "chemin/du/fichier.md", "content": "contenu complet du fichier" }',
    '  ]',
    '}',
    '- N\'ajoute AUCUN texte après le bloc JSON.',
    '- Le JSON doit être strictement valide : échappe les guillemets et retours à la ligne dans les chaînes (\\n), aucun commentaire, aucune virgule finale.',
    '- Génère entre 1 et 8 fichiers par réponse.',
    '- Si l\'utilisateur demande plusieurs contenus, groupe-les dans le même payload.',
    '',
    '## Directives spécifiques au site',
    site.systemPromptAddon,
    '',
    `CDN d'images du site : ${site.cdnDomain}`,
  ].join('\n');
}
