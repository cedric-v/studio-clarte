import type { Octokit } from '@octokit/rest';
import { getFileContent } from './github-edge';

/**
 * Per-site AI "skills" — mechanism for client-specific instructions.
 *
 * Studio Clarté is multi-tenant: a skill (e.g. instant-academie's
 * « ajouter une offre ») must NEVER leak into another client's prompts.
 * Skills therefore live in the SITE'S OWN repo (`.agents/skills/.../SKILL.md`,
 * frontmatter `name` + `description`), are loaded through the GitHub API
 * (already scoped to `site.repo`) and are injected into the prompts ONLY
 * when the latest user request matches the skill description — the same
 * description-driven semantics as CLI agent skills (pi / opencode / codex).
 */

export interface SkillMeta {
  /** Repo-relative path of the SKILL.md (from site.skillPaths). */
  path: string;
  /** Frontmatter `name`. */
  name: string;
  /** Frontmatter `description`. */
  description: string;
}

export interface ActiveSkill extends SkillMeta {
  /** Full body of the SKILL.md (frontmatter stripped) — injected in prompts. */
  content: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;

/** Minimal YAML frontmatter reader (name + description only). */
function parseFrontmatter(raw: string): { name?: string; description?: string } {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) return {};
  const meta: { name?: string; description?: string } = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^\s*([a-zA-Z-]+)\s*:\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1].trim();
    if (key !== 'name' && key !== 'description') continue;
    meta[key] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return meta;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Creation phrases (French) that activate a skill directly.
 * Stored NORMALIZED (accents stripped) to match `normalize()` output.
 */
const CREATION_PHRASES = [
  'nouvelle offre',
  'ajouter une offre',
  'creer une offre',
  'cree une offre',
  'ajoute une offre',
  'nouvelle formation',
  'ajouter une formation',
  'creer une formation',
  'cree une formation',
  'ajoute une formation',
  'nouvelle offre de formation',
  'genere une offre',
  'genere une formation',
  'lancer une offre',
  'lancer une formation',
  'lance une offre',
  'lance une formation',
];

const CREATION_VERBS = [
  'ajouter',
  'creer',
  'cree',
  'ajoute',
  'genere',
  'lancer',
  'lance',
  'mettre en place',
];
const DOMAIN_TERMS = ['offre', 'formation'];

/**
 * Whether a user request should activate the skill. Heuristic: an explicit
 * creation phrase matches directly; otherwise a creation verb AND a domain
 * term must both be present (reduces false positives on plain edits,
 * questions or discussions).
 */
export function skillMatches(userText: string, _skill: SkillMeta): boolean {
  const text = normalize(userText);
  if (!text) return false;
  if (CREATION_PHRASES.some((p) => text.includes(p))) return true;
  return (
    CREATION_VERBS.some((v) => text.includes(v)) && DOMAIN_TERMS.some((t) => text.includes(t))
  );
}

/** Same path guard as the `readFile` tool (no traversal outside the repo). */
function isValidPath(path: string): boolean {
  return !path.startsWith('/') && !path.includes('..') && path.length > 0;
}

/**
 * Loads the skill metadata (frontmatter) from the site repo — used for the
 * cheap match check BEFORE pulling the full content. Returns null when the
 * skill is missing or has no `name`.
 */
export async function loadSkill(
  octokit: Octokit,
  repo: string,
  path: string,
  branch: string,
): Promise<SkillMeta | null> {
  if (!isValidPath(path)) return null;
  const file = await getFileContent(octokit, repo, path, branch);
  if (!file) return null;
  const meta = parseFrontmatter(file.content);
  if (!meta.name) return null;
  return { path, name: meta.name, description: meta.description ?? '' };
}

/** Loads the full skill (frontmatter stripped) for prompt injection. */
export async function loadSkillContent(
  octokit: Octokit,
  repo: string,
  path: string,
  branch: string,
): Promise<ActiveSkill | null> {
  if (!isValidPath(path)) return null;
  const file = await getFileContent(octokit, repo, path, branch);
  if (!file) return null;
  const meta = parseFrontmatter(file.content);
  if (!meta.name) return null;
  const content = file.content.replace(FRONTMATTER_RE, '').trim();
  if (!content) return null;
  return { path, name: meta.name, description: meta.description ?? '', content };
}
