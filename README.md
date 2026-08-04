# Studio Clarté — Admin IA Multi-Tenant Edge-Native

Interface d'administration unique, **marque blanche** et multi-tenant pour orchestrer la
création de contenu texte & média sur des sites statiques (Astro, Eleventy…).

**Stack** : Astro SSR (`@astrojs/cloudflare` v14) · Cloudflare Compute (Workers + KV + R2) ·
DeepSeek (`deepseek-chat`) · API Git directe d'Octokit (`git.createTree` → `pulls.create`) ·
Chiffrement AES-256-GCM (Web Crypto) · Vanilla CSS.

---

## 🧭 Architecture & Sécurité Git (Zero Direct Commit)

```
Chat IA (DeepSeek, streaming)
   │  1. prompt du site client (sous-domaine) + références médias CDN
   │  2. DeepSeek répond un payload JSON structuré { title, summary, files[] }
   ▼
Aperçu multi-fichiers (Vue visuelle / Code)
   │
   ▼
POST /api/commit-draft  ── exécuté sur Cloudflare Compute ──
   │   git.getRef → git.createTree → git.createCommit → git.createRef (draft/*) → pulls.create
   │   (~1-2 s — AUCUN commit direct sur main)
   ▼
PR active + build de preview Cloudflare Pages automatique
   │
   ▼
GET /api/status/[siteId]/[prNumber]  (polling GitHub Deployments / Check Runs)
   │
   ▼
POST /api/merge  ── squash & merge vers main + suppression de la branche ──
```

| Principe | Garantie |
|---|---|
| Zéro commit direct | Toute génération passe par une branche `draft/*` + PR |
| Validation humaine | Fusion en 1 clic après prévisualisation Cloudflare |
| Upload direct R2 | URL présignée, WebP compressé dans le navigateur (≤1920 px, <300 ms) |
| Clés write-only | Chiffrées AES-256-GCM en KV, affichage `sk-••••••••1234`, jamais relisables |

---

## 🚀 Démarrage rapide

```bash
npm install   # installe automatiquement les hooks Git Gitleaks (pre-commit/pre-push)

# 1. Bindings locaux
cp .env.example .dev.vars     # secrets de dev (DeepSeek, PAT, OAuth, VAULT_MASTER_KEY…)
# 2. wrangler.jsonc : id du KV namespace local (déjà placeholder, OK pour dev)

npm run dev                   # http://localhost:4321
```

Le routage est **host-based** : en dev, simulez le sous-domaine d'un client :

```bash
curl -H "Host: studio.client-a.ch" http://localhost:4321/login
```

(ajouter `studio.client-a.ch 127.0.0.1` dans `/etc/hosts` pour tester dans le navigateur,
ou configurer `server.allowedHosts` — déjà activé en dev.)

## ☁️ Déploiement Cloudflare (pas à pas)

### 0. Nomenclature des domaines

| Usage | Exemple | Configuré dans |
|---|---|---|
| Admin (cette app) | `studio.client-a.ch` | `src/config/sites.ts` → `domain` |
| CDN médias R2 | `cdn.client-a.ch` | `R2_PUBLIC_URL` (secret/vars) |
| Repo cible git | `studio-clarte/client-a-site` | `src/config/sites.ts` → `repo` |

Le routage se fait par **sous-domaine `studio.*`** : chaque client possède son propre
`studio.DOMAINE.TLD` (marque blanche). Un domaine inconnu → 404 (ou page de connexion
expliquant le domaine non reconnu).

### 1. Prérequis Cloudflare (une fois)

```bash
npm install
npx wrangler login                 # authentifier la CLI
npx wrangler kv namespace create KV     # → copier l'id renvoyé dans wrangler.jsonc
npx wrangler r2 bucket create studio-clarte-media
```

### 2. Domaine personnalisé du Worker (par client)

Dans le dashboard Cloudflare → **Workers & Pages** → `studio-clarte` → **Settings → Domains** :
ajouter **`studio.client-a.ch`** (et `studio.client-b.ch`, `studio.mon-agence.ch`…).
Le domaine doit être géré dans Cloudflare (zone DNS) pour le certificat automatique.

> ⚠️ Chaque domaine ajouté doit correspondre à une entrée `domain` de `src/config/sites.ts`, sinon le middleware renvoie 404.

### 3. Secrets (par `wrangler secret put`) & vars

```bash
wrangler secret put VAULT_MASTER_KEY        # clé maîtresse AES-256 (≥16 caractères, ne JAMAIS la perdre)
wrangler secret put R2_ACCOUNT_ID
wrangler secret put R2_ACCESS_KEY_ID
wrangler secret put R2_SECRET_ACCESS_KEY
wrangler secret put OAUTH_GITHUB_CLIENT_ID
wrangler secret put OAUTH_GITHUB_CLIENT_SECRET
wrangler secret put ALLOWED_GITHUB_LOGINS   # optionnel : liste blanche de logins GitHub
# Fallbacks globaux (sinon à configurer par site dans ⚙️ Paramètres) :
wrangler secret put DEEPSEEK_API_KEY
wrangler secret put GITHUB_PAT
```

Vars (déjà dans `wrangler.jsonc`) : `R2_PUBLIC_URL=https://cdn.client-a.ch`,
`SESSION_TTL_SECONDS=604800`.

### 4. GitHub OAuth App (par domaine `studio.*`)

Côté GitHub → **Settings → Developer settings → OAuth Apps** :

- Homepage URL : `https://studio.client-a.ch`
- **Callback URL : `https://studio.client-a.ch/api/auth/callback`** (un domaine par client)
- Scope : `read:user` + `repo` (nécessaire pour le fallback du Git Engine)

### 5. Cloudflare Pages (previews sur PR) — par repo client

Chaque dépôt client (`client-a-site`) doit être connecté à un projet **Cloudflare Pages** :

- Build command : `npm run build` · Output : `dist/`
- Activez **PR Previews** : chaque branche `draft/*` déclenchera un build de preview
automatiquement à la création de la PR.

### 6. Déployer

```bash
npm run build      # dist/server (Worker) + dist/client (assets)
npx wrangler deploy   # utilise dist/server/wrangler.json généré par l'adaptateur
```

> ⚠️ `nodejs_compat` est requis (AWS SDK v3 pour la présignature R2) — déjà dans `wrangler.jsonc`.
> Le flag `imageService: 'passthrough'` de l'adaptateur désactive l'optimisation d'image
> Cloudflare (les images sont déjà optimisées WebP côté navigateur et servies depuis R2).

## 🧪 Tester (dev & production)

### En local

```bash
cp .env.example .dev.vars     # secrets de dev (valeurs factices OK pour tester le rendu)
npm run dev                   # http://localhost:4321
```

Simuler le sous-domaine client :

```bash
# Option A — en-tête Host
curl -H "Host: studio.client-a.ch" http://localhost:4321/login

# Option B — /etc/hosts + navigateur (test complet du JS)
# ajouter : 127.0.0.1 studio.client-a.ch
# puis ouvrir http://studio.client-a.ch
```

Checks attendus en local :

| Test | Commande | Attendu |
|---|---|---|
| Page de connexion | `curl -H "Host: studio.client-a.ch" localhost:4321/login` | 200 + bouton GitHub |
| Garde d'auth | `curl -H "Host: studio.client-a.ch" localhost:4321/` | 302 → `/login` |
| API protégée | `curl -H "Host: studio.client-a.ch" localhost:4321/api/settings/keys` | 401 JSON |
| Domaine inconnu | `curl -H "Host: admin.client-a.ch" localhost:4321/page` | 404 |
| Super-Admin | `curl -H "Host: studio.mon-agence.ch" localhost:4321/login` | « Studio Clarté » |
| Headers de sécurité | `curl -sI -H "Host: studio.client-a.ch" localhost:4321/login` | `X-Frame-Options: DENY`… |

### Test complet (OAuth + Git + preview)

1. Ouvrir `http://studio.client-a.ch` → « Se connecter avec GitHub » → autoriser l'app.
2. Dans le chat : coller/glisser une image → vérifier la vignette WebP compressée.
3. Demander un contenu à DeepSeek → le JSON structuré s'affiche dans « Fichiers générés ».
4. ⚙️ Paramètres → saisir `DEEPSEEK_API_KEY` et `GITHUB_PAT` → affichage `sk-••••••••1234`.
5. « 💾 Créer la branche draft/* + PR » → PR créée en ~1-2 s (lien GitHub).
6. Attendre l'étape 3 (preview Cloudflare) → ouvrir « Voir la Preview ↗ ».
7. « 🚀 Valider & Fusionner en Prod » → squash & merge vers `main`, branche supprimée.

### Vérification qualité

```bash
npm run check          # astro check — 0 erreur / 0 warning / 0 hint
npm run build          # build Cloudflare
npx wrangler deploy --dry-run   # valide le Worker + les bindings
```

## 🗂️ Structure

```
src/
├── components/        Header, SettingsModal (vault), ChatStudio (paste/drag&drop WebP),
│                      PayloadPreview (multi-fichiers), WorkflowTracker (stepper CI/CD), Toasts
├── config/sites.ts    Registre multi-tenant (sous-domaine → repo → thème → prompt addon)
├── env.ts             Validation Zod des bindings Cloudflare (+ KV/R2 structuraux)
├── types.d.ts         Types globaux (App.Locals, module cloudflare:workers, ExecutionContext)
├── lib/
│   ├── ai.ts          Client DeepSeek (.chat() — Chat Completions) + system prompt marque blanche
│   ├── github-edge.ts Octokit Direct Git API : draft/* + PR, statut preview, squash-merge
│   ├── storage.ts     R2 : URLs présignées (S3 SigV4), clés hiérarchisées, URL CDN
│   ├── vault.ts       AES-256-GCM write-only : chiffrement, masquage sk-••••••••1234
│   ├── image-processor.ts  Compression Canvas → WebP côté navigateur
│   ├── client-upload.ts    Pipeline upload présigné
│   ├── client-state.ts     Store window + Custom Events (composants Astro)
│   └── markdown-lite.ts    Rendu Markdown/JSON léger (chat + preview)
├── middleware.ts       Router host-based, session OAuth, garde d'auth, 404 domaines inconnus
├── pages/
│   ├── index.astro    Layout 2 colonnes (desktop) / onglets (mobile)
│   ├── login.astro    Connexion GitHub OAuth (liste blanche optionnelle)
│   └── api/           chat · upload-url · commit-draft · status/[site]/[pr] · merge ·
│                      settings/keys · auth/{login,callback,logout}
└── styles/global.css  Design system Vanilla CSS (dark-first, brand dynamique)
```

## 🔌 API

| Endpoint | Méthode | Rôle |
|---|---|---|
| `/api/chat` | POST | Streaming DeepSeek avec prompt du site actif |
| `/api/upload-url` | POST | URL présignée R2 (PUT direct navigateur) |
| `/api/commit-draft` | POST | Branche `draft/*` + PR en ~1-2 s (API Git directe) |
| `/api/status/:siteId/:prNumber` | GET | Polling preview Cloudflare Pages |
| `/api/merge` | POST | Squash & merge → `main` + suppression branche |
| `/api/settings/keys` | GET/POST | Vault write-only (masqué `sk-••••••••1234`) |
| `/api/auth/*` | GET/POST | OAuth GitHub, callback, logout |

## 🔒 Notes de sécurité

- **Gitleaks (hooks Git pré-installés par `npm install`)** : `pre-commit`
  (`gitleaks protect --staged`) et `pre-push` (`gitleaks git --pre-push`) bloquent
  tout commit/push contenant un secret. Scan complet : `npm run secrets:scan`.
  Configuration : `.gitleaks.toml` (placeholders d'exemple autorisés uniquement).
- **Licence** : BSD 3-Clause (voir `LICENSE`) — dépôt public open source.

- **Headers de sécurité** appliqués à toutes les réponses : `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- Cookies de session `HttpOnly` + `SameSite=Lax` ; état OAuth anti-CSRF en KV (10 min).
- Les clés vault ne sortent jamais en clair (seul le masque calculé à l'écriture est stocké).
- Chemins de fichiers validés (`/` et `..` rejetés) côté `/api/commit-draft`.
- Anti-XSS : contenu Markdown échappé avant rendu, attributs échappés (noms de fichiers
  utilisateur, chemins du payload IA), hrefs restreints à `http(s)`.
- Liste blanche GitHub optionnelle (`ALLOWED_GITHUB_LOGINS`) + mode Super-Admin
  sur le domaine de l'agence (`isAgency`).
- Les libs critiques (vault, git-edge, storage) et les routes API sont testables en
  isolation avec `npx tsx` et un `fetch` mocké.
