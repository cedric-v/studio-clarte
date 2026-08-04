import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// Studio Clarté — Admin SSR edge-native sur Cloudflare Compute.
// `output: 'server'` : toutes les routes (pages + API) sont rendues dans le Worker.
// `imageService: 'passthrough'` : les images sont servies depuis le CDN R2, pas de
// transformation d'image côté Cloudflare (optimisation faite dans le navigateur, WebP).
export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    imageService: 'passthrough',
  }),
  // Dev multi-tenant : autorise tous les sous-domaines clients (studio.client-a.ch…)
  // (sans effet en production, où le routage se fait dans le Worker).
  server: {
    allowedHosts: true,
  },
});
