import { Octokit } from '@octokit/rest';

/**
 * "Direct Git API" engine — zero direct commits to `main`.
 *
 * Everything runs on Cloudflare Compute via Octokit's Git API:
 *   1. `git.getRef`       → SHA of the base branch (main) ;
 *   2. `git.createTree`   → full Git tree built IN MEMORY (base_tree + blobs) ;
 *   3. `git.createCommit` → commit parented on main ;
 *   4. `git.createRef`    → draft branch `draft/*` ;
 *   5. `pulls.create`     → Pull Request (triggers the Cloudflare Pages preview build).
 *
 * All in ~1-2 seconds. Merging to `main` is only possible via `/api/merge`
 * (squash & merge) after human validation on the preview.
 */

export interface DraftFile {
  path: string;
  content: string;
}

export interface DraftResult {
  branch: string;
  prNumber: number;
  prUrl: string;
  commitSha: string;
  treeSha: string;
  baseSha: string;
  createdAt: string;
}

export type PRState = 'pending' | 'in_progress' | 'success' | 'error' | 'merged';

export interface PRStatus {
  prNumber: number;
  prUrl: string;
  branch: string;
  headSha: string;
  state: PRState;
  previewUrl: string | null;
  merged: boolean;
  updatedAt: string;
}

export function createOctokit(pat: string): Octokit {
  return new Octokit({ auth: pat });
}

function splitRepo(repo: string): { owner: string; repoName: string } {
  const [owner, repoName] = repo.split('/');
  if (!owner || !repoName) throw new Error(`Invalid repo: ${repo} (expected "owner/repo")`);
  return { owner, repoName };
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'draft'
  );
}

export async function getDefaultBranch(octokit: Octokit, repo: string): Promise<string> {
  const { owner, repoName } = splitRepo(repo);
  const { data } = await octokit.repos.get({ owner, repo: repoName });
  return data.default_branch;
}

/**
 * Creates the `draft/*` branch + the Pull Request in one atomic pass.
 * Never touches `main`.
 */
export async function createDraftPR(
  octokit: Octokit,
  repo: string,
  files: DraftFile[],
  opts: { title: string; body: string; base?: string },
): Promise<DraftResult> {
  const { owner, repoName } = splitRepo(repo);
  const base = opts.base ?? 'main';
  const createdAt = new Date().toISOString();

  // 1. Current SHA of the base branch
  const { data: baseRef } = await octokit.git.getRef({
    owner,
    repo: repoName,
    ref: `heads/${base}`,
  });
  const baseSha = baseRef.object.sha;

  const branch = `draft/${slugify(opts.title)}-${Date.now().toString(36)}`;

  // 2. Git tree built in memory (no local checkout)
  const { data: tree } = await octokit.git.createTree({
    owner,
    repo: repoName,
    base_tree: baseSha,
    tree: files.map((file) => ({
      path: file.path,
      mode: '100644' as const,
      type: 'blob' as const,
      content: file.content,
    })),
  });

  // 3. Commit parented on main
  const { data: commit } = await octokit.git.createCommit({
    owner,
    repo: repoName,
    message: opts.title,
    tree: tree.sha,
    parents: [baseSha],
  });

  // 4. Draft branch
  await octokit.git.createRef({
    owner,
    repo: repoName,
    ref: `refs/heads/${branch}`,
    sha: commit.sha,
  });

  // 5. Pull Request (triggers the Cloudflare Pages build on the PR)
  const { data: pr } = await octokit.pulls.create({
    owner,
    repo: repoName,
    title: opts.title,
    head: branch,
    base,
    body: opts.body,
  });

  return {
    branch,
    prNumber: pr.number,
    prUrl: pr.html_url,
    commitSha: commit.sha,
    treeSha: tree.sha,
    baseSha,
    createdAt,
  };
}

function mapDeploymentState(state: string): PRState {
  switch (state) {
    case 'success':
      return 'success';
    case 'error':
    case 'failure':
      return 'error';
    case 'in_progress':
      return 'in_progress';
    default:
      return 'pending';
  }
}

/**
 * PR status + Cloudflare Pages preview link.
 *
 * Preview discovery strategy:
 *  1. GitHub Deployments (`repos.listDeployments` on the head SHA) → status +
 *     `environment_url` / `target_url` of the cloudflare-pages deployment ;
 *  2. Fallback: Check Runs (`checks.listForRef`) with the Cloudflare Pages app.
 */
export async function getPRStatus(octokit: Octokit, repo: string, prNumber: number): Promise<PRStatus> {
  const { owner, repoName } = splitRepo(repo);
  const { data: pr } = await octokit.pulls.get({ owner, repo: repoName, pull_number: prNumber });

  if (pr.merged) {
    return {
      prNumber,
      prUrl: pr.html_url,
      branch: pr.head.ref,
      headSha: pr.head.sha,
      state: 'merged',
      previewUrl: null,
      merged: true,
      updatedAt: pr.updated_at,
    };
  }

  let previewUrl: string | null = null;
  let state: PRState = 'pending';

  // Strategy 1 — Deployments
  try {
    const { data: deployments } = await octokit.repos.listDeployments({
      owner,
      repo: repoName,
      sha: pr.head.sha,
    });
    const cfDeployment = deployments.find((d) =>
      /cloudflare|pages|preview/i.test(d.environment ?? ''),
    );
    if (cfDeployment) {
      const { data: statuses } = await octokit.repos.listDeploymentStatuses({
        owner,
        repo: repoName,
        deployment_id: cfDeployment.id,
      });
      const latest = statuses[0];
      if (latest) {
        previewUrl = latest.environment_url ?? latest.target_url ?? null;
        state = mapDeploymentState(latest.state);
      }
    }
  } catch {
    // Deployments API unavailable → fall through
  }

  // Strategy 2 — Cloudflare Pages Check Runs
  if (!previewUrl && state !== 'error') {
    try {
      const { data: runs } = await octokit.checks.listForRef({
        owner,
        repo: repoName,
        ref: pr.head.sha,
      });
      const cfRun = runs.check_runs.find((run) =>
        /cloudflare/i.test(`${run.app?.slug ?? ''} ${run.name ?? ''}`),
      );
      if (cfRun) {
        if (cfRun.details_url) previewUrl = cfRun.details_url;
        state =
          cfRun.status === 'completed'
            ? cfRun.conclusion === 'success'
              ? 'success'
              : 'error'
            : 'in_progress';
      }
    } catch {
      // ignore
    }
  }

  return {
    prNumber,
    prUrl: pr.html_url,
    branch: pr.head.ref,
    headSha: pr.head.sha,
    state,
    previewUrl,
    merged: false,
    updatedAt: pr.updated_at,
  };
}

export interface MergeResult {
  merged: boolean;
  sha: string | null;
  message: string | null;
}

/** Squash & merge to `main`, then deletes the temporary `draft/*` branch. */
export async function mergePR(
  octokit: Octokit,
  repo: string,
  prNumber: number,
  method: 'squash' | 'merge' | 'rebase' = 'squash',
): Promise<MergeResult> {
  const { owner, repoName } = splitRepo(repo);
  const { data: pr } = await octokit.pulls.get({ owner, repo: repoName, pull_number: prNumber });

  const { data: result } = await octokit.pulls.merge({
    owner,
    repo: repoName,
    pull_number: prNumber,
    merge_method: method,
  });

  if (result.merged) {
    await octokit.git
      .deleteRef({ owner, repo: repoName, ref: `heads/${pr.head.ref}` })
      .catch(() => undefined);
  }

  return {
    merged: result.merged,
    sha: result.sha ?? null,
    message: result.message ?? null,
  };
}
