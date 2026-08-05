# Studio Clarté — Edge-Native Multi-Tenant AI Admin

A single, white-label, multi-tenant admin interface to orchestrate text & media content
creation for static sites (Astro, Eleventy…).

**Stack** : Astro SSR (`@astrojs/cloudflare` v14) · Cloudflare Compute (Workers + KV + R2) ·
DeepSeek (`deepseek-chat`) · Direct Git API via Octokit (`git.createTree` → `pulls.create`) ·
AES-256-GCM encryption (Web Crypto) · Vanilla CSS · **i18n FR/EN** (UI).

---

## 🧭 Architecture & Git Security (Zero Direct Commit)

```
AI Chat (DeepSeek, streaming)
   │  1. site prompt (per subdomain) + CDN media references
   │  2. DeepSeek replies with a structured JSON payload { title, summary, files[] }
   ▼
Multi-file preview (Visual view / Code)
   │
   ▼
POST /api/commit-draft  ── runs on Cloudflare Compute ──
   │   git.getRef → git.createTree → git.createCommit → git.createRef (draft/*) → pulls.create
   │   (~1-2 s — NO direct commit to main)
   ▼
Active PR + automatic Cloudflare Pages preview build
   │
   ▼
GET /api/status/[siteId]/[prNumber]  (polls GitHub Deployments / Check Runs)
   │
   ▼
POST /api/merge  ── squash & merge to main + branch deletion ──
```

| Principle | Guarantee |
|---|---|
| Zero direct commit | Every generation goes through a `draft/*` branch + PR |
| Human validation | One-click merge after Cloudflare preview review |
| Direct R2 upload | Presigned URL, browser-side WebP compression (≤1920 px, <300 ms) |
| Write-only keys | AES-256-GCM encrypted in KV, displayed `sk-••••••••1234`, never readable |

---

## 🚀 Quick start

```bash
npm install   # automatically installs the Gitleaks Git hooks (pre-commit/pre-push)

# 1. Local bindings
cp .env.example .dev.vars     # dev secrets (DeepSeek, PAT, OAuth, VAULT_MASTER_KEY…)
# 2. wrangler.jsonc : local KV namespace id (placeholder is fine for dev)

npm run dev                   # http://localhost:4321
```

Routing is **host-based** : in dev, simulate a subdomain (domains come from
`.dev.vars` — see below):

```bash
curl -H "Host: studio.cedricv.com" http://localhost:4321/login
```

(add `studio.cedricv.com 127.0.0.1` to `/etc/hosts` to test in a browser,
or rely on `server.allowedHosts` — already enabled in dev.)

## 🌍 Language (FR/EN)

The UI is bilingual. Locale resolution order:
`?lang=` query param → `sc_lang` cookie → `Accept-Language` header → French (default).
Use the `FR | EN` switcher in the header (or top-right on the login page) to
persist the choice. Dictionary: `src/i18n/index.ts`. The DeepSeek system prompt
stays in French: it drives the CONTENT language of the (French-speaking) client
sites, independently of the UI locale.

## ☁️ Cloudflare deployment (step by step)

### 0. Site registry — domains are deployment config (never hardcoded)

Customer domains are **NOT hardcoded in the code**. They are configured at
runtime via Cloudflare vars (`wrangler.jsonc` / dashboard):

| Var | Role | Example (this webmaster) |
|---|---|---|
| `AGENCY_DOMAIN` | Webmaster's studio subdomain → Super-Admin + default site | `studio.cedricv.com` |
| `DEFAULT_SITE_ID` | Site opened by default on the agency domain | `agence` |
| `SITE_DOMAINS` | JSON map siteId → client custom domain | `{"client-a":"studio.client-a.ch"}` |
| `SITE_OVERRIDES` | JSON map siteId → partial overrides (repo, cdnDomain, name, r2AccountId, r2Bucket…) | `{"agence":{"repo":"cedric-v/cedricv.com","cdnDomain":"https://cdn.cedricv.com"}}` |

The code ships with **seed defaults** (business config: repos, prompts, themes)
in `src/config/sites.ts`; every value can be overridden per deployment via
`SITE_OVERRIDES`. Domains come exclusively from the env.

**Super-Admin workflow** (webmaster): open `studio.cedricv.com` → the studio
defaults to **your own site**. Use the **Active site** selector in the header to
switch to any client site (persisted via the `sc_site` cookie). Client subdomains
(`studio.client-a.ch`) are locked to their own site — no switcher, and `?site=`
is ignored (multi-tenant isolation, verified 403 on foreign status polling).

### 1. Cloudflare prerequisites (once)

```bash
npm install
npx wrangler login                 # authenticate the CLI
npx wrangler kv namespace create KV     # → copy the returned id into wrangler.jsonc
```

### 2. Domains & DNS (Cloudflare) — studio.cedricv.com

Everything runs on a single Worker (`studio-clarte`); domains are attached to it.

**Worker custom domain (recommended — automatic DNS + TLS):**

1. Cloudflare dashboard → **Workers & Pages** → `studio-clarte` → **Settings → Domains & Routes** → **Add → Custom domain**.
2. Enter `studio.cedricv.com` (and `studio.client-a.ch` for each client whose zone is in Cloudflare).
3. Cloudflare automatically creates the DNS record and provisions the certificate (usually < 1 min).

**Manual equivalent (if you prefer raw DNS):**

| Type | Name | Content | Proxy |
|---|---|---|---|
| CNAME | `studio` | `studio-clarte.<account-id>.workers.dev` | Proxied (orange cloud) |
| Route | — | `studio.cedricv.com/*` | Worker `studio-clarte` (Triggers → Routes) |

The CNAME target is shown in Workers → `studio-clarte` → **Triggers → Routes**.

**R2 media CDN (`cdn.cedricv.com`):**

1. R2 → bucket `studio-clarte-media` → **Settings → Custom Domains** → **Connect domain** → `cdn.cedricv.com`.
2. Cloudflare auto-creates the CNAME (target: the bucket's `*.r2.cloudflarestorage.com` endpoint) and enables TLS.
3. Public access is enabled on that domain (bucket settings → **Public access**).

**GitHub OAuth callback:** `https://studio.cedricv.com/api/auth/callback`
(one OAuth App per studio domain is enough — clients log in on their own subdomain).

> ⚠️ Every domain you attach must be declared in `AGENCY_DOMAIN` / `SITE_DOMAINS`,
> otherwise the middleware returns a 404.

### 2b. Per-client image storage — dedicated R2, no webmaster bucket

**Cost model:** every site stores its images either on ITS OWN R2 bucket
(client's Cloudflare account) or — by default — in **Git**. Your Worker never
holds media: it only signs presigned URLs (R2 mode) or the images are committed
into the site repo with the draft PR (Git mode). Storage & egress are billed to
the client.

**Resolution priority (per active site):**

1. **Client R2** — site has `r2AccountId`/`r2Bucket` AND its vault keys →
   direct PUT to the client's bucket, public reads via the site's `cdnDomain`;
2. **Git fallback** — otherwise (no R2 config or vault keys missing): the image
   is committed into the repo as `public/images/{siteId}/…` and referenced with
the relative URL `/images/{siteId}/…` (works with Astro `public/`, Eleventy
passthrough…). Previewed directly in the admin (base64).

> ❌ There is deliberately **no fallback on a webmaster/global bucket** — if you
> want R2, each site needs its own dedicated configuration.

**Flow (R2 mode):**

```
Browser → WebP compression → PUT (presigned URL) → CLIENT bucket (their account, their costs)
                                                         ↓
                                            public reads via the site's cdnDomain
```

**Per site, two things are needed for R2 mode:**

1. **Identifiers (non-secret)** — in `SITE_OVERRIDES`:
   `{"client-a":{"r2AccountId":"<client-account-id>","r2Bucket":"<client-bucket>"}}`
   (the site's `cdnDomain` then serves the public images).
2. **Access keys (secret)** — in the ⚙️ Settings vault of that site (write-only,
   masked): `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY`.

**Guide to send to the client (official Cloudflare flow):**

1. Create the bucket: Cloudflare dashboard → **R2 → Create bucket** (e.g. `client-a-media`).
2. Attach the CDN domain: bucket → **Settings → Custom Domains** → `cdn.client-a.ch`
   (+ enable **Public access**).
3. Create the R2 API token: **R2 → Overview → Account Details → Manage → API Tokens →
   Create Account API token** → permission **Object Read & Write** →
   **Apply to specific buckets only** → select the bucket.
4. On the confirmation screen, copy the **Access Key ID** + **Secret Access Key**
   (may be labeled **Client ID** / **Client Secret** — same pair). The **Secret is
   shown only once**; there is no way to retrieve it afterwards. The endpoint is
   `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` (handled automatically by the app
   via `r2AccountId`).
5. Send the Access Key ID + Secret to the webmaster (→ ⚙️ Settings vault).

> ⚠️ A per-site bucket NEVER mixes with other credentials: without the client's
> vault keys, the site falls back to GIT mode (never to another bucket).

### 3. Secrets (via `wrangler secret put`) & vars

```bash
wrangler secret put VAULT_MASTER_KEY        # AES-256 master key (≥16 chars, NEVER lose it)
wrangler secret put OAUTH_GITHUB_CLIENT_ID
wrangler secret put OAUTH_GITHUB_CLIENT_SECRET
wrangler secret put ALLOWED_GITHUB_LOGINS   # optional: allowed GitHub logins whitelist
# Global fallbacks — AGENCY site only (clients must configure their own
# keys in ⚙️ Settings; no API costs are ever paid on their behalf):
wrangler secret put DEEPSEEK_API_KEY
wrangler secret put GITHUB_PAT
```

Vars — **edit your LOCAL `wrangler.jsonc`** (gitignored): `AGENCY_DOMAIN`,
`DEFAULT_SITE_ID`, `SITE_DOMAINS`, `SITE_OVERRIDES`, `SESSION_TTL_SECONDS`.
The repo ships a `wrangler.jsonc.example` template; copy it to `wrangler.jsonc`
and fill in your values. Because the real file is never committed:
- `git pull` never overwrites it (no more lost config on redeploys) ;
- every `wrangler deploy` uses YOUR values consistently ;
- nothing private is exposed in this public repo.

> Alternative: dashboard-only vars also work, but NEVER put placeholder vars
> in the committed file — a deploy would overwrite the dashboard values
> (the pitfall that broke `studio.cedricv.com` once).

### 4. GitHub OAuth App (per `studio.*` domain)

GitHub → **Settings → Developer settings → OAuth Apps** :

- Homepage URL : `https://studio.cedricv.com`
- **Callback URL : `https://studio.cedricv.com/api/auth/callback`** (one per studio domain)
- Scope : `read:user` + `repo` (required for the Git Engine fallback)

### 5. PR previews — per client repo

Two options (pick the one that fits the client's CD/CI):

**Option A — Cloudflare Pages Git integration (simplest):**
connect the client repo to a **Cloudflare Pages** project (Build: `npm run build`, Output: `dist/`) and enable **PR Previews**. Every `draft/*` branch then triggers an automatic preview build.

**Option B — GitHub Actions (when the client already owns the CD/CI):** the repo is NOT connected to Pages — production is deployed by GitHub Actions on `main` (tests required). Add the provided workflow to the client repo:

```bash
# template to copy into the CLIENT repo as .github/workflows/preview.yml
cat docs/preview-github-actions.yml
```

It builds every PR, deploys the preview to Cloudflare Pages via **Direct Upload** (`preview-N.<project>.pages.dev`), and reports the URL as a GitHub **Deployment** with environment `preview`. Studio Clarté picks it up automatically (its polling reads Deployments/Check Runs) — no code change needed.

Client prerequisites for Option B: a Pages project (`npx wrangler pages project create <name>`), repo secrets `CLOUDFLARE_API_TOKEN` (Pages: Edit) + `CLOUDFLARE_ACCOUNT_ID`, and the repo variable `CF_PAGES_PROJECT`. Merge the workflow to `main` once — subsequent `draft/*` PRs trigger it.

### 6. Deploy

```bash
npm run build      # dist/server (Worker) + dist/client (assets)
npx wrangler deploy   # uses dist/server/wrangler.json generated by the adapter
```

> ⚠️ `nodejs_compat` is required (AWS SDK v3 for R2 presigning) — already in `wrangler.jsonc`.
> The adapter's `imageService: 'passthrough'` flag disables Cloudflare image
> optimization (images are already WebP-optimized in the browser and served from R2).

## 🧪 Testing (dev & production)

### Locally

```bash
cp .env.example .dev.vars     # dev secrets (fake values are fine to test rendering)
npm run dev                   # http://localhost:4321
```

Simulate the client subdomain:

```bash
# Option A — Host header
curl -H "Host: studio.cedricv.com" http://localhost:4321/login

# Option B — /etc/hosts + browser (full JS testing)
# add : 127.0.0.1 studio.cedricv.com
# then open http://studio.cedricv.com
```

Expected local checks:

| Test | Command | Expected |
|---|---|---|
| Login page | `curl -H "Host: studio.cedricv.com" localhost:4321/login` | 200 + GitHub button |
| Auth guard | `curl -H "Host: studio.client-a.ch" localhost:4321/` | 302 → `/login` |
| Protected API | `curl -H "Host: studio.client-a.ch" localhost:4321/api/settings/keys` | 401 JSON |
| Unknown domain | `curl -H "Host: admin.client-a.ch" localhost:4321/page` | 404 |
| Super-Admin | `curl -H "Host: studio.cedricv.com" localhost:4321/login` | « Studio Clarté » |
| Security headers | `curl -sI -H "Host: studio.client-a.ch" localhost:4321/login` | `X-Frame-Options: DENY`… |

### Full flow (OAuth + Git + preview)

1. Open `http://studio.client-a.ch` → « Se connecter avec GitHub » → authorize the app.
2. In the chat : paste/drag an image → check the compressed WebP thumbnail.
3. Ask DeepSeek for content → the structured JSON shows in « Fichiers générés ».
4. ⚙️ Settings → enter `DEEPSEEK_API_KEY` and `GITHUB_PAT` → displayed `sk-••••••••1234`.
5. « 💾 Créer la branche draft/* + PR » → PR created in ~1-2 s (GitHub link).
6. Wait for step 3 (Cloudflare preview) → open « Voir la Preview ↗ ».
7. « 🚀 Valider & Fusionner en Prod » → squash & merge to `main`, branch deleted.
8. **In case of error** → « 🕘 Historique & Rollback » (below the stepper): restore
   any previous production version in one click, or press **« Annuler »** in the
   toast that follows a merge (20 s window, Gmail-style undo).

### ↩️ Rollback — safety net (UX 2026)

Every merge to production is recoverable in seconds, without touching Git history:

- **« Annuler » (Undo toast)** — after « Valider & Fusionner en Prod », an
  actionable toast offers to revert the merge for 20 s (the Gmail *undo send*
  pattern). `/api/restore` with `{revert: <mergeSha>}` restores the previous version.
- **« 🕘 Historique & Rollback »** — progressive-disclosure panel below the
  stepper listing the last 10 production commits (message, author, relative
  time, `Version actuelle` badge). Click **« ↩️ Restaurer »** → the button arms
  into a 6 s staged confirmation (⚠️ red) → second click executes.
- **Non-destructive by design** — the restore creates a NEW `revert:` commit
  (target tree, parented on HEAD, fast-forward via `git.updateRef`): history is
  never rewritten, nothing is deleted, and the rollback itself can be undone.
  Cloudflare Pages rebuilds production automatically on the push to `main`.
- **Ancestor guard** — `/api/restore` only accepts versions present in the
  branch's past (`compareCommits`), so a foreign SHA is rejected.

| Endpoint | Body | Effect |
|---|---|---|
| `GET /api/history` | — | List last 10 commits of `defaultBranch` (read-only) |
| `POST /api/restore` | `{sha}` | Restore branch content to that exact version |
| `POST /api/restore` | `{revert}` | Undo that single commit (restore to its parent) |

Both endpoints resolve the Git credentials exactly like `/api/merge` (site vault
`GITHUB_PAT` → global `GITHUB_PAT` → OAuth token) and are protected by the
middleware auth guard.

### Quality checks

```bash
npm run check          # astro check — 0 errors / 0 warnings / 0 hints
npm run build          # Cloudflare build
npx wrangler deploy --dry-run   # validates the Worker + bindings
```

## 🗂️ Structure

```
src/
├── components/        Header, SettingsModal (vault), ChatStudio (paste/drag&drop WebP),
│                      PayloadPreview (multi-file), WorkflowTracker (CI/CD stepper), Toasts
├── config/sites.ts    Multi-tenant registry (subdomain → repo → theme → prompt addon)
├── env.ts             Zod validation of Cloudflare bindings (+ structural KV/R2 types)
├── types.d.ts         Global types (App.Locals, cloudflare:workers module, ExecutionContext)
├── lib/
│   ├── ai.ts          DeepSeek client (.chat() — Chat Completions) + white-label system prompt
│   ├── github-edge.ts Octokit Direct Git API : draft/* + PR, preview status, squash-merge
│   ├── storage.ts     R2 : presigned URLs (S3 SigV4), hierarchical keys, CDN URL
│   ├── vault.ts       AES-256-GCM write-only : encryption, masking sk-••••••••1234
│   ├── image-processor.ts  Browser Canvas → WebP compression
│   ├── client-upload.ts    Presigned upload pipeline
│   ├── client-state.ts     window store + Custom Events (Astro components)
│   └── markdown-lite.ts    Lightweight Markdown/JSON rendering (chat + preview)
├── middleware.ts       Host-based router, OAuth session, auth guard, unknown-domain 404
├── pages/
│   ├── index.astro    Two-column layout (desktop) / tabs (mobile)
│   ├── login.astro    GitHub OAuth login (optional whitelist)
│   └── api/           chat · upload-url · commit-draft · status/[site]/[pr] · merge ·
│                      history · restore · settings/keys · auth/{login,callback,logout}
├── styles/global.css  Vanilla CSS design system (dark-first, dynamic brand)
└── i18n/              FR/EN dictionary + locale helpers (server & client)
```

## 🔌 API

| Endpoint | Method | Role |
|---|---|---|
| `/api/chat` | POST | DeepSeek streaming with the active site prompt + **repo read tools** (`listFiles` / `readFile` executed server-side with the site Git token) |
| `/api/upload-url` | POST | R2 presigned URL (direct browser PUT) |
| `/api/commit-draft` | POST | `draft/*` branch + PR in ~1-2 s (Direct Git API) |
| `/api/status/:siteId/:prNumber` | GET | Cloudflare Pages preview polling |
| `/api/merge` | POST | Squash & merge → `main` + branch deletion |
| `/api/history` | GET | Production version history (recent commits on `main`) |
| `/api/restore` | POST | Emergency rollback: restore a previous version (`sha`) or undo one commit (`revert`) |
| `/api/settings/keys` | GET/POST | Write-only vault (masked `sk-••••••••1234`) |
| `/api/auth/*` | GET/POST | GitHub OAuth, callback, logout |

## 🔒 Security notes

- **Gitleaks (Git hooks pre-installed by `npm install`)** : `pre-commit`
  (`gitleaks protect --staged`) and `pre-push` (pushed commit range scan) block any
  commit/push containing a secret. Full scan : `npm run secrets:scan`.
  Configuration : `.gitleaks.toml` (example placeholders only are allowed).
- **License** : BSD 3-Clause (see `LICENSE`) — public open-source repository.
- **Security headers** applied to every response : `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- Session cookies `HttpOnly` + `SameSite=Lax` ; OAuth state anti-CSRF in KV (10 min).
- Vault keys never leave the server in plaintext (only the mask computed at write time is stored).
- File paths validated (`/` and `..` rejected) on `/api/commit-draft`.
- Anti-XSS : Markdown content escaped before rendering, escaped attributes (user file
  names, AI payload paths), hrefs restricted to `http(s)`.
- Optional GitHub whitelist (`ALLOWED_GITHUB_LOGINS`) + Super-Admin mode on the agency
  domain (`isAgency`).
- Critical libs (vault, git-edge, storage) and API routes can be tested in isolation
  with `npx tsx` and a mocked `fetch`.
