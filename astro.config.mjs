import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// Studio Clarté — Edge-native SSR admin on Cloudflare Compute.
// `output: 'server'`: all routes (pages + API) are rendered inside the Worker.
// `imageService: 'passthrough'`: images are served from the R2 CDN, no Cloudflare
// image transformation (optimization happens in the browser, WebP).
export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    imageService: 'passthrough',
  }),
  // Multi-tenant dev: allow every client subdomain (studio.client-a.ch…)
  // (no effect in production, where routing happens inside the Worker).
  server: {
    allowedHosts: true,
  },
});
