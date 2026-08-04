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

Routing is **host-based** : in dev, simulate a client subdomain:

```bash
curl -H "Host: studio.client-a.ch" http://localhost:4321/login
```

(add `studio.client-a.ch 127.0.0.1` to `/etc/hosts` to test in a browser,
or rely on `server.allowedHosts` — already enabled in dev.)

## 🌍 Language (FR/EN)

The UI is bilingual. Locale resolution order:
`?lang=` query param → `sc_lang` cookie → `Accept-Language` header → French (default).
Use the `FR | EN` switcher in the header (or top-right on the login page) to
persist the choice. Dictionary: `src/i18n/index.ts`. The DeepSeek system prompt
stays in French: it drives the CONTENT language of the (French-speaking) client
sites, independently of the UI locale.

## ☁️ Cloudflare deployment (step by step)

### 0. Domain naming

| Usage | Example | Configured in |
|---|---|---|
| Admin (this app) | `studio.client-a.ch` | `src/config/sites.ts` → `domain` |
| R2 media CDN | `cdn.client-a.ch` | `R2_PUBLIC_URL` (secret/vars) |
| Target git repo | `studio-clarte/client-a-site` | `src/config/sites.ts` → `repo` |

Routing is per **`studio.*` subdomain** : each client owns its own `studio.DOMAIN.TLD`
(white-label). Unknown domains get a 404 (or a login page explaining the domain is
not recognized).

### 1. Cloudflare prerequisites (once)

```bash
npm install
npx wrangler login                 # authenticate the CLI
npx wrangler kv namespace create KV     # → copy the returned id into wrangler.jsonc
npx wrangler r2 bucket create studio-clarte-media
```

### 2. Worker custom domain (per client)

In the Cloudflare dashboard → **Workers & Pages** → `studio-clarte` → **Settings → Domains** :
add **`studio.client-a.ch`** (and `studio.client-b.ch`, `studio.mon-agence.ch`…).
The domain must be managed by Cloudflare (DNS zone) for the automatic certificate.

> ⚠️ Every domain added must match a `domain` entry in `src/config/sites.ts`, otherwise the middleware returns a 404.

### 3. Secrets (via `wrangler secret put`) & vars

```bash
wrangler secret put VAULT_MASTER_KEY        # AES-256 master key (≥16 chars, NEVER lose it)
wrangler secret put R2_ACCOUNT_ID
wrangler secret put R2_ACCESS_KEY_ID
wrangler secret put R2_SECRET_ACCESS_KEY
wrangler secret put OAUTH_GITHUB_CLIENT_ID
wrangler secret put OAUTH_GITHUB_CLIENT_SECRET
wrangler secret put ALLOWED_GITHUB_LOGINS   # optional: allowed GitHub logins whitelist
# Global fallbacks (otherwise configure per site in ⚙️ Settings):
wrangler secret put DEEPSEEK_API_KEY
wrangler secret put GITHUB_PAT
```

Vars (already in `wrangler.jsonc`) : `R2_PUBLIC_URL=https://cdn.client-a.ch`,
`SESSION_TTL_SECONDS=604800`.

### 4. GitHub OAuth App (per `studio.*` domain)

GitHub → **Settings → Developer settings → OAuth Apps** :

- Homepage URL : `https://studio.client-a.ch`
- **Callback URL : `https://studio.client-a.ch/api/auth/callback`** (one domain per client)
- Scope : `read:user` + `repo` (required for the Git Engine fallback)

### 5. Cloudflare Pages (PR previews) — per client repo

Each client repo (`client-a-site`) must be connected to a **Cloudflare Pages** project:

- Build command : `npm run build` · Output : `dist/`
- Enable **PR Previews** : every `draft/*` branch triggers an automatic preview build
  when the PR is created.

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
curl -H "Host: studio.client-a.ch" http://localhost:4321/login

# Option B — /etc/hosts + browser (full JS testing)
# add : 127.0.0.1 studio.client-a.ch
# then open http://studio.client-a.ch
```

Expected local checks:

| Test | Command | Expected |
|---|---|---|
| Login page | `curl -H "Host: studio.client-a.ch" localhost:4321/login` | 200 + GitHub button |
| Auth guard | `curl -H "Host: studio.client-a.ch" localhost:4321/` | 302 → `/login` |
| Protected API | `curl -H "Host: studio.client-a.ch" localhost:4321/api/settings/keys` | 401 JSON |
| Unknown domain | `curl -H "Host: admin.client-a.ch" localhost:4321/page` | 404 |
| Super-Admin | `curl -H "Host: studio.mon-agence.ch" localhost:4321/login` | « Studio Clarté » |
| Security headers | `curl -sI -H "Host: studio.client-a.ch" localhost:4321/login` | `X-Frame-Options: DENY`… |

### Full flow (OAuth + Git + preview)

1. Open `http://studio.client-a.ch` → « Se connecter avec GitHub » → authorize the app.
2. In the chat : paste/drag an image → check the compressed WebP thumbnail.
3. Ask DeepSeek for content → the structured JSON shows in « Fichiers générés ».
4. ⚙️ Settings → enter `DEEPSEEK_API_KEY` and `GITHUB_PAT` → displayed `sk-••••••••1234`.
5. « 💾 Créer la branche draft/* + PR » → PR created in ~1-2 s (GitHub link).
6. Wait for step 3 (Cloudflare preview) → open « Voir la Preview ↗ ».
7. « 🚀 Valider & Fusionner en Prod » → squash & merge to `main`, branch deleted.

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
│                      settings/keys · auth/{login,callback,logout}
├── styles/global.css  Vanilla CSS design system (dark-first, dynamic brand)
└── i18n/              FR/EN dictionary + locale helpers (server & client)
```

## 🔌 API

| Endpoint | Method | Role |
|---|---|---|
| `/api/chat` | POST | DeepSeek streaming with the active site prompt |
| `/api/upload-url` | POST | R2 presigned URL (direct browser PUT) |
| `/api/commit-draft` | POST | `draft/*` branch + PR in ~1-2 s (Direct Git API) |
| `/api/status/:siteId/:prNumber` | GET | Cloudflare Pages preview polling |
| `/api/merge` | POST | Squash & merge → `main` + branch deletion |
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
