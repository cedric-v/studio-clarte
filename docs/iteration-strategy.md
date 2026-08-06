# Content iteration strategy

> **Status**: decision recorded — current approach in production. **C1 is
> implemented** (sessionStorage draft persistence); C2–C4 remain documented
> future steps.

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

### C1 — Persist the draft client-side ✅ *implemented*

- The shared state (`messages`, `payload`, `workflow`) is persisted to
  `sessionStorage` on every mutation (`persistState()`) and restored on load
  (`getState()` hydrates it before the chat renders) ;
- After a refresh: the chat history, the draft files (workspace + stepper stay
  enabled) and an open PR are restored — the stepper resumes polling the
  preview automatically ;
- The PR button stays disabled once a PR exists (same as before a refresh), so
  no duplicate PR is created accidentally ;
- **Per-tab by design** (`sessionStorage`) — survives refresh, cleared when the
  tab closes ; `localStorage` is not used (sharing across tabs would be C3) ;
- **Best effort on quota**: if the storage limit is hit (large base64 image
  previews), the message image previews are stripped and the write is retried ;
  a draft with very large embedded base64 images may exceed the ~5 MB limit and
  fall back to the current behavior (no persistence) — acceptable for now.

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

C1 is active (trivial win, no downside). Activate C2 (conditional draft
context) and C3 (KV snapshot) only if:

- editing sessions regularly exceed the chat context / browser memory limits ;
- cross-tab or cross-device continuity is needed (C3) ;
- collaborators need to see intermediate states in git (C4).

## C5 — Visual verification of previews (candidate, not yet needed)

> Architecture-level view: see **E1/E2 in [`architecture.md`](architecture.md)** —
> this section keeps the iteration-workflow angle.

**Gap today**: the Studio detects that a preview *built* (GitHub check runs /
`buildUrl`) but cannot *see* the rendered page. The agent never looks at the
actual output.

**Cheap step (recommended first)**: a screenshot utility that captures the
preview URL with a headless browser (Cloudflare Browser Rendering API, or a
small external screenshot service), stores the PNG in the site's R2 bucket,
and shows a **thumbnail in the publication panel / Diff tab**. Workers are
entirely sufficient for this — it is just a render-and-store job.

**Heavier step (only if the agent must interact — clicks, forms, extracting
rendered text)**: `@cloudflare/computer` (early preview, per-agent sandboxed
runtime with filesystem/shell/packages). Considerations before adopting:

- the project deliberately runs code on the **client's CI** (isolation,
  reviewability, zero shared compute) — giving the agent a platform computer
  adds a new execution surface, so scope it to *reading/verifying previews*
  only, never to write directly to repos;
- early-preview API stability and per-second pricing for many concurrent
  client sessions need evaluation;
- do **not** use it as a replacement for the GitHub-API hands (file writes
  must stay reviewable via PRs).

**Verdict**: Workers are sufficient for the current pipeline. Re-evaluate
C5 when visual checks or browser interaction become a client-visible
requirement.

## Non-goals

- Stacked per-change PRs (Option B) — rejected.
- A full CMS-backed content store (database) — the repo remains the single
  source of truth for content.
- Running client builds inside the Studio (npm install per site/toolchain):
  builds stay on the client's CI where they are already validated.
