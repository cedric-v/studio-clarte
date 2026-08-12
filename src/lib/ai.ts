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
 * Shared base prompt: client site context (white label), repo read tools
 * (listFiles/readFile) and content rules. The prompt stays in French: it
 * drives the CONTENT language of the (French-speaking) client sites,
 * independently of the UI locale.
 */
export function buildBasePrompt(site: SiteConfig): string {
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
    '- N\'invente JAMAIS un chemin ni un contenu : utilise les outils si tu dois lire le dépôt.',
    '',
    '## Directives spécifiques au site',
    site.systemPromptAddon,
    '',
    `CDN d'images du site : ${site.cdnDomain}`,
  ].join('\n');
}

/**
 * Plan prompt — used by the generator's first step. The model either answers
 * conversationally (no JSON) or returns a PLAN (file paths + descriptions),
 * never file contents (each file is generated in a separate call).
 */
export function buildPlanPrompt(site: SiteConfig): string {
  return [
    buildBasePrompt(site),
    '',
    '## Ta tâche — PREMIÈRE ÉTAPE : planifier, converser OU annuler',
    '- Si l\'utilisateur demande d\'ANNULER / ABANDONNER / DÉFAIRE la modification en cours (un brouillon « [BROUILLON EN COURS] » figure dans les messages) → commence ta réponse par le marqueur exact [[CANCEL_DRAFT]] (seul sur sa ligne), suivi éventuellement d\'un court message de confirmation. Ce marqueur déclenche l\'effacement du brouillon côté système.',
    '- N\'utilise [[CANCEL_DRAFT]] QUE si un brouillon non publié est réellement en cours de traitement dans la conversation. Sinon, réponds naturellement, sans marqueur.',
    '- Si l\'utilisateur ne demande PAS de générer/modifier du contenu (salutation, question, discussion) → réponds naturellement en français, SANS JSON.',
    '- Si l\'utilisateur demande de générer ou modifier du contenu → réponds UNIQUEMENT avec ce JSON (SANS ``` et SANS contenu de fichier) :',
    '{',
    '  "title": "Titre court de la PR (max 80 caractères)",',
    '  "summary": "Résumé des changements en 2-3 phrases",',
    '  "plan": [',
    '    { "path": "chemin/exact/du/fichier", "description": "Ce que ce fichier doit contenir (2-3 lignes)" }',
    '  ]',
    '}',
    '- Entre 1 et 8 fichiers dans le plan (un par page/contenu demandé).',
    '- Pour MODIFIER une page existante : utilise listFiles/readFile pour trouver le bon chemin et comprendre le format existant.',
    '- Modifie/génère UNIQUEMENT les fichiers demandés — pas de versions non sollicitées.',
    '- SOIS CONCIS : aucune réflexion à voix haute, aucun texte autour du JSON.',
    '- Si un « BROUILLON EN COURS » est fourni dans les messages, travaille sur CES fichiers (et non sur la version publiée du repo).',
  ].join('\n');
}

/**
 * Single-file prompt — used by the generator for EACH file, so the output
 * always fits within the model token limit (one complete file per call).
 */
export function buildFilePrompt(
  site: SiteConfig,
  path: string,
  description: string,
  originalContent?: string,
): string {
  const prompt = [
    buildBasePrompt(site),
    '',
    `## Ta tâche : générer UN fichier — « ${path} »`,
    `Description : ${description}`,
    '- Génère le contenu COMPLET de CE SEUL fichier (aucun autre fichier).',
    '- Réponds UNIQUEMENT avec ce JSON (SANS ```, SANS texte autour) :',
    '{',
    '  "path": "<le même chemin>",',
    '  "content": "<contenu complet du fichier>"',
    '}',
    '- Le JSON doit être strictement valide : échappe les guillemets et retours à la ligne (\\n).',
    '- Ne tronque JAMAIS le contenu : tu as toute la place pour ce seul fichier.',
    '- Si tu modifies une DATE, corrige aussi le jour de la semaine correspondant (ex: le 28 août 2026 est un vendredi).',
  ];

  if (originalContent) {
    prompt.push(
      '',
      '## Le fichier existe déjà — ÉDITION MINIMALE OBLIGATOIRE',
      `Voici le contenu ACTUEL de « ${path} » (entre les deux marqueurs) :`,
      '[DEBUT DU CONTENU EXISTANT]',
      originalContent,
      '[FIN DU CONTENU EXISTANT]',
      '- Renvoie ce fichier COMPLET en ne modifiant QUE ce qui est demandé (ex: une date).',
      '- Conserve à l\'identité : le frontmatter (layout, permalink, locale, title, description…), la structure et tout le reste du contenu.',
      '- Ne réécris PAS le fichier de zéro, ne supprime pas de champs frontmatter, ne change pas les chemins ni les permalinks.',
      '- N\'ajoute JAMAIS de ligne « --- » en plus : le frontmatter d\'origine doit rester exactement tel quel (un seul « --- » d\'ouverture, un seul de fermeture).',
    );
  }

  return prompt.join('\n');
}

/**
 * Patch prompt — used for EDITING an existing file (draft or repo). The model
 * returns only targeted replacements (`search` → `replace`) instead of
 * re-emitting the whole file, so even large pages fit within the token limit.
 */
export function buildPatchPrompt(
  site: SiteConfig,
  path: string,
  description: string,
  baseContent: string,
): string {
  return [
    buildBasePrompt(site),
    '',
    `## Ta tâche : modifier UNE PARTIE du fichier « ${path} »`,
    `Description : ${description}`,
    'Le fichier ACTUEL est :',
    '[DEBUT DU CONTENU EXISTANT]',
    baseContent,
    '[FIN DU CONTENU EXISTANT]',
    '- Applique l\'ajustement demandé en trouvant les portions EXACTES à modifier.',
    '- Réponds UNIQUEMENT avec ce JSON (SANS ```, SANS texte autour) :',
    '{',
    '  "path": "<le même chemin>",',
    '  "patch": [',
    '    { "search": "<portion exacte présente dans le fichier>", "replace": "<nouvelle portion>" }',
    '  ]',
    '}',
    '- `search` doit être identique au caractère près à une portion du fichier actuel (sinon le remplacement échoue).',
    '- N\'inclus JAMAIS le fichier entier. 1 à 5 remplacements maximum.',
    '- Si une date change, corrige aussi le jour de la semaine correspondant (ex: le 28 août 2026 est un vendredi).',
  ].join('\n');
}
