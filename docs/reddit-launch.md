# 🚀 Lancement Reddit — plan & stratégie

> Document de travail : suite à réaliser et stratégie de lancement.
> Statut : à compléter au prochain round de travail.

---

## 1. État actuel (✅ fait)

- **Site live** : https://studio-clarte.cedricv.com/ (EN) et `/fr/` — 200 OK, ~0.14 s.
- **Landing complète** : captures réelles (dashboard, editor, publish, vault),
  tableau comparatif « vs outils existants », tarifs (gratuit + managé 99 CHF/an),
  section limitations assumées, FR + EN.
- **README à jour** : features, limites, docs (`architecture.md`,
  `client-onboarding.md`), licence BSD-3-Clause.
- **Open source + auto-hébergement gratuit** : le meilleur atout pour Reddit.

## 2. Suite à réaliser (todos priorisés)

### 🔴 Bloquant
- [ ] **Démo live** — instance de démonstration accessible (compte invité/démo),
      avec un repo de test contenant du contenu d'exemple. Sans elle, pas de post
      sur r/SaaS ni r/indiehackers ; r/selfhosted peut passer sans, mais c'est un
      gros plus.
      Pistes : clés IA de l'agence en fallback global (limité au site démo),
      mode « demo » sans inscription, repo `studio-clarte-demo-content`.

### 🟠 Important
- [ ] **Waitlist « Hébergé » (99 CHF/an)** — aujourd'hui elle pointe vers un
      GitHub issue. À soigner : date cible annoncée, ou retirer « Bientôt
      disponible » ; Reddit déteste les waitlist sans horizon.
- [ ] **Choix de l'angle** — le produit cible agences (multi-tenant) ET
      propriétaires solo. Décider : un message principal (recommandé : sécurité +
      pipeline de publication) et un secondaire (agences), ou deux posts distincts.
- [ ] **Réponses aux critiques probables** — préparer les réponses à :
      1. « Pourquoi pas un headless CMS existant ? »
      2. « Comment sont sécurisées les clés IA ? » (vault AES-256-GCM, masquées)
      3. « Combien ça coûte en tokens/API ? » (clés client, R2 client)
      4. « Et si la CI du client ne tourne pas ? » (préview dépend de la CI)
      5. « Un site statique + chat IA, c'est pas un CMS ? » (différenciation)
- [ ] **Vérifier l'og-image** sur les réseaux (1200×630, texte lisible).

### 🟡 Nice-to-have
- [ ] **Guide de contribution** (CONTRIBUTING.md) pour attirer les devs.
- [ ] **Un cas d'usage réel chiffré** (ex. instant-academie) : nombre de pages
      générées, temps gagné, validation humaine.

## 3. Stratégie Reddit — règles d'or

1. **Utile d'abord, produit ensuite** — le post doit résoudre un problème,
   pas vendre.
2. **Pas de lien tarifs en premier message** — un lien GitHub propre suffit.
3. **Répondre à TOUTES les critiques en commentaires** — c'est là que Reddit
   juge.
4. **Un seul subreddit par contenu** — pas de crosspost du même lien partout.
5. **Heure de post** : matin/heure de pointe US ou Europe.
6. **Ton honnête** : les sections Limitations du site/README sont un atout de
   crédibilité, les assumer en commentaire.

## 4. Sous-reddits cibles & angles

| Sub | Angle | Contenu | Statut |
|---|---|---|---|
| **r/selfhosted** | Sécurité : **jamais de commit direct sur `main`**, vault AES-256-GCM, preview CI avant publication | README + GitHub, captures | ✅ prêt |
| **r/webdev** | Technique : génération **multi-pages** (1 appel modèle/fichier, pas de troncature), éditeur intégré, preview Cloudflare | Détails architecture | ✅ prêt |
| **r/astro / r/eleventy** | Intégration stack statique + PR previews | Workflow précis (Pages/GitHub Actions) | ✅ prêt |
| **r/indiehackers** | Business : multi-tenant marque blanche pour agences, le **client paie** (99 CHF/an) | Modèle pricing | 🔴 attend démo |
| **r/SaaS** | Produit complet | Landing + démo | 🔴 attend démo |

### Formats recommandés
- **Post texte** : titre = problème → solution, ex. « J'ai construit un CMS IA
  qui ne commit jamais sur `main` » ; 3–5 phrases dans le corps, lien GitHub,
  détails en commentaire.
- **Pas de lien direct vers le produit** en titre.

## 5. Checklist avant chaque post

- [ ] Démo live accessible (si le sub l'exige)
- [ ] Titre = problème/solution, pas « mon produit »
- [ ] Lien GitHub dans le corps, pas de tarifs
- [ ] Réponses aux 5 questions probables prêtes
- [ ] Heure de post choisie (US/Europe)
- [ ] Vérifié que le lien ne pointe pas vers une page en construction

## 6. Mesures de succès

- **Engagement commentaires** (discussion > étoiles : c'est le signal Reddit)
- **Étoiles GitHub** sur `cedric-v/studio-clarte`
- **Inscriptions liste d'attente** (hébergé 99 CHF)
- **Issues/PR entrantes** (signe d'adoption dev)
