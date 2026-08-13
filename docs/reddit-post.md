# Reddit post draft — Studio Clarté

> Target: `r/selfhosted` (primary) — also fits `r/opensource`, `r/Astro`, `r/webdev`.
> Post in English for maximum reach. Keep the tone honest, dev-to-dev, no hype.
> ⚠️ Add screenshots (docs/screenshots/) BEFORE posting — a post without visuals underperforms.

---

## Title options

1. **"I built an open-source AI content studio for static sites — it reads your repo, generates multi-page content, and publishes via PR, never touching main"**
2. **"Static site CMSs give you editing, ChatGPT gives you generation — I built the missing pipeline between them (open source)"**
3. **"Studio Clarté: an AI assistant that edits your Astro/Eleventy site repo, previews on Cloudflare, and publishes via PR. No CMS migration. BSD-3."**

---

## Body

**Studio Clarté** is an open-source AI content studio for static sites
(Astro, Eleventy, any static stack). Instead of being another CMS or another
chat that makes you copy-paste into files, it connects both:

1. **Ask in plain language** — "add an offer page, an order form and an opt-in page"
2. **The AI reads your repo first** (`listFiles` / `readFile`) so it finds the right
   files, keeps your frontmatter and permalinks, and makes minimal edits
3. **Multi-page generation** — it plans the files, then generates each page in its
   own model call (no truncation), and assembles everything into a single PR
4. **Human review** — an integrated PagesCMS-style editor + a diff view that shows
   only what the AI changed; reviewers never face raw markup by default
5. **Preview → publish** — a Cloudflare preview build runs on the PR, the studio
   links you directly to the modified pages, and only then can you
   "Validate & Deploy to Prod" (squash & merge). Rollback in one tap.

**The part I care most about: it never commits to `main` directly.**
Every generation creates a `draft/*` branch + PR in ~1–2 s via the GitHub Git API
(`createTree → createCommit → createRef → pulls.create`). Publishing is always a
human action after a visual preview.

**Built for two audiences:**
- **Site owners** — a personal AI content studio for your own static site
- **Agencies** — one deployment, one white-label studio subdomain per client
  (`studio.client-a.ch`), each with its own repo, theme, system prompt and keys.
  Images go to the **client's own R2 bucket** (their account, their costs) via
  presigned URLs — the worker never transits a media byte.

**Stack:** Astro SSR on Cloudflare Workers · DeepSeek (`deepseek-chat`) ·
Direct Git API · R2 · AES-256-GCM write-only key vault (keys are only ever shown
masked: `sk-••••••••1234`) · FR/EN · **BSD 3-Clause**.

Screenshots: [insert links or inline images]

**Repo:** https://github.com/cedric-v/studio-clarte
**Live demo:** https://studio-clarte.cedricv.com/

Honest status: v0.1, actively developed, documented for self-hosting
(`docs/architecture.md`, client onboarding guide, GitHub Actions preview workflow
included). The workflow-tracker (deploy status after merge) and rollback are the
newest pieces.

I'd love feedback on:
- the **preview → publish** flow (is the 2-tier review — instant render + CI preview — overkill or just right?)
- the **multi-page generation** approach (plan → one model call per file)
- anything that would make you run this for a client this week

---

## Posting tips

- Post to **one** subreddit first, wait 2–3 days before cross-posting elsewhere.
- `r/webdev`: only if your account has recent participation there (their self-promo
  rule is strict). Answer comments generously — that's where the karma (and users) are.
- Mention the **self-host friendly** angle in a comment (no vendor lock-in, BSD-3,
  bring-your-own DeepSeek key) — it resonates strongly on `r/selfhosted`.
- Add `Show HN`-style context if you post on Hacker News later (no screenshots needed there).

---

## French version (if posting on a FR community — r/developpeurs, r/programmation)

**Studio Clarté** — un studio de contenu IA open-source pour sites statiques
(Astro, Eleventy…). Au lieu d'être un énième CMS ou un chat à copier-coller :

1. Vous demandez en langage naturel : « ajoute une page offre, un formulaire de
   commande et une page opt-in »
2. L'IA **lit d'abord votre repo** pour retrouver les bons fichiers, préserver
   votre frontmatter et vos permaliens, et faire des modifications minimales
3. Génération **multi-pages** : un appel modèle par fichier (pas de troncature),
   le tout assemblé dans **une seule PR**
4. Relecture humaine : éditeur intégré + vue diff qui montre uniquement ce que
   l'IA a changé
5. Prévisualisation Cloudflare sur la PR → lien direct vers les pages modifiées →
   « Valider & Déployer » (squash & merge), rollback en un clic

**Jamais de commit direct sur `main`** : chaque génération crée une branche
`draft/*` + une PR en ~1–2 s (GitHub Git API). Publier reste toujours une action
humaine après prévisualisation.

Deux usages : le propriétaire de site solo, et l'agence en **white-label
multi-tenant** (un sous-domaine par client, clés et stockage R2 chez le client,
coffre-fort AES-256-GCM en écriture seule, clés masquées `sk-••••••••1234`).

Stack : Astro SSR sur Cloudflare Workers · DeepSeek · GitHub Git API · R2 ·
i18n FR/EN · **Licence BSD 3-Clause**.

Repo : https://github.com/cedric-v/studio-clarte
Démo : https://studio-clarte.cedricv.com/
