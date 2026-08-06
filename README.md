# Studio Clarté — AI content studio for static sites

> **Generate. Review. Preview. Publish.** — an open-source AI content studio for
> static sites (Astro, Eleventy, any static stack). Built for **single site
> owners** and for **agencies running a white-label service for many clients**
> (multi-tenant by design). The AI does the heavy lifting, a human keeps the
> final say, and every change goes through a safe preview → publish pipeline.

**Stack** : Astro SSR on Cloudflare Workers · DeepSeek (`deepseek-chat`) ·
Direct Git API (Octokit) · Cloudflare R2 · AES-256-GCM key vault · Vanilla CSS ·
i18n FR/EN. **License** : BSD 3-Clause.

---

## ✨ What this brings (vs the existing tools)

| | 🗂️ CMS editors<br/>(Decap, PagesCMS…) | 💬 AI chat<br/>(ChatGPT, Claude…) | 🏗️ Studio Clarté |
|---|---|---|---|
| Edit existing files | ✅ | ❌ | ✅ + the AI **reads** them (`listFiles`/`readFile`) |
| Generate content with AI | ❌ | ✅ but copy-paste manually | ✅ **multi-page** (plan → one call per file, no truncation) |
| Human review before publishing | ✅ | ❌ | ✅ **integrated editor** (Tab/YAML-aware, ⌘S) |
| Preview before going live | depends | ❌ | ✅ Cloudflare preview URL (Pages or GitHub Actions) |
| One-click publish | ✅ (repo push) | ❌ | ✅ draft `draft/*` + PR → **validate & deploy** |
| Zero risk on `main` | sometimes | — | ✅ **never commits directly** — always branch + PR |
| Multi-tenant white-label | ❌ | ❌ | ✅ one subdomain per client, Super-Admin switcher |
| Client-owned storage/costs | ❌ | — | ✅ images on the **client's** R2 (or in git) |
| Rollback / undo publish | ✅ | ❌ | ✅ restore any previous version |

**In short** : CMS editors give you editing, chat AIs give you generation, but
neither gives you the *safe pipeline* in between. Studio Clarté connects both.

**It fits both use cases** :
- a **single site owner** — run it for your own site (like a personal content
  studio with AI generation + safe publishing) ;
- an **agency serving many clients** — one deployment, one white-label studio
  subdomain per client, with Super-Admin switching, per-client repos and
  client-owned storage.

---

## 🚀 Key features

- **Multi-page AI generation** — ask for an offer page, an order form, a webinar
  replay and an opt-in page in one prompt: the studio plans the files, then
  generates **each page in its own model call** (so the output never hits the
  token limit), and assembles everything into a **single PR**.
- **Human-in-the-loop editor** — review and fine-tune the generated files in an
  integrated, PagesCMS-style editor (monospace, Tab = 2 spaces for YAML/JSON,
  ⌘S to save). A **« Différence » view** shows *only the modified lines* for
  existing files (base: the repo original — what did the AI change?), and it is
  the **default view** for edited files. New files start **closed** (friendly
  « Ouvrir » button instead of raw code) so non-technical reviewers are never
  faced with intimidating markup. Your edits are included in the preview and
  the final commit.
- **Zero direct commit** — every generation creates a `draft/*` branch + a PR in
  ~1–2 s via the GitHub Git API (`createTree → createCommit → createRef →
  pulls.create`). `main` is only ever touched by a human action (publish).
- **Preview → Publish** — a Cloudflare preview build runs on the PR; the studio
  shows the **preview link** and only then enables **« Validate & Deploy to Prod »**
  (squash & merge). Includes **rollback**: restore any previous production version
  or undo the last publish.
- **Repo-aware AI** — the model browses and reads your repo before editing, so it
  finds the right files and preserves your frontmatter, permalinks and structure
  (minimal edits, no rewrites).
- **Multi-tenant white-label** — one deployment, one studio subdomain per client
  (`studio.client-a.ch`), each with its own repo, theme, system prompt and keys.
  The webmaster's domain enables a **Super-Admin** site switcher.
- **Client-owned storage** — images go to **the client's own R2 bucket** (their
  account, their costs) via presigned URLs, or fall back to being committed in
  git. Your Worker never transits a single media byte.
- **Write-only key vault** — client API keys (DeepSeek, GitHub PAT, R2) are
  encrypted (AES-256-GCM) and only ever displayed masked: `sk-••••••••1234`.
  Global fallbacks are reserved for the agency site — clients bring their own keys.
- **Security-first** — Gitleaks pre-commit/pre-push hooks, security headers,
  XSS-hardened rendering, path traversal protection, GitHub OAuth with optional
  allow-list.

---

## 📸 Screenshots

*Coming soon — see the list at the bottom of this file.*

---

## 🚀 Quick start (development)

```bash
npm install            # auto-installs the Gitleaks Git hooks
cp .env.example .dev.vars   # fill your dev secrets
npm run dev            # http://localhost:4321
```

Routing is host-based — simulate a client subdomain in dev:

```bash
curl -H "Host: studio.yourdomain.com" http://localhost:4321/login
# or add "127.0.0.1 studio.yourdomain.com" to /etc/hosts and open the browser
```

## 🧭 How it works

```
AI chat (DeepSeek, streaming)
   │  site prompt (per subdomain) + media references (CDN or repo paths)
   ▼
PLAN (file list) → one model call per file → payload assembled
   ▼
Review & edit (integrated editor + Diff view, human-in-the-loop)
   ▼
POST /api/commit-draft  →  draft/* branch + PR (~1-2 s, no direct commit)
   ▼
Cloudflare preview build (Pages Git integration OR GitHub Actions workflow)
   ▼
「 Voir la Pré-visualisation ↗ 」 → human validation
   ▼
POST /api/merge  →  squash & merge to main  →  production deploys (your CI)
```

## ☁️ Cloudflare deployment

### One-time setup

```bash
npm install
npx wrangler login
npx wrangler kv namespace create studio-clarte-kv   # → copy the id
# create the R2 bucket(s) — see per-client storage
```

### Configuration pattern (public repo, private values)

The repo is **public** → real values never live in it. **One source of truth
per kind of value** to avoid `wrangler deploy` overwriting your config:

- **Local `wrangler.jsonc`** (gitignored, template committed as
  `wrangler.jsonc.example`): only the **KV namespace id** and
  `SESSION_TTL_SECONDS` — everything the deploy needs. Because the file is
  ignored, `git pull` never touches it.
- **Cloudflare dashboard vars** (Workers → `studio-clarte` → Settings →
  Variables and Secrets): the **private deployment vars** — `AGENCY_DOMAIN`,
  `DEFAULT_SITE_ID`, `SITE_DOMAINS`, `SITE_OVERRIDES`. ⚠️ **Never put these
  in `wrangler.jsonc`**: a deploy would push the file values and overwrite
  the dashboard (the classic pitfall that broke `studio.cedricv.com` once).
- **Secrets** (`VAULT_MASTER_KEY`, GitHub OAuth…) go through
  `wrangler secret put` or the dashboard.

### Deploy

```bash
npm run build && npx wrangler deploy
# attach studio.<your-domain> as a Worker custom domain (auto DNS + TLS)
```

### PR previews — two options

**Option A — Cloudflare Pages Git integration** (simplest): connect each client
repo to a Pages project and enable PR previews.

**Option B — GitHub Actions** (when the client already owns its CD/CI): drop the
provided workflow into the repo — it builds every PR, deploys a preview via Pages
Direct Upload and reports it as a GitHub Deployment. Studio picks it up with
**no code change**:
[`docs/preview-github-actions.yml`](docs/preview-github-actions.yml) · a tailored
example at [`docs/preview-cedricv.yml`](docs/preview-cedricv.yml) (this one is the author's own site — use it as a base and adapt the project name, build command and secrets).

### Adding a client site

Follow the step-by-step guide:
**[`docs/client-onboarding.md`](docs/client-onboarding.md)** — naming conventions,
Pages project, preview workflow, per-client R2 storage, DNS, vault keys, final test.

> 🧠 **Iteration architecture**: content is edited in an in-memory draft and
> published as a **single PR** at the end. The alternative designs (PR per
> change, persisted draft) are compared and documented in
> [`docs/iteration-strategy.md`](docs/iteration-strategy.md).

---

## 🔌 API

| Endpoint | Method | Role |
|---|---|---|
| `/api/chat` | POST | AI streaming: plan + one call per file; repo read tools (`listFiles`/`readFile`) |
| `/api/upload-url` | POST | Upload target: client R2 presigned URL **or** git-mode path |
| `/api/commit-draft` | POST | `draft/*` branch + PR in ~1-2 s (Direct Git API) |
| `/api/status/:siteId/:prNumber` | GET | Preview build polling (Deployments / Check Runs) |
| `/api/merge` | POST | Squash & merge to `main` + branch deletion |
| `/api/history` | GET | Production version history (last commits on `main`) |
| `/api/restore` | POST | Rollback to a version (`sha`) or undo one commit (`revert`) |
| `/api/settings/keys` | GET/POST | Write-only vault (masked `sk-••••••••1234`) |
| `/api/auth/*` | GET/POST | GitHub OAuth, callback, logout |

## 🗂️ Project structure

```
src/
├── components/     Header · ChatStudio (paste/drag&drop, WebP) · PayloadPreview
│                   (editor PagesCMS-style) · WorkflowTracker (2-step publish) ·
│                   SettingsModal (write-only vault) · Toasts · LanguageSwitcher
├── config/sites.ts Multi-tenant registry (domains come from env, never hardcoded)
├── lib/
│   ├── ai.ts            DeepSeek client + plan/file prompts (minimal-edit aware)
│   ├── generator.ts     Sequential multi-page generation (plan → one call/file)
│   ├── github-edge.ts   Direct Git API: draft/* + PR, preview status, merge, rollback
│   ├── storage.ts       R2 presigned URLs / git-mode targets (per-client)
│   ├── vault.ts         AES-256-GCM write-only vault + masking
│   └── …                image-processor (Canvas/WebP) · client state · markdown-lite
├── middleware.ts     Host-based router · Super-Admin switcher · auth guard · headers
├── pages/            index (2 columns / mobile tabs) · login · api/*
└── i18n/             FR/EN dictionary
docs/                 client-onboarding.md · preview workflows (Pages / GitHub Actions)
```

## 🔒 Security notes

- **Gitleaks hooks** installed by `npm install` (pre-commit `protect --staged`,
  pre-push range scan) — full scan with `npm run secrets:scan`.
- Security headers on every response (`X-Frame-Options: DENY`, `nosniff`, …) ·
  session cookies `HttpOnly` + `SameSite=Lax` · OAuth state anti-CSRF in KV.
- Vault keys never leave the server in plaintext (masked only) · global key
  fallbacks apply to the **agency site only** — clients bring their own keys.
- No direct commits to `main` · path traversal protection · XSS-hardened
  rendering (escaped content, `http(s)`-only hrefs).
- **Zero-commit guarantee** : publishing is a human action after a visual preview.

## 🧪 Testing

```bash
npm run check          # astro check — 0 errors / 0 warnings / 0 hints
npm run build          # Cloudflare build
npx wrangler deploy --dry-run
```

Core libs (vault, git-edge, generator, storage) and API routes are testable in
isolation with `npx tsx` and a mocked `fetch`.

---

## 📸 Screenshots — how to contribute them

If you would like to add screenshots to this README:

1. Take the captures below (or any that feel right) ;
2. Save them as PNG in `docs/screenshots/` (e.g. `docs/screenshots/dashboard.png`) ;
3. Commit & push — or send me the files and I will wire them in.

Suggested captures:

| # | What | Why it matters |
|---|---|---|
| 1 | **Dashboard** — chat on the left, generated files + 2-step publish on the right | shows the whole workflow at a glance |
| 2 | **Editor** — a file open in « ✏️ Éditer » mode (monospace, save button, « Modifié » badge) | highlights the human-in-the-loop aspect |
| 3 | **Publish panel** — « Voir la Pré-visualisation ↗ » + « 🚀 Valider & Déployer en Prod » | the zero-risk preview → publish flow |
| 4 | **Settings vault** — keys shown masked (`sk-••••••••1234`) + R2 mini-guide | demonstrates the write-only security model |

*Replace this section with the images once provided (markdown links
`![…](docs/screenshots/….png)` work directly on GitHub).*
