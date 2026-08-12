# Studio Clarté — Architecture

This document describes the system as it is **today**, the **key decisions**
behind it, and the **future evolutions** we are considering (with the need each
would fulfill). Design rationale for the draft/iteration workflow lives in
[`iteration-strategy.md`](iteration-strategy.md); this document is the
architecture-level view.

## High-level flow

```
Client (browser)                Worker (edge)                       External
─────────────────               ────────────────                    ────────
Chat / editor  ──▶ /api/chat ──▶ generator loop ──▶ DeepSeek (LLM, one call per file)
                                   │
                                   ├─▶ GitHub API: listFiles/readFile (site repo)
                                   ├─▶ patch mode: {search, replace} on existing files
                                   └─▶ stream: plan → per-file progress → final payload
                                          │
Draft (KV-backed, out-of-band) ◀─ payload marker ─┘
   │                     (chat streams progress + [[PAYLOAD:token]] only)
   │
Review (diff + editor) ◀─ /api/draft/:token (full payload)
   │       └── preview ──▶ GitHub Actions/Pages (client infra)
   │                                     └─ poll check runs / buildUrl
Publish ──▶ /api/commit-draft ──▶ branch draft/* + PR (never main)
         ──▶ /api/merge ──▶ CI passes ──▶ merge ──▶ production build
```

## Components

| Component | Role | Tech |
|---|---|---|
| **Generator** | plan → one DeepSeek call per file, patch mode, final payload | `src/lib/generator.ts`, `ai.ts` |
| **GitHub hands** | read/write site files, PRs, status | Octokit v22 (REST/GraphQL, edge) |
| **Registry** | multi-tenant sites from env vars (`SITE_DOMAINS`, `SITE_OVERRIDES`) | `src/config/sites.ts` — new clients = vars in the gitignored `wrangler.jsonc` |
| **Vault** | per-site keys, encrypted, write-only | AES-256-GCM, `VAULT_MASTER_KEY` |
| **Storage** | images → client's R2 (or git fallback) | presigned uploads, R2 |
| **State** | in-memory draft persisted in `sessionStorage` (C1) + KV-backed out-of-band payload delivery (`/api/draft/:token`) | `src/lib/client-state.ts`, `src/pages/api/draft/[token].ts` |
| **Preview** | GitHub check runs → `buildUrl` polling | GitHub Actions / Pages (client repo) |
| **i18n / UX** | FR/EN, stepper 2 étapes, diff-first, « Ouvrir » | vanilla, Astro SSR on Workers |

## Key decisions (ADR-lite)

1. **Workers-only runtime, no server beyond the edge.** All orchestration
   (generation, GitHub API, status polling) runs in the Worker — no VMs, no
   containers to operate.
2. **The GitHub API is the agent's "hands", not a sandbox.** The agent reads
   and writes repo files via the API; **it never executes code**. All builds,
   tests and previews run on the **client's CI** (GitHub Actions / Pages) —
   per-tenant isolation, reviewability, zero shared compute.
3. **Zero direct commits on `main`.** Every change goes through a branch
   `draft/*` + a single final PR. The client validates and merges.
4. **Configuration split (single source of truth).** The gitignored local
   `wrangler.jsonc` holds **all plain vars** (KV id, `SESSION_TTL_SECONDS`,
   `AGENCY_DOMAIN`, `SITE_DOMAINS`, `SITE_OVERRIDES`); secrets live at the
   worker level via `wrangler secret put`. ⚠️ In the Workers **Versions**
   model, plain vars are part of each version: vars set only in the dashboard
   are silently dropped on the next `wrangler deploy` (broke
   `studio.cedricv.com` twice with "Domain not configured" 404s) — hence
   vars live in the config file, secrets at the worker level
   (`wrangler secret put`). A deploy-time guard (`scripts/verify-deploy.mjs`,
   wired into `npm run deploy`) fails loudly if the required vars are missing
   or the live site answers "Domain not configured".
5. **No webmaster bucket.** Storage is per-client (their own R2, or git).
   Global keys fall back only for the agency site.
6. **One final PR per session** (Approach A), not stacked per-change PRs.
   **Draft hygiene**: at most ONE open `draft/*` PR per site — creating a new
   preview auto-closes any previous open draft PR and deletes its branch;
   an explicit **« Annuler la preview »** action (POST `/api/cancel-preview`)
   covers the discard-without-replacement case. The repo never accumulates
   stale preview PRs. (No cron cleanup: every git action runs with the
   logged-in collaborator's OAuth token — no server-side service token.)
7. **Draft iteration**: plan → patch per file → final payload; the draft is
   sent back on every message (C1 active).
8. **Dependency maintenance (Renovate, automerged minors).**
   `renovate.json` automerges **minor/patch** updates (deps + devDeps) once
   the CI gate (`.github/workflows/ci.yml` — `astro check` + build) is green ;
   **majors stay manual PRs**. `typescript` is capped at `< 7`: TS 7 is the
   new native compiler, not yet supported by the Astro/Volar toolchain
   (`@astrojs/check` peer `^5 || ^6`).
9. **Large payloads are delivered out of band (KV draft store).** The chat
   stream carries progress + a compact `[[PAYLOAD:<uuid>]]` marker ; the full
   payload (full file contents ≈ 15-30 KB) is stored in KV (2h TTL) and
   fetched by the client via `/api/draft/:token` (unguessable UUID =
   capability, same pattern as the presigned R2 URLs). Streaming a 30 KB JSON
   through the long-lived chat response truncated in production ("Réponse
   tronquée"); the marker is immune. The store is also a first step toward
   C3 (cross-device draft persistence, `docs/iteration-strategy.md`).

## Why not `@cloudflare/computer` for generation/iteration?

`@cloudflare/computer` (a VM with filesystem/shell/browser for the agent) is
candidate **E2** — but it does **not** address this failure class: the
iteration problem was the **model output size + a giant JSON streamed through
one chat response**, both independent of any runtime. The out-of-band draft
store (ADR 9) fixes it without new infrastructure. A computer runtime would
only earn its place for tasks that genuinely need one: rendering the preview
headlessly, running client builds, or verifying visual regressions (E1/E2),
not for text edits.

## Security model

- Multi-tenant isolation: each client has its own registry entry, R2, and
  vault keys; the Super-Admin switcher is the only cross-site view.
- Vault is write-only (keys masked `sk-••••••••1234`); the master key is a
  Worker secret.
- GitHub OAuth: authorization = **repo access** (the account must be owner/
  collaborator on the site repo, checked at login) ; an optional **per-site**
  allow-list (`ALLOWED_GITHUB_LOGINS` in the site vault) can restrict further
  (the global env var applies to the agency only).
- Gitleaks pre-commit/pre-push hooks; security headers in middleware.
- Previews never touch production; publishing is PR-gated by human validation.

## Future evolutions

Candidates are listed with the **need they would fulfill** and the trigger
that would justify adopting them. See [`iteration-strategy.md`](iteration-strategy.md)
for the detailed C1–C4 designs (C1 is already active).

### E1 — Visual verification of previews (candidate)
- **Need**: today the Studio knows a preview *built* (check runs / `buildUrl`)
  but the agent and the client **cannot see the rendered page**. Visual bugs
  (broken CSS, missing images, layout) are only caught after publishing.
- **Cheap step first**: a screenshot job — headless browser renders the
  preview URL (Cloudflare Browser Rendering API, or a small external service)
  → PNG stored in the site's R2 → **thumbnail in the Diff tab / publication
  panel**. Workers are sufficient; no new runtime.
- **Trigger**: a client asks for visual confirmation before validating, or
  rendering bugs recur.

### E2 — Agent compute runtime (`@cloudflare/computer`, candidate)
- **Need**: gives an agent a real "computer" (filesystem, shell, packages,
  browser) — only justified if the agent must **interact** with the preview
  (clicks, forms, extracting rendered content) or run checks beyond what a
  screenshot provides. This is the feature referenced by the repo topic
  `cloudflare-computer`.
- **Why not now**: the architecture deliberately keeps the agent hands as the
  GitHub API and execution on the client's CI (decision 2). A platform
  computer adds a new execution surface — scope it to **reading/verifying
  previews only**, never to writing to repos (writes stay PR-gated). The SDK
  is an early preview: API stability and per-second pricing for many
  concurrent client sessions need evaluation.
- **Trigger**: visual/interactive verification becomes a client-visible
  requirement that screenshots cannot cover. On adoption, re-add the
  `cloudflare-computer` topic to the repo.

### C2–C4 (from iteration-strategy.md)
Conditional draft context (C2), KV snapshot for cross-device continuity (C3),
`draft/workspace` branch (C4) — activate only if sessions regularly hit
context/browser limits or cross-device continuity is required.

## Non-goals

- Stacked per-change PRs (Option B) — rejected.
- A full CMS-backed content store (database) — the repo remains the single
  source of truth for content.
- Running client builds inside the Studio (npm install per site/toolchain) —
  builds stay on the client's CI.
- Using the agent runtime as a write path to repos — writes remain
  PR-gated (see E2).
