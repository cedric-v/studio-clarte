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
  /** True when content is base64-encoded binary (committed via git.createBlob). */
  base64?: boolean;
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
  /** Link to the failing build (check run / Actions run) when the preview failed. */
  buildUrl: string | null;
  merged: boolean;
  updatedAt: string;
  /** Post-merge production deploy tracking (filled once the PR is merged). */
  prodState: 'unknown' | 'pending' | 'in_progress' | 'success' | 'error';
  prodUrl: string | null;
  /** Actions run on the merge commit — progress link while publishing. */
  runUrl: string | null;
  /** PR merge timestamp — post-merge deployments created after it are tracked. */
  mergedAt: string | null;
}

export function createOctokit(pat: string): Octokit {
  return new Octokit({ auth: pat });
}

/**
 * Lists the tracked file paths of the repo (recursive tree, blob entries).
 * Used by the AI `listFiles` tool so the model can locate files to edit.
 */
export async function listRepoFiles(
  octokit: Octokit,
  repo: string,
  ref?: string,
): Promise<string[]> {
  const { owner, repoName } = splitRepo(repo);
  const branch = ref ?? 'HEAD';
  const { data: refData } = await octokit.git.getRef({
    owner,
    repo: repoName,
    ref: `heads/${branch}`,
  });
  const { data: tree } = await octokit.git.getTree({
    owner,
    repo: repoName,
    tree_sha: refData.object.sha,
    recursive: '1',
  });
  return (tree.tree ?? [])
    .filter((entry) => entry.type === 'blob' && entry.path)
    .map((entry) => entry.path as string);
}

/**
 * Reads a text file from the repo (default branch). Returns null when the
 * file does not exist or is too large. Used by the AI `readFile` tool.
 */
export async function getFileContent(
  octokit: Octokit,
  repo: string,
  path: string,
  ref?: string,
): Promise<{ content: string; size: number } | null> {
  const { owner, repoName } = splitRepo(repo);
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo: repoName,
      path,
      ref,
    });
    if (Array.isArray(data) || data.type !== 'file' || typeof data.content !== 'string') {
      return null;
    }
    const binary = atob(data.content);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { content: new TextDecoder().decode(bytes), size: data.size };
  } catch {
    return null;
  }
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
 * Closes an OPEN draft PR (with a short comment) and deletes its `draft/*`
 * head branch. Used by the explicit "cancel preview" action and by the
 * auto-cleanup when a new draft replaces a previous one. No-op when the PR
 * is already closed or merged.
 */
export async function closeDraftPR(
  octokit: Octokit,
  repo: string,
  prNumber: number,
  reason = 'Fermée depuis Studio Clarté (preview annulée).',
): Promise<void> {
  const { owner, repoName } = splitRepo(repo);
  const { data: pr } = await octokit.pulls.get({ owner, repo: repoName, pull_number: prNumber });
  if (pr.state !== 'open') return; // already closed/merged — nothing to do

  await octokit.issues.createComment({
    owner,
    repo: repoName,
    issue_number: prNumber,
    body: reason,
  });
  await octokit.pulls.update({
    owner,
    repo: repoName,
    pull_number: prNumber,
    state: 'closed',
  });
  // Best-effort: the head branch may already have been deleted by hand
  // (GitHub then reports `head.ref` as null).
  if (pr.head?.ref) {
    await octokit.git
      .deleteRef({ owner, repo: repoName, ref: `heads/${pr.head.ref}` })
      .catch(() => undefined);
  }
}

/**
 * Draft hygiene: closes every OPEN `draft/*` PR of the repo and deletes its
 * branch — so a site never accumulates stale preview PRs ("poubelle").
 * ONLY head branches prefixed `draft/` are touched (never other branches).
 * Best-effort: failures are logged, never fatal. Returns the number of PRs
 * that were closed.
 */
export async function cleanupStaleDrafts(
  octokit: Octokit,
  repo: string,
  base: string,
): Promise<number> {
  const { owner, repoName } = splitRepo(repo);
  const { data: pulls } = await octokit.pulls.list({
    owner,
    repo: repoName,
    state: 'open',
    base,
    per_page: 50,
  });
  const stale = pulls.filter((pr) => pr.head?.ref?.startsWith('draft/'));
  for (const pr of stale) {
    try {
      await closeDraftPR(octokit, repo, pr.number);
      console.log(`[github] closed stale draft PR #${pr.number} (${pr.head?.ref})`);
    } catch (error) {
      console.warn(`[github] failed to close stale draft PR #${pr.number}`, error);
    }
  }
  return stale.length;
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

  // Draft hygiene: a new draft REPLACES any previous open one — close the
  // stale `draft/*` PRs and delete their branches so the repo stays clean
  // (at most one open preview PR per site at any time). Best-effort: if the
  // cleanup fails, the new draft is still created.
  try {
    await cleanupStaleDrafts(octokit, repo, base);
  } catch (error) {
    console.warn('[github] draft cleanup skipped:', error);
  }

  // 1. Current SHA of the base branch
  const { data: baseRef } = await octokit.git.getRef({
    owner,
    repo: repoName,
    ref: `heads/${base}`,
  });
  const baseSha = baseRef.object.sha;

  const branch = `draft/${slugify(opts.title)}-${Date.now().toString(36)}`;

  // 2. Git tree built in memory (no local checkout)
  //    - binary files (base64) are first materialized as blobs via createBlob ;
  //    - text files are embedded directly in the tree.
  const treeItems: { path: string; mode: '100644'; type: 'blob'; content?: string; sha?: string }[] = [];
  for (const file of files) {
    if (file.base64) {
      const { data: blob } = await octokit.git.createBlob({
        owner,
        repo: repoName,
        content: file.content,
        encoding: 'base64',
      });
      treeItems.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
    } else {
      treeItems.push({ path: file.path, mode: '100644', type: 'blob', content: file.content });
    }
  }
  const { data: tree } = await octokit.git.createTree({
    owner,
    repo: repoName,
    base_tree: baseSha,
    tree: treeItems,
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
    // Post-merge: track the production deploy (client CI) instead of declaring
    // success at merge time — the deploy only happens if quality passes on main.
    const prod = await getProductionDeployState(
      octokit,
      repo,
      pr.merged_at ?? null,
      pr.merge_commit_sha ?? null,
    );
    return {
      prNumber,
      prUrl: pr.html_url,
      branch: pr.head.ref,
      headSha: pr.head.sha,
      state: 'merged',
      previewUrl: null,
      buildUrl: null,
      merged: true,
      updatedAt: pr.updated_at,
      prodState: prod.state,
      prodUrl: prod.url,
      runUrl: prod.runUrl,
      mergedAt: pr.merged_at ?? null,
    };
  }

  let previewUrl: string | null = null;
  let buildUrl: string | null = null;
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
      // statuses are newest-first. GitHub marks a deployment 'inactive' when a
      // newer one supersedes it (same environment) — that status carries no
      // URL. Skip inactive statuses and take the newest one that still carries
      // the preview URL (fallback: newest non-inactive, then statuses[0]).
      const latest =
        statuses.find((s) => s.state !== 'inactive' && (s.environment_url || s.target_url)) ??
        statuses.find((s) => s.state !== 'inactive') ??
        statuses[0];
      if (latest) {
        previewUrl = latest.environment_url ?? latest.target_url ?? null;
        state = mapDeploymentState(latest.state);
      }
    }
  } catch {
    // Deployments API unavailable → fall through
  }

  // Strategy 2 — Check Runs (Cloudflare Pages OR the GitHub Actions preview
  // workflow, e.g. "Preview (draft PR)"): a FAILED run must surface clearly.
  if (!previewUrl && state !== 'error') {
    try {
      const { data: runs } = await octokit.checks.listForRef({
        owner,
        repo: repoName,
        ref: pr.head.sha,
      });
      const relevant = runs.check_runs.find((run) =>
        /cloudflare|pages|preview/i.test(`${run.app?.slug ?? ''} ${run.name ?? ''}`),
      );
      if (relevant) {
        if (relevant.status === 'completed') {
          if (relevant.conclusion === 'success') {
            state = 'success';
          } else {
            state = 'error';
            buildUrl = relevant.details_url ?? relevant.html_url ?? null;
          }
        } else {
          state = 'in_progress';
        }
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
    buildUrl,
    merged: false,
    updatedAt: pr.updated_at,
    prodState: 'unknown',
    prodUrl: null,
    runUrl: null,
    mergedAt: null,
  };
}

/**
 * Post-merge production deploy tracking.
 *
 * After a PR is merged to `main`, the client's CI runs the quality checks and
 * the deploy-to-prod job (which creates a GitHub Deployment with environment
 * 'production' and the live URL). This helper returns the state of that
 * deployment, or falls back to the merge commit's check runs so a failed gate
 * (deploy skipped) is still reported as an error.
 */
export async function getProductionDeployState(
  octokit: Octokit,
  repo: string,
  mergedAt: string | null,
  mergeSha: string | null,
): Promise<{
  state: 'pending' | 'in_progress' | 'success' | 'error';
  url: string | null;
  /** Actions run URL on the merge commit — shown as the progress link. */
  runUrl: string | null;
}> {
  const { owner, repoName } = splitRepo(repo);

  // Check runs on the merge commit: the progress link (runUrl) + failure
  // detection (a failed gate = the deploy job was skipped).
  let runUrl: string | null = null;
  let gateFailed = false;
  if (mergeSha) {
    try {
      const { data: runs } = await octokit.checks.listForRef({
        owner,
        repo: repoName,
        ref: mergeSha,
      });
      const failed = runs.check_runs.find((run) =>
        ['failure', 'timed_out', 'action_required'].includes(run.conclusion ?? ''),
      );
      if (failed) {
        gateFailed = true;
        runUrl = failed.details_url ?? failed.html_url ?? null;
      } else {
        const first = runs.check_runs[0];
        runUrl = first?.details_url ?? first?.html_url ?? null;
      }
    } catch {
      // ignore — keep pending
    }
  }

  // 1. Latest production deployment created AFTER the merge.
  if (mergedAt) {
    try {
      const { data: deployments } = await octokit.repos.listDeployments({
        owner,
        repo: repoName,
      });
      const mergedMs = Date.parse(mergedAt);
      const postMerge = deployments.filter((d) => {
        if (!d.created_at) return false;
        const created = Date.parse(d.created_at);
        return Number.isFinite(mergedMs) && Number.isFinite(created) ? created >= mergedMs : false;
      });
      // Prefer the deployment whose environment clearly names production
      // (handles 'production', 'Production', 'prod', 'deploy', 'live'…),
      // otherwise fall back to the newest post-merge deployment.
      const post =
        postMerge.find((d) => /production|prod|deploy|live/i.test(d.environment ?? '')) ??
        postMerge[0];
      if (post) {
        const { data: statuses } = await octokit.repos.listDeploymentStatuses({
          owner,
          repo: repoName,
          deployment_id: post.id,
        });
        const latest = statuses[0];
        if (!latest) return { state: 'in_progress', url: null, runUrl };
        const url = latest.environment_url ?? latest.target_url ?? null;
        if (latest.state === 'success') return { state: 'success', url, runUrl };
        if (latest.state === 'error' || latest.state === 'failure')
          return { state: 'error', url, runUrl };
        return { state: 'in_progress', url, runUrl };
      }
    } catch {
      // API hiccup → fall through to check runs, keep polling.
    }
  }

  // 2. No post-merge deployment yet → a failed gate on the merge commit means
  //    the deploy job was skipped.
  if (gateFailed) return { state: 'error', url: null, runUrl };
  return { state: 'pending', url: null, runUrl };
}

export interface MergeResult {
  merged: boolean;
  sha: string | null;
  message: string | null;
}

// ─────────────────────────────────────────────────────────────────────
// ROLLBACK ENGINE — "time machine" for production versions.
//
// UX 2026 principles implemented here:
//   • NON-DESTRUCTIVE: a rollback is a NEW commit (tree = target version),
//     history is never rewritten, nothing is deleted. The revert itself is
//     versioned and can itself be reverted.
//   • FAST RECOVERY: the revert commit is written directly to `main`
//     (human-confirmed action) so Cloudflare Pages rebuilds production
//     immediately — no PR cycle while the site is down.
//   • AUDITABLE: the commit message records the restored version SHA.
// ─────────────────────────────────────────────────────────────────────

export interface BranchCommit {
  sha: string;
  shortSha: string;
  /** First line of the commit message. */
  message: string;
  /** ISO timestamp of the authoring date. */
  date: string;
  author: string;
}

/** Recent commits on a branch (newest first) — powers the version history list. */
export async function getBranchHistory(
  octokit: Octokit,
  repo: string,
  branch: string,
  limit = 10,
): Promise<BranchCommit[]> {
  const { owner, repoName } = splitRepo(repo);
  const { data } = await octokit.repos.listCommits({
    owner,
    repo: repoName,
    sha: branch,
    per_page: limit,
  });
  return data.map((commit) => ({
    sha: commit.sha,
    shortSha: commit.sha.slice(0, 7),
    message: (commit.commit?.message ?? '').split('\n')[0].trim() || '(no message)',
    date: commit.commit?.author?.date ?? commit.commit?.committer?.date ?? '',
    author: commit.author?.login ?? commit.commit?.author?.name ?? 'unknown',
  }));
}

export interface RestoreResult {
  sha: string;
  shortSha: string;
  message: string;
}

/**
 * Restores the branch content to the state of a previous version.
 *
 * The target must be an ancestor of the current HEAD (a version that is
 * actually in this branch's past) — verified via `compareCommits`.
 * The branch then points to a NEW commit whose tree is exactly the target
 * version's tree: content restored in one step, history preserved.
 */
export async function restoreToCommit(
  octokit: Octokit,
  repo: string,
  targetSha: string,
  branch: string,
): Promise<RestoreResult> {
  const { owner, repoName } = splitRepo(repo);
  const { data: ref } = await octokit.git.getRef({
    owner,
    repo: repoName,
    ref: `heads/${branch}`,
  });
  const headSha = ref.object.sha;

  if (targetSha === headSha) {
    throw new Error('This version is already the current one');
  }

  // Safety: the target must belong to this branch's history (ancestor check).
  const { data: comparison } = await octokit.repos.compareCommits({
    owner,
    repo: repoName,
    base: targetSha,
    head: headSha,
  });
  if (comparison.behind_by !== 0) {
    throw new Error('Target version is not in the history of this branch');
  }

  const { data: target } = await octokit.git.getCommit({
    owner,
    repo: repoName,
    commit_sha: targetSha,
  });
  const originalTitle = (target.message ?? '').split('\n')[0].trim();
  const message = `revert: restore to ${targetSha.slice(0, 7)} — ${originalTitle}`;

  // New commit with the TARGET tree, parented on the current HEAD
  // (fast-forward update — no history rewrite, no force push).
  const { data: commit } = await octokit.git.createCommit({
    owner,
    repo: repoName,
    message,
    tree: target.tree.sha,
    parents: [headSha],
  });
  await octokit.git.updateRef({
    owner,
    repo: repoName,
    ref: `heads/${branch}`,
    sha: commit.sha,
    force: false,
  });

  return { sha: commit.sha, shortSha: commit.sha.slice(0, 7), message };
}

/** First parent SHA of a commit (the version it was based on). */
export async function getParentSha(octokit: Octokit, repo: string, sha: string): Promise<string> {
  const { owner, repoName } = splitRepo(repo);
  const { data: commit } = await octokit.git.getCommit({
    owner,
    repo: repoName,
    commit_sha: sha,
  });
  const parent = commit.parents[0]?.sha;
  if (!parent) throw new Error('Root commit cannot be reverted');
  return parent;
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
