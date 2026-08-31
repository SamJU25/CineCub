import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// StreamHeaven storefront — SEO catalog layer
// Deployed as a full-stack Cloudflare Worker (static assets + SSR)
export default defineConfig({
  site: 'https://streamheaven.online',
  output: 'server',
  adapter: cloudflare({
    // No Cloudflare Images binding needed — posters come from image.tmdb.org
    imageService: 'passthrough',
    // Expose locals.runtime.env in `astro dev` from wrangler.jsonc / .dev.vars
    platformProxy: { enabled: true }
  }),
  vite: {
    build: {
      // Keep the worker bundle lean
      minify: 'esbuild'
    }
  }
});
