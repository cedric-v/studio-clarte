# Screenshots to provide — Captures à fournir

**EN** · This folder will hold the screenshots used in the main README and on the
promo site ([studio-clarte-website](https://github.com/cedric-v/studio-clarte-website)
→ `public/screenshots/`). Drop the files here as PNG, then wire the `<img>` tags
(see the integration steps below).

**FR** · Ce dossier accueillera les captures utilisées dans le README principal et
sur le site promo ([studio-clarte-website](https://github.com/cedric-v/studio-clarte-website)
→ `public/screenshots/`). Déposez les fichiers ici en PNG, puis câblez les balises
`<img>` (voir les étapes d'intégration ci-dessous).

---

## Remaining screenshots — Captures restantes

| File — Fichier | EN — What to show | FR — Contenu à montrer | Status — État |
|---|---|---|---|
| `dashboard.png` | Chat on the left, generated files + 2-step publish panel on the right — the whole workflow at a glance | Chat à gauche, fichiers générés + panneau de publication en 2 étapes à droite — tout le flux en un coup d'œil | ⏳ pending — à fournir |
| `editor.png` | A file open in « ✏️ Éditer » mode (monospace, save button, « Modifié » badge) — the human-in-the-loop aspect | Un fichier ouvert en « ✏️ Éditer » (monospace, bouton sauver, badge « Modifié ») — l'aspect humain dans la boucle | ⏳ pending — à fournir |
| `publish.png` | « Voir la Pré-visualisation ↗ » + « 🚀 Valider & Déployer en Prod » — the zero-risk preview → publish flow | « Voir la Pré-visualisation ↗ » + « 🚀 Valider & Déployer en Prod » — le flux preview → publication sans risque | ⏳ pending — à fournir |
| `vault.png` | Settings vault: keys shown masked (`sk-••••••••1234`) + R2 mini-guide — the write-only security model | Coffre-fort ⚙️ : clés masquées (`sk-••••••••1234`) + mini-guide R2 — le modèle de sécurité write-only | ⏳ pending — à fournir |

## Where they go — Où elles vont

```
studio-clarte/docs/screenshots/            → main README (📸 section)
studio-clarte-website/public/screenshots/  → promo landing (« See the workspace in action » / « Voyez l'atelier en action »)
```

## Format & privacy — Format et confidentialité

- **EN** · PNG (or WebP), max ~1200 px wide. Crop the app UI only — no browser
  chrome, no personal URLs. If the capture shows a chat, use the agency site or
  a demo site (the README is public — no real client data).
- **FR** · PNG (ou WebP), largeur max ~1200 px. Recadrez uniquement l'interface —
  pas de barres de navigateur ni d'URLs personnelles. Si la capture montre un
  chat, utilisez le site agence ou un site de démo (le README est public — pas
  de données réelles de client).

## Integration steps — Étapes d'intégration

1. **EN** · Drop the PNG files in this folder (and copy them into
   `studio-clarte-website/public/screenshots/`).
2. **EN** · Wire the `<img>` tags in the main README (📸 section) and in
   `public/index.html` / `public/fr/index.html` (replace the placeholder) —
   with `alt` text, `width`/`height` (no CLS) and `loading="lazy"`.
3. **EN** · Commit & push both repos.

**FR** · 1. Déposez les PNG dans ce dossier (et copiez-les dans
`studio-clarte-website/public/screenshots/`). 2. Câblez les balises `<img>` dans
le README principal (section 📸) et dans `public/index.html` / `public/fr/index.html`
(remplacez le placeholder) — avec `alt`, `width`/`height` (pas de CLS) et
`loading="lazy"`. 3. Commit & push des deux repos.
