/// <reference types="astro/client" />

/**
 * Types globaux du projet Studio Clarté.
 *
 * ⚠️ Ce fichier est un SCRIPT GLOBAL (aucun import/export racine) :
 *  - un `declare module "…"` dans un fichier-module serait une simple
 *    augmentation (ignorée si le module cible n'existe pas) ;
 *  - un `declare global` dans un script global ne fusionne pas avec les
 *    augmentations modules d'Astro → on utilise `declare namespace App`.
 *
 * NB : on ne charge PAS `@cloudflare/workers-types` globalement (conflit avec
 * la lib DOM pour `Request`/`Response`/`ReadableStream`). Les types des
 * bindings sont référencés via `import()` inline (types structurels définis
 * dans `src/env.ts`).
 */

/** Type structural minimal du contexte d'exécution Cloudflare (adapter v14). */
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
  props: unknown;
}

/** Module runtime Cloudflare — exposé par l'adaptateur @astrojs/cloudflare v14+. */
declare module 'cloudflare:workers' {
  export const env: import('./env').CloudflareEnv;
}

/** Augmentation `App.Locals` — contexte par requête posé par le middleware. */
declare namespace App {
  interface Locals {
    /** Bindings Cloudflare (KV, R2, secrets…) typés. */
    env: import('./env').CloudflareEnv;
    /** Configuration du site client détectée par sous-domaine. */
    siteConfig: import('./config/sites').SiteConfig | null;
    /** Vrai si le domaine correspond à l'agence (mode Super-Admin). */
    isAgency: boolean;
    /** Utilisateur GitHub authentifié (null si non connecté). */
    user: import('./env').SessionUser | null;
  }
}
