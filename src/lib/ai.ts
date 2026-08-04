import { createOpenAI } from '@ai-sdk/openai';
import type { SiteConfig } from '../config/sites';

export const DEEPSEEK_MODEL = 'deepseek-chat';
export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

/**
 * Client DeepSeek via @ai-sdk/openai.
 *
 * ⚠️ IMPORTANT (AI SDK v5+) : le provider OpenAI utilise la « Responses API »
 * par défaut ; DeepSeek expose une API compatible « Chat Completions ».
 * On passe donc par `.chat('deepseek-chat')` pour cibler l'endpoint
 * `/chat/completions` de DeepSeek.
 */
export function createDeepSeek(apiKey: string) {
  return createOpenAI({
    apiKey,
    baseURL: DEEPSEEK_BASE_URL,
  }).chat(DEEPSEEK_MODEL);
}

/**
 * System prompt multi-tenant : contexte du site client (marque blanche),
 * format de sortie STRICT (JSON structuré pour le pipeline Git) et règles
 * de référencement des médias déjà téléversés sur le CDN R2.
 */
export function buildSystemPrompt(site: SiteConfig): string {
  return [
    `Tu es « Studio Clarté », l'assistant de création de contenu de l'équipe de contenu pour le site « ${site.name} » (framework: ${site.framework}).`,
    '',
    '## Règles de production',
    `- Tu génères UNIQUEMENT des fichiers de contenu (Markdown, JSON, YAML) destinés à être commités dans le dépôt git « ${site.repo} ».`,
    '- Chemin de fichier ABSOLU depuis la racine du dépôt (ex: src/content/offres/accompagnement.md).',
    '- Les images déjà téléversées par l\'utilisateur sont référencées par leur URL CDN dans les messages. Réutilise ces URL avec un texte alternatif accessible (alt), au format : ![Texte alternatif descriptif](https://cdn...).',
    '- Frontmatter YAML correctement formé pour les fichiers .md si le framework attend du frontmatter (title, description, date…).',
    '- Contenu en français, rédactionnel de haute qualité, sans lorem ipsum.',
    '',
    '## Format de réponse — STRICT',
    'Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour (pas de balise ```), au format :',
    '{',
    '  "title": "Titre court de la PR (max 80 caractères)",',
    '  "summary": "Résumé des changements en 2-3 phrases",',
    '  "files": [',
    '    { "path": "chemin/du/fichier.md", "content": "contenu complet du fichier" }',
    '  ]',
    '}',
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
