import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import type { SiteConfig } from '../config/sites';
import type { SecretName } from './vault';

// ═══════════════════════════════════════════════════════════════════
// AI PROVIDER REGISTRY
// ─────────────────────────────────────────────────────────────────────
// Studio Clarté talks to any OpenAI-compatible *Chat Completions*
// endpoint, so adding a provider is just: base URL + API key + model list.
//
// ⚠️ IMPORTANT (AI SDK v5+): the OpenAI provider uses the "Responses API"
// by default; DeepSeek, OpenRouter, OpenAI, Gemini (OpenAI-compat) and xAI
// all expose a "Chat Completions"-compatible API. We therefore use
// `.chat(modelId)` — it targets each provider's `/chat/completions`
// endpoint.
// ═══════════════════════════════════════════════════════════════════

export const DEFAULT_PROVIDER_ID = 'deepseek';
export const DEFAULT_MODEL_ID = 'deepseek-chat';
export const DEEPSEEK_MODEL = DEFAULT_MODEL_ID;

export interface AiModelDef {
  /** Wire model id (sent in the API request). */
  id: string;
  /** Human label shown in the UI. */
  label: string;
  /**
   * False for reasoning/thinking models that reject
   * `response_format: { type: 'json_object' }` (e.g. Grok Reasoning,
   * some Gemini thinking modes). The generator then falls back to
   * plain-JSON instructions — the loose extractor parses either.
   * Defaults to true (JSON mode on).
   */
  jsonMode?: boolean;
}

export interface AiProviderDef {
  id: string;
  label: string;
  /** OpenAI-compatible base URL. */
  baseUrl: string;
  /** Vault secret name holding the API key (per-site, write-only). */
  apiKeyName: SecretName;
  /** Where to create the API key (shown in the settings vault). */
  docsUrl: string;
  models: AiModelDef[];
  /** When true, the user can type any model id (OpenRouter routes…). */
  customModels?: boolean;
}

/**
 * Every supported AI provider. The chat lets the user pick the provider
 * + model; the server resolves the matching API key from the site vault
 * (or the agency's global env fallback).
 */
export const AI_PROVIDERS: AiProviderDef[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    apiKeyName: 'DEEPSEEK_API_KEY',
    docsUrl: 'https://platform.deepseek.com/api_keys',
    models: [
      { id: 'deepseek-chat', label: 'DeepSeek Chat (V3)' },
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner (R1)', jsonMode: false },
    ],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyName: 'OPENROUTER_API_KEY',
    docsUrl: 'https://openrouter.ai/settings/keys',
    customModels: true,
    models: [
      { id: 'openai/gpt-5.6-luna', label: 'OpenAI — GPT-5.6 Luna' },
      { id: 'openai/gpt-5.6', label: 'OpenAI — GPT-5.6' },
      { id: 'google/gemini-3.7-pro', label: 'Google — Gemini 3.7 Pro' },
      { id: 'google/gemini-3.7-flash', label: 'Google — Gemini 3.7 Flash' },
      { id: 'x-ai/grok-4.6', label: 'xAI — Grok 4.6' },
      {
        id: 'anthropic/claude-sonnet-4.5',
        label: 'Anthropic — Claude Sonnet 4.5',
        jsonMode: false,
      },
      {
        id: 'anthropic/claude-opus-4.1',
        label: 'Anthropic — Claude Opus 4.1',
        jsonMode: false,
      },
      { id: 'deepseek/deepseek-chat-v3.2', label: 'DeepSeek — Chat V3.2' },
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyName: 'OPENAI_API_KEY',
    docsUrl: 'https://platform.openai.com/api-keys',
    customModels: true,
    models: [
      { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna' },
      { id: 'gpt-5.6', label: 'GPT-5.6' },
      { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' },
      { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra' },
      { id: 'gpt-5.4', label: 'GPT-5.4' },
      { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
      { id: 'gpt-5.2', label: 'GPT-5.2' },
      { id: 'gpt-4.1', label: 'GPT-4.1' },
    ],
  },
  {
    id: 'google',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    apiKeyName: 'GEMINI_API_KEY',
    docsUrl: 'https://aistudio.google.com/apikey',
    customModels: true,
    // Gemini thinking modes reject response_format json_object → jsonMode off.
    models: [
      { id: 'gemini-3.7-pro', label: 'Gemini 3.7 Pro', jsonMode: false },
      { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash', jsonMode: false },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', jsonMode: false },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', jsonMode: false },
    ],
  },
  {
    id: 'grok',
    label: 'Grok (xAI)',
    baseUrl: 'https://api.x.ai/v1',
    apiKeyName: 'GROK_API_KEY',
    docsUrl: 'https://console.x.ai',
    customModels: true,
    models: [
      { id: 'grok-4.6', label: 'Grok 4.6' },
      { id: 'grok-4.6-fast', label: 'Grok 4.6 Fast' },
      { id: 'grok-4.6-reasoning', label: 'Grok 4.6 Reasoning', jsonMode: false },
      { id: 'grok-4.1', label: 'Grok 4.1' },
      { id: 'grok-4.1-fast', label: 'Grok 4.1 Fast' },
    ],
  },
  {
    id: 'opencode',
    label: 'OpenCode Go',
    // OpenAI-compatible endpoint. Adjust this URL in src/lib/ai.ts if your
    // OpenCode Go deployment uses a different gateway/self-hosted server.
    baseUrl: 'https://api.opencode.ai/v1',
    apiKeyName: 'OPENCODE_API_KEY',
    docsUrl: 'https://opencode.ai/docs',
    // The model catalogue is deployment-specific → free-form input, with a
    // single placeholder preset so the picker starts on something.
    customModels: true,
    models: [{ id: 'opencode-go', label: 'OpenCode Go (modèle par défaut)' }],
  },
];

export function getAiProvider(id: string): AiProviderDef | undefined {
  return AI_PROVIDERS.find((provider) => provider.id === id);
}

/**
 * Whether a model accepts `response_format: { type: 'json_object' }`.
 * Unknown/free-form model ids default to true (the retry path drops JSON
 * mode anyway if the provider rejects it).
 */
export function modelSupportsJsonMode(provider: AiProviderDef, modelId: string): boolean {
  const def = provider.models.find((model) => model.id === modelId);
  return def ? def.jsonMode !== false : true;
}

/**
 * Creates the language model for a provider/model pair. All the supported
 * providers expose an OpenAI-compatible Chat Completions endpoint, so a
 * single `createOpenAI({ baseURL })` covers DeepSeek, OpenRouter, OpenAI,
 * Gemini and xAI — `.chat(modelId)` targets `/chat/completions`.
 */
export function createAiModel(
  provider: AiProviderDef,
  modelId: string,
  apiKey: string,
): LanguageModel {
  return createOpenAI({ apiKey, baseURL: provider.baseUrl }).chat(modelId);
}

/** Kept for compatibility — the default provider (DeepSeek Chat). */
export function createDeepSeek(apiKey: string): LanguageModel {
  const provider = getAiProvider(DEFAULT_PROVIDER_ID);
  if (!provider) throw new Error('Default AI provider missing');
  return createAiModel(provider, DEFAULT_MODEL_ID, apiKey);
}

/**
 * Public subset of the registry embedded into the chat page so the client
 * can render the provider/model pickers. No secrets, no base URLs.
 */
export const AI_PROVIDER_META = AI_PROVIDERS.map((provider) => ({
  id: provider.id,
  label: provider.label,
  customModels: Boolean(provider.customModels),
  models: provider.models.map((model) => ({ id: model.id, label: model.label })),
}));

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
    '- Si l\'utilisateur demande de CRÉER OU DE MODIFIER du contenu — création, édition, réorganisation de paragraphes, correction, ajustement d\'une page existante… → réponds UNIQUEMENT avec ce JSON de plan (SANS ```, SANS texte autour, SANS contenu de fichier) :',
    '- NE COLLE JAMAIS le contenu d\'un fichier dans ta réponse : la modification est appliquée via le plan (un fichier par appel). Si l\'utilisateur fournit le texte désiré, utilise-le pour décrire précisément la modification dans le plan.',
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
    '- Réponds UNIQUEMENT avec un objet json (SANS ```, SANS texte autour) :',
    '{',
    '  "path": "<le même chemin>",',
    '  "content": "<contenu complet du fichier>"',
    '}',
    '- Le json doit être strictement valide : échappe les guillemets et retours à la ligne (\\n).',
    '- Ne tronque JAMAIS le contenu : tu as toute la place pour ce seul fichier.',
    '- RESPECTE LA LIMITE DE SORTIE (~7000 tokens) : vise un contenu de 200 à 2500 mots maximum. Pour un très long document, découpe-le en plusieurs fichiers dans le plan.',
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
    '- Réponds UNIQUEMENT avec un objet json (SANS ```, SANS texte autour) :',
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
