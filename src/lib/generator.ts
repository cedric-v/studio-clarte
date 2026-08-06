import { generateText, isStepCount } from 'ai';
import type { LanguageModel, ModelMessage, Tool } from 'ai';
import type { SiteConfig } from '../config/sites';
import { buildFilePrompt, buildPlanPrompt } from './ai';

/**
 * Sequential content generator — makes multi-page generation reliable.
 *
 * DeepSeek caps the OUTPUT at 8192 tokens per call: a single response cannot
 * contain several complete pages. Instead, the generator:
 *   1. calls the model for a PLAN ({ title, summary, plan: [{path, description}] })
 *      — or a natural conversational reply when no content is requested ;
 *   2. calls the model ONCE PER FILE (each call fits within the token limit) ;
 *   3. assembles every file into ONE payload, so the draft PR contains all pages.
 *
 * Progress lines are yielded so the chat shows what is being generated.
 */

export interface FileTarget {
  path: string;
  description: string;
}

interface PayloadFile {
  path: string;
  content: string;
  /** Pre-edit repo content (existing files) — powers the Diff view. */
  original?: string;
}

interface Payload {
  title: string;
  summary: string;
  files: PayloadFile[];
}

const MAX_FILES = 8;
const MAX_RETRIES = 2;

/** Extracts the first valid JSON object from a model reply (fenced or bare). */
export function extractJsonObject(text: string): unknown | null {
  const tryParse = (candidate: string) => {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      return null;
    }
  };

  // 1. Fenced blocks (last one wins)
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/g);
  if (fenced) {
    for (const block of [...fenced].reverse()) {
      const inner = block.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '').trim();
      const parsed = tryParse(inner);
      if (parsed) return parsed;
    }
  }

  // 2. First balanced {...} object
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const parsed = tryParse(text.slice(start, i + 1));
        if (parsed) return parsed;
        break;
      }
    }
  }
  return null;
}

export interface GenerationOptions {
  /** Conversation history (last N messages). */
  messages: ModelMessage[];
  /** Repo read tools (listFiles / readFile) for the plan step. */
  tools?: Record<string, Tool>;
  /**
   * Reads the current content of an existing file (for MINIMAL edits).
   * When provided and the file exists, the generation prompt receives the
   * original content so the model preserves frontmatter/structure.
   */
  readExisting?: (path: string) => Promise<{ content: string; size: number } | null>;
}

export async function* runGeneration(
  model: LanguageModel,
  site: SiteConfig,
  opts: GenerationOptions,
): AsyncGenerator<string> {
  const userText =
    [...opts.messages].reverse().find((m) => m.role === 'user')?.content ?? '';

  // ── Step 1: plan (or conversational reply) ────────────────────────
  let plan: { title?: string; summary?: string; plan?: unknown } | null = null;
  let reply = '';
  try {
    const result = await generateText({
      model,
      system: buildPlanPrompt(site),
      messages: opts.messages,
      temperature: 0.4,
      maxOutputTokens: 1024,
      // Allow the tool loop (listFiles/readFile) to run for a few steps
      // (AI SDK v7 defaults to a single step).
      stopWhen: isStepCount(5),
      ...(opts.tools ? { tools: opts.tools } : {}),
    });
    const text = result.text.trim();
    const obj = extractJsonObject(text) as
      | { title?: string; summary?: string; plan?: unknown }
      | null;
    if (obj && Array.isArray(obj.plan) && obj.plan.length) {
      plan = obj;
    } else {
      reply = text;
    }
  } catch (error) {
    console.error('[generator] plan failed:', error);
    reply = '⚠️ La planification a échoué. Réessayez ou reformulez la demande.';
  }

  if (!plan) {
    yield reply || '(empty response)';
    return;
  }

  const targets = (plan.plan as unknown[])
    .filter(
      (t): t is FileTarget =>
        typeof t === 'object' &&
        t !== null &&
        typeof (t as { path?: unknown }).path === 'string' &&
        typeof (t as { description?: unknown }).description === 'string',
    )
    .slice(0, MAX_FILES);

  if (!targets.length) {
    yield reply || '(empty response)';
    return;
  }

  // ── Step 2: generate each file in its own call ────────────────────
  const files: PayloadFile[] = [];
  yield `📄 Génération de ${targets.length} fichier(s)…`;

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    yield `\n\n**${i + 1}/${targets.length}** — \`${target.path}\``;

    // Existing file → pass its current content so the model edits minimally
    // (preserving frontmatter, permalinks, structure) instead of rewriting.
    let originalContent: string | undefined;
    if (opts.readExisting) {
      try {
        const existing = await opts.readExisting(target.path);
        if (existing) originalContent = existing.content;
      } catch (error) {
        console.warn(`[generator] unable to read ${target.path}:`, error);
      }
    }

    let ok = false;
    for (let attempt = 0; attempt < MAX_RETRIES && !ok; attempt++) {
      try {
        const result = await generateText({
          model,
          system: buildFilePrompt(site, target.path, target.description, originalContent),
          messages: [{ role: 'user', content: userText }] as never,
          temperature: 0.3,
          maxOutputTokens: 8192,
          stopWhen: isStepCount(2),
        });
        const obj = extractJsonObject(result.text) as { path?: unknown; content?: unknown } | null;
        if (
          obj &&
          typeof obj.path === 'string' &&
          typeof obj.content === 'string' &&
          obj.content.length > 0
        ) {
          // Safety net: if the model duplicated the frontmatter opener
          // (`---\n---` at the start), strip the extra line — otherwise
          // Eleventy ignores the permalink and the build may conflict.
          const content = obj.content.startsWith('---\n---\n')
            ? obj.content.replace(/^---\n---\n/, '')
            : obj.content;
          // `original` carries the pre-edit repo content so the client can
          // render a Diff view (what changed) for existing files.
          files.push(
            originalContent ? { path: obj.path, content, original: originalContent } : { path: obj.path, content },
          );
          ok = true;
        }
      } catch (error) {
        console.error(`[generator] file ${target.path} failed:`, error);
      }
    }
    if (!ok) yield `\n⚠️ Échec de génération de \`${target.path}\``;
  }

  if (!files.length) {
    yield '\n\n⚠️ Aucun fichier n’a pu être généré. Reformulez la demande.';
    return;
  }

  // ── Step 3: final payload (one PR for all pages) ──────────────────
  const payload: Payload = {
    title: (plan.title || 'Generated content').slice(0, 120),
    summary: plan.summary || '',
    files,
  };
  yield `\n\n\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``;
}
