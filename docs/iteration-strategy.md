# Content iteration strategy

> **Status**: decision recorded — current approach in production; Option C is a
> documented future evolution, **not implemented yet**.

## Context

The studio's core workflow is *iterative*: the AI generates content, the human
adjusts it in the chat, then creates a preview and publishes **once**. The
question is where the in-between "draft state" lives and when it hits git.

## Decision (current — Approach A)

The draft lives **in memory** (`state.payload` in the browser) and is sent with
each chat message as the edit base. A single PR is created at the end
("Créer la pré-visualisation"). The repo is never touched between messages.

Why:

- one PR = one review, one preview build, one publish, no ordering issues ;
- the Diff view compares against the repo original — the whole change is
  reviewed at once ;
- fast iteration (no git calls per message) ;
- targeted **PATCH edits** (search/replace) keep the AI output tiny, so large
  pages never hit the model output limit.

## Comparison

| Criterion | A. In-memory draft (current) | B. One PR per change | C. Hybrid (persisted draft) |
|---|---|---|---|
| Where the state lives | Browser | Git branches | Browser + durable storage |
| Final PR | 1 | 1 per change | 1 |
| Review diff | clean, vs repo original | 1 diff per step | clean |
| Memory pressure | draft re-sent per message | none | low (conditional context) |
| State loss (refresh/crash) | ⚠️ lost | none | none |
| Ordering problem | none | ⚠️ yes (stacked branches) | none |
| Preview builds | 1 | 1 per change (slow) | 1 |
| Git noise | none | high | none |

**Option B** (a PR per change) is rejected for the production workflow: merging
order becomes critical (branches drift from `main`), each change triggers a
preview build, and the human reviews N PRs instead of one. It only makes sense
with stacked-PR tooling (Graphite-style) — out of scope.

## Future evolution — Option C (hybrid, durable draft)

To be activated **when** the in-memory draft becomes a real limitation (very
large multi-page drafts, long editing sessions, refresh/crash resistance),
without changing the publication workflow:

### C1 — Persist the draft client-side

- Store `state.payload` in `sessionStorage` (survives refresh, cleared at end
  of session) or `localStorage` (survives browser restarts) ;
- Restore on load: `getState().payload` is hydrated before the chat renders,
  the workspace shows the draft again and the stepper stays enabled ;
- Cheap, no server change. `sessionStorage` is the recommended default.

### C2 — Conditional draft context (token savings)

- Only attach the full draft files to the chat messages when the message is an
  **adjustment** of the current draft (i.e., a payload exists) ;
- For a plain conversation, omit the draft block ;
- Optionally: send only the **changed/active files** when the draft is huge,
  with a note listing the omitted files' paths.

### C3 — Server-side KV snapshot (cross-device)

- Save the draft JSON to Cloudflare KV (`draft:{siteId}`) debounced (e.g.,
  5 s after the last change) ;
- Restore endpoint (`GET /api/draft`) on login / page load ;
- Security: the draft may contain content to be published — KV access is
  already scoped by site and session. Plaintext content in KV is acceptable
  (content is not a secret); alternatively encrypt with the vault master key.

### C4 — `draft/workspace` git backup (team visibility, no PR noise)

- When the user enables it (or automatically every N changes), push the current
  draft to a single **`draft/workspace`** branch (updated in place via
  `git.createTree`/`git.createCommit`/`git.updateRef` — no PR) ;
- Gives collaborators visibility of the intermediate state in git **without**
  the ordering problem of Option B (no PR, no merge until the end) ;
- On "Créer la pré-visualisation": either create the PR from the final payload
  (as today) or from `draft/workspace` if it is in sync ;
- Cleanup: the workspace branch is force-updated, and can be deleted after the
  PR is created.

## Checkpoint flow (manual, already available)

If the draft grows beyond comfort, the operator can create the PR and **merge
it**, then continue — the next iteration naturally starts from the merged repo
(the generator reads the repo/draft as the edit base). This is the zero-code
fallback today.

## Activation triggers

Activate C1 always (trivial win). Activate C3/C4 only if:

- editing sessions regularly exceed browser memory / chat context limits ;
- refresh/crash data loss has been observed ;
- collaborators need to see intermediate states in git.

## Non-goals

- Stacked per-change PRs (Option B) — rejected.
- A full CMS-backed content store (database) — the repo remains the single
  source of truth for content.
