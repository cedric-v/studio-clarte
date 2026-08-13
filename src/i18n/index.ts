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
  'header.whiteLabel': 'Studio Clarté',
  'header.superAdmin': 'Mode Super-Admin',
  'header.activeSite': 'Site actif',
  'header.reset': 'Réinitialiser',
  'header.resetTitle': 'Réinitialiser la session (chat + brouillon)',
  'header.resetConfirm': 'Confirmer ?',
  'toast.resetDone': 'Session réinitialisée ✓',
  'toast.nothingToReset': 'Rien à réinitialiser',
  'toast.resetWarn': 'Cela effacera le chat et le brouillon en cours.',
  'toast.resetWarnPr':
    'Une PR est ouverte : elle restera sur GitHub. Cela effacera le chat et le brouillon.',

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
  'chat.welcomeText': () =>
    'Décrivez le contenu à créer. Glissez-déposez une image ou faites Ctrl+V : elle sera intégrée au projet.',
  'chat.suggestion1': 'Intègre une nouvelle offre, demande moi toutes les informations requises',
  'chat.suggestion2': 'Modifie la page XYZ',
  'chat.suggestion3': "Intègre l'image ci-jointe sur la page XYZ à l'emplacement ABC",
  'chat.suggestion4': 'Rédige un article de blog sur le sujet XYZ',
  'chat.attach': 'Joindre une image',
  'chat.placeholder': 'Décrivez le contenu à créer… (Ctrl+V pour coller une image)',
  'chat.expandInput': 'Agrandir la zone de saisie',
  'chat.collapseInput': 'Réduire la zone de saisie',
  'chat.send': 'Envoyer',
  'chat.sendTitle': 'Envoyer le message',
  'chat.composerHint': 'Collez ici les images que vous souhaitez intégrer',
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
  'chat.noPayloadKeepDraft':
    'Aucun fichier structuré détecté — le brouillon précédent est conservé dans « Fichiers concernés ».',
  'chat.cancelDraftDone': '✅ Brouillon abandonné — aucune modification ne sera publiée.',
  'chat.cancelDraftPrOpen':
    '⚠️ Une pré-visualisation est ouverte : elle reste sur GitHub. Utilisez « ✕ Annuler la preview » pour la fermer.',
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
  'preview.diff': 'Différence',
  'preview.diffEmpty': 'Aucune modification',
  'preview.newFile': 'Ceci est un fichier nouveau généré par l\'IA.',
  'preview.open': 'Ouvrir',
  'preview.selectFile': '👆 Sélectionnez un fichier dans la liste pour voir son aperçu.',
  'preview.noDiff': 'Ce fichier est nouveau — aucune différence à afficher',
  'preview.discard': '🗑️ Abandonner le brouillon',
  'preview.discardConfirm':
    'Abandonner ce brouillon ? Les fichiers générés seront effacés — rien ne sera publié.',
  'preview.discardDone': 'Brouillon abandonné ✓',
  'preview.discardPrActive': 'Annulez d\'abord la pré-visualisation en cours.',

  // ── Workflow (simplifié client) ─────────────────────────────────
  'workflow.title': '☀️ Publication',
  'workflow.sub': 'Pré-visualisez puis publiez vos changements en toute sécurité.',
  'workflow.step1': 'Pré-visualisation',
  'workflow.step2': 'Validation & déploiement',
  'workflow.createPreview': '👁️ Créer la pré-visualisation',
  'workflow.creating': '⏳ Création de la pré-visualisation…',
  'workflow.autoPreview': 'Pré-visualisation automatique',
  'workflow.autoPreviewTitle': 'Lancer la pré-visualisation dès qu\'un contenu est généré',
  'workflow.autoPreviewNote':
    'Pendant le build, le contenu généré reste visible dans « Fichiers concernés ».',
  'workflow.autoPreviewStarted':
    '⚡ Pré-visualisation lancée automatiquement — pendant ce temps, le contenu est dans « Fichiers concernés ».',
  'workflow.step1Hint':
    'Générez une pré-visualisation de votre site avec les changements.',
  'workflow.step2Hint': 'Lorsque la pré-visualisation vous convient, publiez-la en production.',
  'workflow.viewPreview': '👁️ Voir la Pré-visualisation ↗',
  'workflow.pagesTitle': 'Pages modifiées — accès direct',
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
  'workflow.viewSite': '👁️ Voir le site ↗',
  'workflow.mergedNote': (n: number) => `Publication effectuée (PR #${n}).`,
  'workflow.toastPayloadReady': 'Contenu prêt — créez la pré-visualisation',
  'workflow.toastPrCreated': () => 'Pré-visualisation lancée ✓',
  'workflow.toastPreviewReady': 'Pré-visualisation disponible ✓',
  'workflow.toastMerged': '🚀 Publié en production !',
  'workflow.toastCreateFailed': 'Échec de la création de la pré-visualisation',
  'workflow.toastMergeFailed': 'Publication impossible',
  'workflow.mergeNote':
    '⚠️ Les checks qualité s\'exécutent après la fusion sur main — la mise en ligne n\'est effective que s\'ils passent.',
  'workflow.publishingPending':
    '⏳ Publication en cours — les checks qualité s\'exécutent sur main…',
  'workflow.publishingInProgress': '🚀 Déploiement en production en cours…',
  'workflow.publishFailed': '⚠️ Publication échouée',
  'workflow.mergedFailed': 'Publication échouée — checks qualité non passés sur main',
  'workflow.mergedFailedNote':
    'Publication échouée : le contenu est fusionné mais pas en ligne (checks qualité non passés sur main). Corrigez puis republiez, ou utilisez « Historique & Rollback ».',
  'workflow.mergeAwaiting': '⏳ En attente de confirmation…',
  'workflow.mergeAwaitingNote':
    'La publication est en cours de vérification (peut prendre quelques minutes). Vérifiez l\'état du déploiement sur GitHub.',
  'workflow.cancel': '✕ Annuler la preview',
  'workflow.cancelling': '⏳ Annulation…',
  'workflow.cancelConfirm': (n: number) =>
    `Fermer la preview (PR #${n}) et supprimer sa branche draft/* ? Le contenu du brouillon reste disponible.`,
  'workflow.cancelDone': (n: number) =>
    `Preview annulée — PR #${n} fermée et branche supprimée.`,
  'workflow.cancelFailed': 'Impossible d\'annuler la preview',

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
  'settings.placeholderDeepseek': 'sk-… (écrire une nouvelle valeur pour remplacer)',
  'settings.hintDeepseek': 'Utilisée pour générer la structure de contenu du site.',
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
  'settings.sectionOAuth': 'Connexion — GitHub OAuth du site',
  'settings.fieldOAuthClientId': 'GitHub OAuth — Client ID',
  'settings.fieldOAuthClientSecret': 'GitHub OAuth — Client Secret',
  'settings.placeholderOAuth': '… (écrire une nouvelle valeur pour remplacer)',
  'settings.hintOAuthClientId':
    "Client ID de l'OAuth App GitHub du site (GitHub → Settings → Developer settings → OAuth Apps). Chaque site a sa propre app : sa callback URL doit être https://studio.<ce-domaine>/api/auth/callback — une app GitHub n'accepte qu'une seule callback URL.",
  'settings.hintOAuthClientSecret':
    "Client Secret de l'OAuth App GitHub du site — stocké chiffré, write-only. Sans ces clés, la connexion sur ce sous-domaine est impossible (le fallback global ne correspond qu'au domaine de l'agence).",
  'settings.fieldAllowlist': 'GitHub — Logins autorisés (optionnel)',
  'settings.placeholderAllowlist': 'login1, login2 (vide = accès repo suffit)',
  'settings.hintAllowlist':
    'Liste blanche de logins GitHub (séparés par des virgules). Vide = tout compte GitHub ayant accès au dépôt du site (propriétaire ou collaborateur) peut se connecter.',
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
  'settings.toastNoChanges': 'Aucune nouvelle clé saisie — les clés existantes sont conservées',
  'settings.toastSaved': 'Clés chiffrées et enregistrées ✓ (write-only)',

  // ── Language switcher ────────────────────────────────────────────
  'lang.label': 'Langue',
};

const en: Dictionary = {
  'header.settings': 'Settings',
  'header.logout': 'Log out',
  'header.whiteLabel': 'Studio Clarté',
  'header.superAdmin': 'Super-Admin Mode',
  'header.activeSite': 'Active site',
  'header.reset': 'Reset',
  'header.resetTitle': 'Reset the session (chat + draft)',
  'header.resetConfirm': 'Confirm?',
  'toast.resetDone': 'Session reset ✓',
  'toast.nothingToReset': 'Nothing to reset',
  'toast.resetWarn': 'This will clear the chat and the current draft.',
  'toast.resetWarnPr':
    'An open PR will remain on GitHub. This clears the chat and the draft.',

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
  'chat.welcomeText': () =>
    'Describe the content to create. Drag & drop an image or press Ctrl+V: it will be added to the project.',
  'chat.suggestion1': 'Add a new offer — ask me for all the required information',
  'chat.suggestion2': 'Edit page XYZ',
  'chat.suggestion3': 'Place the attached image on page XYZ at position ABC',
  'chat.suggestion4': 'Write a blog post about topic XYZ',
  'chat.attach': 'Attach an image',
  'chat.placeholder': 'Describe the content to create… (Ctrl+V to paste an image)',
  'chat.expandInput': 'Enlarge the input area',
  'chat.collapseInput': 'Shrink the input area',
  'chat.send': 'Send',
  'chat.sendTitle': 'Send message',
  'chat.composerHint': 'Paste here the images you want to include',
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
  'chat.noPayloadKeepDraft':
    'No structured files detected — the previous draft is kept in "Affected files".',
  'chat.cancelDraftDone': '✅ Draft discarded — no changes will be published.',
  'chat.cancelDraftPrOpen':
    '⚠️ A preview is open: it stays on GitHub. Use “✕ Cancel the preview” to close it.',
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
  'preview.diff': 'Diff',
  'preview.diffEmpty': 'No changes',
  'preview.newFile': 'This is a new file generated by the AI.',
  'preview.open': 'Open',
  'preview.selectFile': '👆 Select a file from the list to view its preview.',
  'preview.noDiff': 'This is a new file — nothing to diff',
  'preview.discard': '🗑️ Discard the draft',
  'preview.discardConfirm':
    'Discard this draft? The generated files will be deleted — nothing will be published.',
  'preview.discardDone': 'Draft discarded ✓',
  'preview.discardPrActive': 'Cancel the ongoing preview first.',

  'workflow.title': '☀️ Publishing',
  'workflow.sub': 'Preview then safely publish your changes.',
  'workflow.step1': 'Preview',
  'workflow.step2': 'Validation & deployment',
  'workflow.createPreview': '👁️ Create the preview',
  'workflow.creating': '⏳ Creating the preview…',
  'workflow.autoPreview': 'Automatic preview',
  'workflow.autoPreviewTitle': 'Start the preview as soon as content is generated',
  'workflow.autoPreviewNote':
    'While the build runs, the generated content stays visible in "Affected files".',
  'workflow.autoPreviewStarted':
    '⚡ Preview started automatically — meanwhile, the content is in "Affected files".',
  'workflow.step1Hint': 'Generate a preview of your site with the changes.',
  'workflow.step2Hint': 'When the preview looks right, publish it to production.',
  'workflow.viewPreview': '👁️ View the Preview ↗',
  'workflow.pagesTitle': 'Modified pages — direct links',
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
  'workflow.viewSite': '👁️ View the site ↗',
  'workflow.mergedNote': (n: number) => `Published (PR #${n}).`,
  'workflow.toastPayloadReady': 'Content ready — create the preview',
  'workflow.toastPrCreated': () => 'Preview launched ✓',
  'workflow.toastPreviewReady': 'Preview available ✓',
  'workflow.toastMerged': '🚀 Published to production!',
  'workflow.toastCreateFailed': 'Preview creation failed',
  'workflow.toastMergeFailed': 'Publishing failed',
  'workflow.mergeNote':
    '⚠️ Quality checks run after the merge on main — the site only goes live if they pass.',
  'workflow.publishingPending': '⏳ Publishing — quality checks are running on main…',
  'workflow.publishingInProgress': '🚀 Deploying to production…',
  'workflow.publishFailed': '⚠️ Publish failed',
  'workflow.mergedFailed': 'Publish failed — quality checks did not pass on main',
  'workflow.mergedFailedNote':
    'Publish failed: the content is merged but not live (quality checks did not pass on main). Fix it and republish, or use "History & Rollback".',
  'workflow.mergeAwaiting': '⏳ Awaiting confirmation…',
  'workflow.mergeAwaitingNote':
    'The publish is being verified (can take a few minutes). Check the deployment status on GitHub.',
  'workflow.cancel': '✕ Cancel the preview',
  'workflow.cancelling': '⏳ Cancelling…',
  'workflow.cancelConfirm': (n: number) =>
    `Close the preview (PR #${n}) and delete its draft/* branch? The draft content stays available.`,
  'workflow.cancelDone': (n: number) =>
    `Preview cancelled — PR #${n} closed and branch deleted.`,
  'workflow.cancelFailed': 'Unable to cancel the preview',

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
  'settings.placeholderDeepseek': 'sk-… (type a new value to replace)',
  'settings.hintDeepseek': 'Used to generate the site content structure.',
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
  'settings.sectionOAuth': 'Login — site GitHub OAuth',
  'settings.fieldOAuthClientId': 'GitHub OAuth — Client ID',
  'settings.fieldOAuthClientSecret': 'GitHub OAuth — Client Secret',
  'settings.placeholderOAuth': '… (type a new value to replace)',
  'settings.hintOAuthClientId':
    "Client ID of the site's GitHub OAuth App (GitHub → Settings → Developer settings → OAuth Apps). Each site needs its own app: its callback URL must be https://studio.<this-domain>/api/auth/callback — a GitHub OAuth App accepts a single callback URL.",
  'settings.hintOAuthClientSecret':
    "Client Secret of the site's GitHub OAuth App — stored encrypted, write-only. Without these keys, login on this subdomain is impossible (the global fallback only matches the agency domain).",
  'settings.fieldAllowlist': 'GitHub — Allowed logins (optional)',
  'settings.placeholderAllowlist': 'login1, login2 (empty = repo access is enough)',
  'settings.hintAllowlist':
    'Whitelist of GitHub logins (comma-separated). Empty = any GitHub account with access to the site repo (owner or collaborator) can log in.',
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
  'settings.toastNoChanges': 'No new key entered — existing keys are kept',
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
