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
  'header.settings': 'Paramètres',
  'header.logout': 'Quitter',
  'header.whiteLabel': 'Marque Blanche',
  'header.superAdmin': 'Mode Super-Admin',
  'header.activeSite': 'Site actif',

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
  'chat.toastGitMode': 'Image prête pour le commit Git (R2 non configuré pour ce site)',
  'chat.toastUploadFailed': 'Échec du téléversement R2',
  'chat.noPayload': 'Réponse générée sans payload structuré — précisez la demande',
  'chat.noPayloadNote':
    "Aucun fichier structuré détecté. Pour générer du contenu, précisez une demande claire (ex: « génère la page Offres ») ou relancez la génération.",
  'chat.truncatedNote':
    "⚠️ Réponse tronquée : le contenu demandé dépasse la limite de sortie du modèle. Scindez la demande (ex: un fichier à la fois) ou demandez un périmètre plus réduit.",
  'chat.invalidPayload': 'Payload reçu mais aucun fichier exploitable',
  'chat.filesReady': (n: number) => `${n} fichier(s) généré(s) ✓ — prêt pour le draft PR`,
  'chat.streamError': '⚠️ Erreur réseau lors du streaming',

  // ── Preview ──────────────────────────────────────────────────────
  'preview.title': '📄 Fichiers concernés',
  'preview.empty': 'Aucun contenu — générez via le chat IA.',
  'preview.emptyDetail':
    "Les fichiers générés par l'assistant IA apparaîtront ici, navigables par onglets, avec une vue visuelle ou un aperçu du code.",
  'preview.visual': 'Vue visuelle',
  'preview.code': 'Code',
  'preview.copy': 'Copier',
  'preview.download': 'Télécharger',
  'preview.edit': 'Éditer',
  'preview.save': 'Enregistrer',
  'preview.cancel': 'Annuler',
  'preview.modified': 'Modifié',
  'preview.editorHint':
    'Édition du fichier — Tab insère 2 espaces, Ctrl/⌘+S enregistre.',
  'preview.saved': (path: string) => `« ${path} » enregistré ✓ (pris en compte dans la PR)`,
  'preview.meta': (n: number, kb: string, title: string) =>
    `${n} fichier(s) · ${kb} Ko · ${title}`,
  'preview.copied': (path: string) => `« ${path} » copié ✓`,
  'preview.copyFailed': 'Copie impossible',

  // ── Workflow (simplifié client) ─────────────────────────────────
  'workflow.title': '🚀 Publication',
  'workflow.sub': 'Pré-visualisez puis publiez vos changements en toute sécurité.',
  'workflow.step1': 'Pré-visualisation',
  'workflow.step2': 'Validation & déploiement',
  'workflow.createPreview': '👁️ Créer la pré-visualisation',
  'workflow.creating': '⏳ Création de la pré-visualisation…',
  'workflow.step1Hint':
    'Générez une pré-visualisation de votre site avec les changements.',
  'workflow.step2Hint': 'Lorsque la pré-visualisation vous convient, publiez-la en production.',
  'workflow.viewPreview': '👁️ Voir la Pré-visualisation ↗',
  'workflow.previewReady': 'Pré-visualisation prête ✓',
  'workflow.previewFailed': '⚠️ La pré-visualisation a échoué.',
  'workflow.previewBuilding': 'Pré-visualisation en cours…',
  'workflow.previewPending': 'Pré-visualisation en attente…',
  'workflow.statusError': '⚠️ Impossible de vérifier le statut (nouvel essai…).',
  'workflow.noPreviewHint':
    'La pré-visualisation prend un peu de temps… (voir « Détails techniques » si besoin)',
  'workflow.techDetails': 'Détails techniques',
  'workflow.techPrLink': (n: number) => `Voir la Pull Request #${n} ↗`,
  'workflow.viewBuild': 'Voir le détail du build ↗',
  'workflow.step4Hint':
    'Squash & merge vers main, puis suppression de la branche temporaire.',
  'workflow.merge': '🚀 Valider & Déployer en Prod',
  'workflow.merging': '⏳ Publication en cours…',
  'workflow.mergedDone': '✅ Publié en production !',
  'workflow.mergedNote': (n: number) => `Publication effectuée (PR #${n}).`,
  'workflow.toastPayloadReady': 'Contenu prêt — créez la pré-visualisation',
  'workflow.toastPrCreated': () => 'Pré-visualisation lancée ✓',
  'workflow.toastPreviewReady': 'Pré-visualisation disponible ✓',
  'workflow.toastMerged': '🚀 Publié en production !',
  'workflow.toastCreateFailed': 'Échec de la création de la pré-visualisation',
  'workflow.toastMergeFailed': 'Publication impossible',

  // ── Rollback (time machine / undo publish) ────────────────────────
  'rollback.title': '🕘 Historique & Rollback',
  'rollback.sub': "Revenez à une version précédente en cas d'erreur.",
  'rollback.note': (branch: string) =>
    `La restauration crée un nouveau commit « revert » sur ${branch} : rien n'est supprimé ni réécrit, la production est reconstruite automatiquement.`,
  'rollback.loading': 'Chargement de l’historique…',
  'rollback.empty': 'Aucune version publiée sur cette branche.',
  'rollback.error': '⚠️ Impossible de charger l’historique (nouvel essai…).',
  'rollback.current': 'Version actuelle',
  'rollback.restore': '↩️ Restaurer',
  'rollback.confirm': '⚠️ Confirmer la restauration ?',
  'rollback.restoring': '⏳ Restauration…',
  'rollback.restored': (sha: string) =>
    `✅ Version ${sha} restaurée — production reconstruite.`,
  'rollback.failed': 'Restauration impossible',
  'rollback.undo': 'Annuler',
  'rollback.mergedUndo': '🚀 Publié en production',
  'rollback.undone': '↩️ Publication annulée — version précédente restaurée.',
  'rollback.authorYou': 'vous',

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
  'settings.sectionR2': '🖼️ Images — stockage R2 du client',
  'settings.r2GuideTitle': 'Comment configurer le stockage R2 du client',
  'settings.r2StatusConfigured': 'R2 client configuré — upload direct',
  'settings.r2StatusNoKeys': 'R2 configuré mais clés manquantes — mode Git actif',
  'settings.r2StatusGit': 'Mode Git actif — images commitées dans le repo',
  'settings.r2Step1': 'Sur le compte Cloudflare du CLIENT : créez le bucket R2 (ex. client-a-media).',
  'settings.r2Step2':
    "Attachez son domaine CDN (bucket → Settings → Custom Domains) et activez l'accès public.",
  'settings.r2Step3':
    'Créez un Account API token R2 (R2 → Overview → Manage → API Tokens) avec la permission « Object Read & Write » limitée à ce bucket, puis collez les deux valeurs ci-dessous (le Secret n\'est affiché qu\'une fois).',
  'settings.r2Step4':
    'Renseignez r2AccountId et r2Bucket dans la config du site (SITE_OVERRIDES) — les clés sont chiffrées ici, write-only.',
  'settings.r2Step5':
    'Sans R2, les images sont commitées dans le repo (mode Git) — aucun coût Cloudflare.',
  'settings.fieldR2AccessKey': 'Cloudflare R2 — Access Key ID',
  'settings.fieldR2Secret': 'Cloudflare R2 — Secret Access Key',
  'settings.placeholderR2Key': '… (écrire une nouvelle valeur pour remplacer)',
  'settings.hintR2AccessKey':
    "Token API R2 du client, restreint à SON bucket (Object Read & Write). Nécessite r2AccountId/r2Bucket dans la config du site.",
  'settings.hintR2Secret':
    'Partie secrète du token R2 du client — stockée chiffrée, write-only.',
  'settings.notConfigured': 'non configurée',
  'settings.configured': 'configurée (write-only)',
  'settings.configuredEnv': 'configurée (fallback global)',
  'settings.envHint':
    'Les clés globales (secrets Worker) ne servent de fallback que pour le site de l\'agence. Les clients doivent saisir leurs propres clés ici — aucun frais API ne leur est facturé à votre place.',
  'settings.save': '💾 Enregistrer les clés',
  'settings.cancel': 'Fermer',
  'settings.saving': '⏳ Chiffrement…',
  'settings.toastReadFailed': 'Impossible de lire les clés configurées',
  'settings.toastEmpty': 'Saisissez au moins une clé à enregistrer',
  'settings.toastSaved': 'Clés chiffrées et enregistrées ✓ (write-only)',

  // ── Language switcher ────────────────────────────────────────────
  'lang.label': 'Langue',
};

const en: Dictionary = {
  'header.settings': 'Settings',
  'header.logout': 'Log out',
  'header.whiteLabel': 'White Label',
  'header.superAdmin': 'Super-Admin Mode',
  'header.activeSite': 'Active site',

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
  'chat.toastGitMode': 'Image ready for Git commit (no R2 configured for this site)',
  'chat.toastUploadFailed': 'R2 upload failed',
  'chat.noPayload':
    'Response generated without a structured payload — please be more specific',
  'chat.noPayloadNote':
    'No structured files detected. To generate content, give a clear request (e.g. "generate the Services page") or retry the generation.',
  'chat.truncatedNote':
    '⚠️ Truncated response: the requested content exceeds the model output limit. Split the request (e.g. one file at a time) or ask for a smaller scope.',
  'chat.invalidPayload': 'Payload received but no usable files',
  'chat.filesReady': (n: number) => `${n} file(s) generated ✓ — ready for the draft PR`,
  'chat.streamError': '⚠️ Network error while streaming',

  'preview.title': '📄 Affected files',
  'preview.empty': 'No content yet — generate via the AI chat.',
  'preview.emptyDetail':
    'Files generated by the AI assistant will appear here, browsable in tabs, with a visual view or a code preview.',
  'preview.visual': 'Visual view',
  'preview.code': 'Code',
  'preview.copy': 'Copy',
  'preview.download': 'Download',
  'preview.edit': 'Edit',
  'preview.save': 'Save',
  'preview.cancel': 'Cancel',
  'preview.modified': 'Modified',
  'preview.editorHint':
    'Editing the file — Tab inserts 2 spaces, Ctrl/⌘+S saves.',
  'preview.saved': (path: string) => `« ${path} » saved ✓ (included in the PR)`,
  'preview.meta': (n: number, kb: string, title: string) =>
    `${n} file(s) · ${kb} KB · ${title}`,
  'preview.copied': (path: string) => `« ${path} » copied ✓`,
  'preview.copyFailed': 'Copy failed',

  'workflow.title': '🚀 Publishing',
  'workflow.sub': 'Preview then safely publish your changes.',
  'workflow.step1': 'Preview',
  'workflow.step2': 'Validation & deployment',
  'workflow.createPreview': '👁️ Create the preview',
  'workflow.creating': '⏳ Creating the preview…',
  'workflow.step1Hint': 'Generate a preview of your site with the changes.',
  'workflow.step2Hint': 'When the preview looks right, publish it to production.',
  'workflow.viewPreview': '👁️ View the Preview ↗',
  'workflow.previewReady': 'Preview ready ✓',
  'workflow.previewFailed': '⚠️ The preview failed.',
  'workflow.previewBuilding': 'Preview in progress…',
  'workflow.previewPending': 'Preview pending…',
  'workflow.statusError': '⚠️ Unable to check the status (retrying…).',
  'workflow.noPreviewHint':
    'The preview takes a moment… (see “Technical details” if needed)',
  'workflow.techDetails': 'Technical details',
  'workflow.techPrLink': (n: number) => `View Pull Request #${n} ↗`,
  'workflow.viewBuild': 'View the build ↗',
  'workflow.step4Hint': 'Squash & merge to main, then deletion of the temporary branch.',
  'workflow.merge': '🚀 Validate & Deploy to Prod',
  'workflow.merging': '⏳ Publishing…',
  'workflow.mergedDone': '✅ Published to production!',
  'workflow.mergedNote': (n: number) => `Published (PR #${n}).`,
  'workflow.toastPayloadReady': 'Content ready — create the preview',
  'workflow.toastPrCreated': () => 'Preview launched ✓',
  'workflow.toastPreviewReady': 'Preview available ✓',
  'workflow.toastMerged': '🚀 Published to production!',
  'workflow.toastCreateFailed': 'Preview creation failed',
  'workflow.toastMergeFailed': 'Publishing failed',

  'rollback.title': '🕘 History & Rollback',
  'rollback.sub': 'Go back to a previous version if something went wrong.',
  'rollback.note': (branch: string) =>
    `Restoring creates a new “revert” commit on ${branch}: nothing is deleted or rewritten, production is rebuilt automatically.`,
  'rollback.loading': 'Loading history…',
  'rollback.empty': 'No published versions on this branch yet.',
  'rollback.error': '⚠️ Unable to load the history (retrying…).',
  'rollback.current': 'Current version',
  'rollback.restore': '↩️ Restore',
  'rollback.confirm': '⚠️ Confirm restore?',
  'rollback.restoring': '⏳ Restoring…',
  'rollback.restored': (sha: string) =>
    `✅ Version ${sha} restored — production rebuilt.`,
  'rollback.failed': 'Restore failed',
  'rollback.undo': 'Undo',
  'rollback.mergedUndo': '🚀 Published to production',
  'rollback.undone': '↩️ Publish undone — previous version restored.',
  'rollback.authorYou': 'you',

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
  'settings.sectionR2': '🖼️ Images — client R2 storage',
  'settings.r2GuideTitle': 'How to configure client R2 storage',
  'settings.r2StatusConfigured': 'Client R2 configured — direct upload',
  'settings.r2StatusNoKeys': 'R2 configured but keys missing — Git mode active',
  'settings.r2StatusGit': 'Git mode active — images committed to the repo',
  'settings.r2Step1': "On the CLIENT's Cloudflare account: create the R2 bucket (e.g. client-a-media).",
  'settings.r2Step2':
    'Attach their CDN domain (bucket → Settings → Custom Domains) and enable public access.',
  'settings.r2Step3':
    "Create an R2 Account API token (R2 → Overview → Manage → API Tokens) with the 'Object Read & Write' permission restricted to this bucket, then paste both values below (the Secret is shown only once).",
  'settings.r2Step4':
    'Set r2AccountId and r2Bucket in the site config (SITE_OVERRIDES) — keys are encrypted here, write-only.',
  'settings.r2Step5':
    'Without R2, images are committed to the repo (Git mode) — no Cloudflare cost.',
  'settings.fieldR2AccessKey': 'Cloudflare R2 — Access Key ID',
  'settings.fieldR2Secret': 'Cloudflare R2 — Secret Access Key',
  'settings.placeholderR2Key': '… (type a new value to replace)',
  'settings.hintR2AccessKey':
    'Client R2 API token, scoped to THEIR bucket (Object Read & Write). Requires r2AccountId/r2Bucket in the site config.',
  'settings.hintR2Secret':
    'Secret part of the client R2 token — stored encrypted, write-only.',
  'settings.notConfigured': 'not configured',
  'settings.configured': 'configured (write-only)',
  'settings.configuredEnv': 'configured (global fallback)',
  'settings.envHint':
    'Global keys (Worker secrets) only fall back for the AGENCY site. Clients must enter their own keys here — no API costs are ever paid on their behalf.',
  'settings.save': '💾 Save keys',
  'settings.cancel': 'Close',
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
