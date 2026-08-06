# Onboarding d'un site client — guide pas à pas

Ce guide décrit tout ce qu'il faut mettre en place **par site client** pour que le
Studio Clarté fonctionne de bout en bout : connexion, génération de contenu,
previews et publication. À adapter selon le client.

---

## 0. Vue d'ensemble

```
Studio (votre Worker, compte webmaster)
   │  https://studio.<domaine-client>
   ▼
Contenu généré → branche draft/* + PR (repo GitHub du client)
   ▼
GitHub Actions (repo client) → build + preview Cloudflare Pages
   ▼
Validation dans Studio → squash & merge → prod (Actions, après tests)
Images → bucket R2 DU CLIENT (son compte, ses frais) via cdn.<domaine>
```

Le client héberge **tout** chez lui : son repo, ses builds, son bucket R2.
Vous ne payez que le Worker Studio.

---

## 1. Conventions de nommage

| Élément | Convention | Exemple (`client-a.ch`) |
|---|---|---|
| Sous-domaine studio | `studio.<domaine>` | `studio.client-a.ch` |
| Projet Cloudflare Pages | `<domaine sans TLD>` en tirets | `client-a-com` |
| Bucket R2 | `<domaine sans TLD>-media` | `client-a-media` |
| Domaine CDN R2 | `cdn.<domaine>` | `cdn.client-a.ch` |
| Repo GitHub | — | `client-org/client-a-site` |

---

## 2. Prérequis côté client

- [ ] Compte **Cloudflare** (le domaine du client doit y être géré)
- [ ] Repo **GitHub** du site, accessible en écriture
- [ ] *(recommandé)* **R2 activé** sur leur compte (images chez eux)

---

## 3. Projet Cloudflare Pages (previews)

**Si la prod est déjà déployée via Pages** (workflow Actions avec
`wrangler pages deploy --project-name=…`) → **réutilisez ce projet**, passez à l'étape 4.

Sinon, créez le projet **sur le compte du client** :

```bash
npx wrangler login                # en tant que client (ou via son API token)
npx wrangler pages project create client-a-com   # nom = convention ci-dessus
```

> Le nom du projet apparaît dans l'URL de preview : `preview-N.client-a-com.pages.dev`.

---

## 4. Workflow de preview (GitHub Actions)

**Dans le repo du client :**

1. Copier le template :
   ```bash
   # depuis le repo Studio, récupérer le fichier :
   curl -O https://raw.githubusercontent.com/cedric-v/studio-clarte/main/docs/preview-github-actions.yml
   mv preview-github-actions.yml .github/workflows/preview.yml
   ```
2. **Adapter** au besoin — le build de preview doit **refléter exactement le build de prod** :
   - même commande (ex. `ELEVENTY_ENV=prod npm run build`) et **mêmes secrets d'env** que le workflow de prod ;
   - même dossier de sortie (`_site`, `dist`…) ;
   - réutiliser le **même nom de projet Pages** que la prod (`--project-name=<projet existant>`) — les previews passent par l'alias de branche `preview-N.<projet>.pages.dev`, la prod n'est jamais touchée.
   - *(optionnel)* décommenter `npm test` pour les mêmes tests que la prod.
3. **Secrets / variables du repo** (GitHub → Settings → Secrets and variables → Actions) :
   - si la prod déploie déjà via Actions → `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` existent déjà ; sinon les créer (token **Pages: Edit**) ;
   - `CF_PAGES_PROJECT` : nom du projet (ou hardcoder `--project-name` dans le workflow).
4. **Merger le workflow sur `main` une fois.** Toutes les PR `draft/*` suivantes déclencheront la preview automatiquement.

---

## 5. Stockage des images (R2 du client — recommandé)

Sans R2, les images sont commitées dans le repo (mode Git — fonctionne, mais
alourdit le repo). Le stockage R2 chez le client est le modèle recommandé :

**Côté client :**
1. Créer le bucket : R2 → **Create bucket** → `client-a-media`.
2. Domaine CDN : bucket → **Settings → Custom Domains** → `cdn.client-a.ch` + activer **Public access**.
3. Token scoped : **R2 → Overview → Account Details → Manage → API Tokens → Create Account API token** → permission **Object Read & Write** → **Apply to specific buckets only** → `client-a-media`.
4. Copier **Access Key ID** + **Secret Access Key** (le Secret n'est affiché qu'une fois) → transmettre au webmaster.

**Côté webmaster (Studio) :** les clés sont saisies dans ⚙️ Paramètres du site (coffre-fort chiffré, write-only) — jamais dans le code.

---

## 6. Configuration webmaster (Studio) — add a NEW client (no code change)

A brand-new client is added **purely via config vars** — the registry treats
any `SITE_OVERRIDES` entry whose id has no seed as a new site (`name`, `repo`,
`framework`, `cdnDomain`, optional `theme`). **A redeploy is required** (one
command: `npm run deploy`).

⚠️ **In the gitignored local `wrangler.jsonc`** (NOT the dashboard — see the
⚠️ note in [`wrangler.jsonc.example`](../wrangler.jsonc.example): dashboard-only
plain vars are silently dropped by the next `wrangler deploy` because the
Workers Versions model bakes vars into each version). Edit the `vars` section:

**`SITE_DOMAINS`** (JSON string):
```json
{ "client-a": "studio.client-a.ch", "instant-academie": "studio.instant-academie.com" }
```

**`SITE_OVERRIDES`** (JSON string):
```json
{
  "client-a": {
    "repo": "client-org/client-a-site",
    "cdnDomain": "https://cdn.client-a.ch",
    "r2AccountId": "<ACCOUNT-ID-CLIENT>",
    "r2Bucket": "client-a-media"
  },
  "instant-academie": {
    "name": "Instant Académie",
    "repo": "client-org/instant-academie",
    "framework": "eleventy",
    "cdnDomain": "https://cdn.instant-academie.com",
    "systemPromptAddon": "… directives propres au site …"
  }
}
```

> If the client uses R2 storage (recommended), add `r2AccountId` / `r2Bucket`
> (step 5) and enter the client's keys in the site vault.

Puis :
- [ ] **Domaine custom** sur le Worker : `studio.client-a.ch` (Workers → studio-clarte → Domains & Routes).
- [ ] **OAuth GitHub** (si le client se connecte lui-même) : une OAuth App GitHub n'accepte qu'**une seule callback URL** — l'app globale ne fonctionne que sur le domaine de l'agence. Pour le self-login du client sur son sous-domaine : créer une **2ᵉ OAuth App** (callback `https://studio.client-a.ch/api/auth/callback`), puis saisir `OAUTH_GITHUB_CLIENT_ID` / `OAUTH_GITHUB_CLIENT_SECRET` dans le coffre-fort du site (⚙️ Paramètres, section « Connexion ») — sans changement de code depuis la v0.6 (résolution par site, fallback global).
- [ ] **Coffre-fort** du site : coller `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` du client (étape 5). Le client peut aussi y saisir sa propre clé DeepSeek.
  - **Aucun `GITHUB_PAT` à renseigner** : chaque contributeur se connecte avec son propre compte GitHub (OAuth), et les commits/PR/merges portent son nom automatiquement.

---

## 7. Test final

1. Ouvrir `https://studio.client-a.ch` → se connecter (ou basculer en Super-Admin).
2. Générer un contenu → « Fichiers concernés » rempli.
3. « 👁️ Créer la pré-visualisation » → PR + build de preview lancés (~1-2 s).
4. « Voir la Preview ↗ » apparaît → valider visuellement.
5. « 🚀 Valider & Fusionner en Prod » → squash & merge → la prod du client se déploie (après ses tests).

---

## Rappels de sécurité

- Les clés du client (R2, DeepSeek, PAT) sont chiffrées en AES-256-GCM dans le coffre-fort write-only — **jamais** en clair, **jamais** dans le code, et le fallback global ne s'applique **qu'au site de l'agence**.
- Le bucket R2 du client n'est accessible qu'avec **son** token scoped ; l'upload se fait en URL présignée temporaire.
- Aucun octet média ne transite par le Worker du webmaster (upload direct bucket → CDN client).
