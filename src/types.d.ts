/// <reference types="astro/client" />

/**
 * Global types for Studio Clarté.
 *
 * ⚠️ This file is deliberately a GLOBAL SCRIPT (no root-level imports/exports):
 * a `declare module "…"` inside a module file would be treated as a plain
 * AUGMENTATION (silently ignored when the target module does not exist),
 * whereas in a global script it properly declares an ambient module.
 * External types are referenced via inline `import()`.
 *
 * NB: we do NOT load `@cloudflare/workers-types` globally (it conflicts with
 * the DOM lib for `Request`/`Response`/`ReadableStream`). The minimal types
 * needed are declared here:
 *  - `ExecutionContext` (structural, required by @astrojs/cloudflare) ;
 *  - the `cloudflare:workers` module (access to the `env` bindings) ;
 *  - the `App.Locals` augmentation (per-request context set by the middleware).
 */

/** Minimal structural type for the Cloudflare execution context (adapter v14). */
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
  props: unknown;
}

/** Cloudflare runtime module — exposed by @astrojs/cloudflare v14+. */
declare module 'cloudflare:workers' {
  export const env: import('./env').CloudflareEnv;
}

/** `App.Locals` augmentation — per-request context set by the middleware. */
declare namespace App {
  interface Locals {
    /** Typed Cloudflare bindings (KV, R2, secrets…). */
    env: import('./env').CloudflareEnv;
    /** Client site config detected from the subdomain. */
    siteConfig: import('./config/sites').SiteConfig | null;
    /** True when the domain belongs to the agency (Super-Admin mode). */
    isAgency: boolean;
    /** Authenticated GitHub user (null when logged out). */
    user: import('./env').SessionUser | null;
    /** Active UI locale ('fr' | 'en'). */
    lang: import('./i18n').Locale;
  }
}
