/* Quick logic test for the rollback engine with a mocked Octokit. */
import { getBranchHistory, restoreToCommit, getParentSha } from '../src/lib/github-edge';

function mockOctokit(opts: {
  commits?: { sha: string; commit: { message: string; author: { date: string; name: string } }; author?: { login: string } }[];
  headSha?: string;
  targetTree?: string;
  headTree?: string;
  targetParents?: string[];
  behindBy?: number;
}): any {
  const state = {
    refSha: opts.headSha ?? 'head000',
    log: [] as string[],
  };
  return {
    state,
    repos: {
      listCommits: async () => ({ data: opts.commits ?? [] }),
      compareCommits: async ({ base }: { base: string }) => ({
        data: { behind_by: base === 'notancestor' ? 3 : (opts.behindBy ?? 0), ahead_by: 5, status: 'ahead' },
      }),
    },
    git: {
      getRef: async () => ({ data: { object: { sha: state.refSha } } }),
      getCommit: async ({ commit_sha }: { commit_sha: string }) => ({
        data: {
          sha: commit_sha,
          message: commit_sha === 'head000' ? 'HEAD commit' : 'Original commit message',
          tree: { sha: commit_sha === 'head000' ? (opts.headTree ?? 'headtree') : (opts.targetTree ?? 'targettree') },
          parents: (opts.targetParents ?? []).map((p) => ({ sha: p })),
        },
      }),
      createCommit: async ({ message, tree, parents }: any) => {
        state.log.push(`createCommit: "${message}" tree=${tree} parents=${parents.join(',')}`);
        return { data: { sha: 'revert000' } };
      },
      updateRef: async ({ ref, sha }: any) => {
        state.log.push(`updateRef: ${ref} -> ${sha}`);
        state.refSha = sha;
        return { data: {} };
      },
    },
  };
}

const repo = 'owner/repo';

// ── 1. getBranchHistory ───────────────────────────────────────────
{
  const octokit = mockOctokit({
    commits: [
      { sha: 'aabbcc', commit: { message: 'feat: hero', author: { date: '2026-01-02T10:00:00Z', name: 'Cédric' } }, author: { login: 'cedric-v' } },
      { sha: 'ddeeff', commit: { message: 'fix: typo', author: { date: '2026-01-01T10:00:00Z', name: 'Cédric' } } },
    ],
  });
  const history = await getBranchHistory(octokit, repo, 'main');
  console.assert(history.length === 2, 'history length');
  console.assert(history[0].shortSha === 'aabbcc' && history[0].author === 'cedric-v', 'history mapping');
  console.log('✓ getBranchHistory');
}

// ── 2. restoreToCommit happy path ──────────────────────────────────
{
  const octokit = mockOctokit({ headSha: 'head000', targetTree: 'targettree', behindBy: 0 });
  const result = await restoreToCommit(octokit, repo, 'target00', 'main');
  console.assert(result.sha === 'revert000', 'restore sha');
  const log = octokit.state.log.join('\n');
  console.assert(log.includes('tree=targettree'), 'tree is the TARGET tree');
  console.assert(log.includes('parents=head000'), 'parented on current HEAD');
  console.assert(log.includes('updateRef: heads/main -> revert000'), 'fast-forward updateRef');
  console.log('✓ restoreToCommit happy path\n' + octokit.state.log.join('\n'));
}

// ── 3. restoreToCommit rejects non-ancestor ───────────────────────
{
  const octokit = mockOctokit({ headSha: 'head000', behindBy: 0 });
  let threw = false;
  try {
    await restoreToCommit(octokit, repo, 'notancestor', 'main');
  } catch (error) {
    threw = /not in the history/.test((error as Error).message);
  }
  console.assert(threw, 'ancestor check rejects foreign commits');
  console.log('✓ restoreToCommit ancestor guard');
}

// ── 4. restoreToCommit rejects current HEAD ───────────────────────
{
  const octokit = mockOctokit({ headSha: 'head000' });
  let threw = false;
  try {
    await restoreToCommit(octokit, repo, 'head000', 'main');
  } catch (error) {
    threw = /already the current/.test((error as Error).message);
  }
  console.assert(threw, 'rejects restoring to HEAD itself');
  console.log('✓ restoreToCommit same-version guard');
}

// ── 5. getParentSha ───────────────────────────────────────────────
{
  const octokit = mockOctokit({ targetParents: ['parent00'] });
  const parent = await getParentSha(octokit, repo, 'mergesha');
  console.assert(parent === 'parent00', 'returns first parent');
  let threw = false;
  const rootOctokit = mockOctokit({ targetParents: [] });
  try {
    await getParentSha(rootOctokit, repo, 'rootsha');
  } catch (error) {
    threw = /Root commit/.test((error as Error).message);
  }
  console.assert(threw, 'rejects root commits');
  console.log('✓ getParentSha');
}

console.log('\nAll rollback engine checks passed ✅');
