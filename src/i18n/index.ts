/**
 * Internationalization — lightweight FR/EN dictionary.
 *
 * - Server-side (SSR templates): use `t(lang, key, ...args)` with
 *   `Astro.locals.lang` (set by the middleware from cookie / ?lang= /
 *   Accept-Language).
 * - Client-side (component scripts): use `getClientLocale()` + `t(...)`.
 *
 * The dictionary is plain data (no server APIs), so it can be imported
 * by both the server bundles and the browser bundles.
 */

export const LOCALES = ['fr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Detects the preferred locale from an Accept-Language header.
 * Defaults to French (the primary market of the app).
 */
export function detectLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return 'fr';
  const entries = acceptLanguage
    .split(',')
    .map((part) => {
      const [tag, q] = part.trim().split(';q=');
      return { tag: (tag ?? '').toLowerCase(), q: q ? Number.parseFloat(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { tag } of entries) {
    if (tag.startsWith('fr')) return 'fr';
    if (tag.startsWith('en')) return 'en';
  }
  return 'fr';
}

/** A dictionary entry is either a plain string or a template function.
 * `never[]` keeps full assignability (contravariance) while forbidding
 * accidental calls with arbitrary arguments at the type level. */
type Entry = string | ((...args: never[]) => string);
type Dictionary = Record<string, Entry>;

const fr: Dictionary = {
  // ── Header ────────────────────────────────────────────────────────
  'header.settings': '⚙️ Paramètres',
  'header.logout': '⎋ Quitter',
  'header.whiteLabel': 'Marque Blanche',
  'header.superAdmin': 'Mode Super-Admin',

  // ── Mobile tabs ──────────────────────────────────────────────────
  'tabs.chat': '💬 Assistant IA',
  'tabs.workspace': '📄 Aperçu & Déploiement',

  // ── Login ────────────────────────────────────────────────────────
  'login.subtitle': 'Studio Clarté — Administration de contenu',
  'login.signIn': 'Se connecter avec GitHub',
  'login.accessHint': (domain: string) =>
    `Accès réservé aux collaborateurs autorisés du site ${domain}.`,
  'login.unknownDomain': 'Domaine non reconnu par Studio Clarté.',
  'login.unknownDomainHint': (domain: string) =>
    `Utilisez le sous-domaine d'administration configuré (ex: ${domain}).`,

  // ── Chat ─────────────────────────────────────────────────────────
  'chat.welcomeTitle': (name: string) => `💬 Bonjour, ${name} !`,
  'chat.welcomeText': (cdn: string) =>
    `Décrivez le contenu à créer. Glissez-déposez une image ou faites Ctrl+V : elle sera compressée en WebP dans votre navigateur puis téléversée sur le CDN ${cdn}.`,
  'chat.suggestion1': 'Crée la page « Offres » avec 3 accompagnements',
  'chat.suggestion2': 'Rédige un article de blog sur notre méthode',
  'chat.suggestion3': 'Génère les témoignages clients (5 avis)',
  'chat.suggestion4': "Met à jour la page d'accueil (héro + 2 sections)",
  'chat.attach': 'Joindre une image',
  'chat.placeholder': 'Décrivez le contenu à créer… (Ctrl+V pour coller une image)',
  'chat.send': 'Envoyer ↵',
  'chat.composerHint':
    "Zero-Click Upload · WebP ≤1920px · DeepSeek génère l'alt text accessible",
  'chat.imageAlt': (name: string) => `Image téléversée — ${name}`,
  'chat.attachedImage': '(image jointe)',
  'chat.payloadNote':
    "📦 Contenu structuré généré — voir l'onglet « Aperçu & Déploiement ».",
  'chat.toastCompressing': (name: string) => `Compression WebP de « ${name} »…`,
  'chat.toastOptimized': (from: string) => `Image optimisée WebP ✓ (${from} → CDN)`,
  'chat.toastUploaded': 'Image téléversée ✓ (format non compressible)',
  'chat.toastImagesOnly': 'Seules les images sont acceptées',
  'chat.toastUploadFailed': 'Échec du téléversement R2',
  'chat.noPayload': 'Réponse générée sans payload structuré — précisez la demande',
  'chat.invalidPayload': 'Payload reçu mais aucun fichier exploitable',
  'chat.filesReady': (n: number) => `${n} fichier(s) généré(s) ✓ — prêt pour le draft PR`,
  'chat.streamError': '⚠️ Erreur réseau lors du streaming',

  // ── Preview ──────────────────────────────────────────────────────
  'preview.title': '📄 Fichiers générés',
  'preview.empty': 'Aucun contenu — générez via le chat IA.',
  'preview.emptyDetail':
    "Les fichiers générés par l'assistant IA apparaîtront ici, navigables par onglets, avec une vue visuelle ou un aperçu du code.",
  'preview.visual': 'Vue visuelle',
  'preview.code': 'Code',
  'preview.copy': '📋 Copier',
  'preview.download': '⬇️ Télécharger',
  'preview.meta': (n: number, kb: string, title: string) =>
    `${n} fichier(s) · ${kb} Ko · ${title}`,
  'preview.copied': (path: string) => `« ${path} » copié ✓`,
  'preview.copyFailed': 'Copie impossible',

  // ── Workflow ─────────────────────────────────────────────────────
  'workflow.title': '🚀 Déploiement Edge',
  'workflow.sub':
    "Branche draft/* + PR en ~1-2 s via l'API Git — zéro commit direct sur main.",
  'workflow.step1': 'Génération Edge',
  'workflow.step2': 'Draft PR Active',
  'workflow.step3': 'Preview Cloudflare',
  'workflow.step4': 'Validation',
  'workflow.createPr': '💾 Créer la branche draft/* + PR',
  'workflow.creating': '⏳ Création de la PR (Edge)…',
  'workflow.step1Hint':
    'Arbre Git construit en mémoire (git.createTree → createCommit → createRef → pulls.create).',
  'workflow.viewPr': 'Voir la Pull Request ↗',
  'workflow.prPending': 'En attente de création…',
  'workflow.prLink': (n: number, branch: string) => `PR #${n} · ${branch} ↗`,
  'workflow.step3Hint': 'La build de prévisualisation se lance automatiquement sur la PR.',
  'workflow.viewPreview': 'Voir la Preview ↗',
  'workflow.previewReady': 'Build de prévisualisation prête ✓',
  'workflow.previewFailed': '⚠️ La build de preview a échoué (voir la PR GitHub).',
  'workflow.previewBuilding': 'Build de prévisualisation en cours…',
  'workflow.previewPending': 'Build de prévisualisation en attente…',
  'workflow.statusError': '⚠️ Impossible de récupérer le statut (nouvel essai…).',
  'workflow.step4Hint':
    'Squash & merge vers main, puis suppression de la branche temporaire.',
  'workflow.merge': '🚀 Valider & Fusionner en Prod',
  'workflow.merging': '⏳ Fusion en cours…',
  'workflow.mergedDone': '✅ Publié sur main !',
  'workflow.mergedDone2': '✅ Fusionné & branch supprimée',
  'workflow.mergedNote': (n: number) => `PR #${n} fusionnée (squash) — branch supprimée.`,
  'workflow.toastPayloadReady': 'Contenu prêt — créez la branche draft/* + PR',
  'workflow.toastPrCreated': (n: number) => `PR #${n} créée en ~1-2 s ⚡`,
  'workflow.toastPreviewReady': 'Preview Cloudflare disponible ✓',
  'workflow.toastMerged': '🚀 Contenu publié en production !',
  'workflow.toastCreateFailed': 'Création de la PR échouée',
  'workflow.toastMergeFailed': 'Fusion impossible',

  // ── Settings (vault) ─────────────────────────────────────────────
  'settings.title': (name: string) => `🔐 Coffre-fort des clés API — ${name}`,
  'settings.close': 'Fermer',
  'settings.note':
    'Clés chiffrées en AES-256-GCM (Cloudflare KV) et stockées en write-only : une fois enregistrées, elles ne peuvent jamais être relues, affichées en clair ni copiées.',
  'settings.fieldDeepseek': 'DeepSeek (moteur IA)',
  'settings.fieldGithub': 'GitHub (Git Engine)',
  'settings.placeholderDeepseek': 'sk-… (écrire une nouvelle valeur pour remplacer)',
  'settings.placeholderGithub': 'github_pat_… (écrire une nouvelle valeur pour remplacer)',
  'settings.hintDeepseek': 'Utilisée pour générer la structure de contenu du site.',
  'settings.hintGithub': 'PAT avec scope repo : création des branches draft/* et des PR.',
  'settings.notConfigured': 'non configurée',
  'settings.configured': 'configurée (write-only)',
  'settings.save': '💾 Enregistrer les clés',
  'settings.saving': '⏳ Chiffrement…',
  'settings.toastReadFailed': 'Impossible de lire les clés configurées',
  'settings.toastEmpty': 'Saisissez au moins une clé à enregistrer',
  'settings.toastSaved': 'Clés chiffrées et enregistrées ✓ (write-only)',

  // ── Language switcher ────────────────────────────────────────────
  'lang.label': 'Langue',
};

const en: Dictionary = {
  'header.settings': '⚙️ Settings',
  'header.logout': '⎋ Log out',
  'header.whiteLabel': 'White Label',
  'header.superAdmin': 'Super-Admin Mode',

  'tabs.chat': '💬 AI Assistant',
  'tabs.workspace': '📄 Preview & Deploy',

  'login.subtitle': 'Studio Clarté — Content Administration',
  'login.signIn': 'Sign in with GitHub',
  'login.accessHint': (domain: string) =>
    `Access is restricted to authorized collaborators of ${domain}.`,
  'login.unknownDomain': 'Domain not recognized by Studio Clarté.',
  'login.unknownDomainHint': (domain: string) =>
    `Use the configured admin subdomain (e.g. ${domain}).`,

  'chat.welcomeTitle': (name: string) => `💬 Hello, ${name}!`,
  'chat.welcomeText': (cdn: string) =>
    `Describe the content to create. Drag & drop an image or press Ctrl+V: it will be compressed to WebP in your browser, then uploaded to the ${cdn} CDN.`,
  'chat.suggestion1': "Create the 'Services' page with 3 packages",
  'chat.suggestion2': 'Write a blog post about our method',
  'chat.suggestion3': 'Generate client testimonials (5 reviews)',
  'chat.suggestion4': 'Update the homepage (hero + 2 sections)',
  'chat.attach': 'Attach an image',
  'chat.placeholder': 'Describe the content to create… (Ctrl+V to paste an image)',
  'chat.send': 'Send ↵',
  'chat.composerHint':
    'Zero-Click Upload · WebP ≤1920px · DeepSeek generates accessible alt text',
  'chat.imageAlt': (name: string) => `Uploaded image — ${name}`,
  'chat.attachedImage': '(attached image)',
  'chat.payloadNote':
    "📦 Structured content generated — see the 'Preview & Deploy' tab.",
  'chat.toastCompressing': (name: string) => `Compressing « ${name} » to WebP…`,
  'chat.toastOptimized': (from: string) => `WebP image optimized ✓ (${from} → CDN)`,
  'chat.toastUploaded': 'Image uploaded ✓ (non-compressible format)',
  'chat.toastImagesOnly': 'Only images are accepted',
  'chat.toastUploadFailed': 'R2 upload failed',
  'chat.noPayload':
    'Response generated without a structured payload — please be more specific',
  'chat.invalidPayload': 'Payload received but no usable files',
  'chat.filesReady': (n: number) => `${n} file(s) generated ✓ — ready for the draft PR`,
  'chat.streamError': '⚠️ Network error while streaming',

  'preview.title': '📄 Generated files',
  'preview.empty': 'No content yet — generate via the AI chat.',
  'preview.emptyDetail':
    'Files generated by the AI assistant will appear here, browsable in tabs, with a visual view or a code preview.',
  'preview.visual': 'Visual view',
  'preview.code': 'Code',
  'preview.copy': '📋 Copy',
  'preview.download': '⬇️ Download',
  'preview.meta': (n: number, kb: string, title: string) =>
    `${n} file(s) · ${kb} KB · ${title}`,
  'preview.copied': (path: string) => `« ${path} » copied ✓`,
  'preview.copyFailed': 'Copy failed',

  'workflow.title': '🚀 Edge Deployment',
  'workflow.sub':
    'draft/* branch + PR in ~1-2 s via the Git API — zero direct commits to main.',
  'workflow.step1': 'Edge Generation',
  'workflow.step2': 'Draft PR Active',
  'workflow.step3': 'Cloudflare Preview',
  'workflow.step4': 'Validation',
  'workflow.createPr': '💾 Create draft/* branch + PR',
  'workflow.creating': '⏳ Creating the PR (Edge)…',
  'workflow.step1Hint':
    'Git tree built in memory (git.createTree → createCommit → createRef → pulls.create).',
  'workflow.viewPr': 'View the Pull Request ↗',
  'workflow.prPending': 'Awaiting creation…',
  'workflow.prLink': (n: number, branch: string) => `PR #${n} · ${branch} ↗`,
  'workflow.step3Hint': 'The preview build starts automatically on the PR.',
  'workflow.viewPreview': 'View the Preview ↗',
  'workflow.previewReady': 'Preview build ready ✓',
  'workflow.previewFailed': '⚠️ The preview build failed (see the GitHub PR).',
  'workflow.previewBuilding': 'Preview build in progress…',
  'workflow.previewPending': 'Preview build pending…',
  'workflow.statusError': '⚠️ Unable to fetch the status (retrying…).',
  'workflow.step4Hint': 'Squash & merge to main, then deletion of the temporary branch.',
  'workflow.merge': '🚀 Validate & Merge to Prod',
  'workflow.merging': '⏳ Merging…',
  'workflow.mergedDone': '✅ Published to main!',
  'workflow.mergedDone2': '✅ Merged & branch deleted',
  'workflow.mergedNote': (n: number) => `PR #${n} merged (squash) — branch deleted.`,
  'workflow.toastPayloadReady': 'Content ready — create the draft/* branch + PR',
  'workflow.toastPrCreated': (n: number) => `PR #${n} created in ~1-2 s ⚡`,
  'workflow.toastPreviewReady': 'Cloudflare preview available ✓',
  'workflow.toastMerged': '🚀 Content published to production!',
  'workflow.toastCreateFailed': 'PR creation failed',
  'workflow.toastMergeFailed': 'Merge failed',

  'settings.title': (name: string) => `🔐 API key vault — ${name}`,
  'settings.close': 'Close',
  'settings.note':
    'Keys are encrypted with AES-256-GCM (Cloudflare KV) and stored write-only: once saved, they can never be read back, displayed in plaintext, or copied.',
  'settings.fieldDeepseek': 'DeepSeek (AI engine)',
  'settings.fieldGithub': 'GitHub (Git Engine)',
  'settings.placeholderDeepseek': 'sk-… (type a new value to replace)',
  'settings.placeholderGithub': 'github_pat_… (type a new value to replace)',
  'settings.hintDeepseek': 'Used to generate the site content structure.',
  'settings.hintGithub': 'PAT with repo scope: draft/* branch and PR creation.',
  'settings.notConfigured': 'not configured',
  'settings.configured': 'configured (write-only)',
  'settings.save': '💾 Save keys',
  'settings.saving': '⏳ Encrypting…',
  'settings.toastReadFailed': 'Unable to read the configured keys',
  'settings.toastEmpty': 'Enter at least one key to save',
  'settings.toastSaved': 'Keys encrypted and saved ✓ (write-only)',

  'lang.label': 'Language',
};

export const translations = { fr, en } satisfies Record<Locale, Dictionary>;

/**
 * Resolves a translation key for a locale. Falls back to French, then to
 * the key itself (so a missing key degrades gracefully instead of crashing).
 */
export function t(locale: Locale, key: string, ...args: unknown[]): string {
  const entry = translations[locale][key] ?? translations.fr[key];
  if (typeof entry === 'function') return entry(...(args as never[]));
  return entry ?? key;
}

/** Client-side helper: reads the active locale from <html data-lang="…">. */
export function getClientLocale(): Locale {
  const lang = document.documentElement.dataset.lang;
  return isLocale(lang) ? lang : 'fr';
}
