import { getTrending, getPopular, buildSlug } from '../lib/tmdb.js';

// Dynamic sitemap: real catalog URLs generated from TMDB popularity feeds.
// Replaces the static 3-URL sitemap served by the legacy site.
export const GET = async ({ locals }) => {
  const env = locals.runtime?.env;
  const SITE = 'https://streamheaven.online';

  const urls = new Set([
    `${SITE}/`,
    `${SITE}/trending`,
    `${SITE}/anime`,
    `${SITE}/genres`,
    `${SITE}/privacy.html`
  ]);

  const feeds = await Promise.all([
    getTrending(env, 1),
    getTrending(env, 2),
    getPopular('movie', env, 1),
    getPopular('movie', env, 2),
    getPopular('movie', env, 3),
    getPopular('tv', env, 1),
    getPopular('tv', env, 2),
    getPopular('tv', env, 3)
  ]);

  for (const feed of feeds) {
    for (const item of feed?.results ?? []) {
      if (!item.poster_path) continue;
      if (item.title || item.media_type === 'movie') urls.add(`${SITE}/movie/${buildSlug(item)}`);
      else if (item.name || item.media_type === 'tv') urls.add(`${SITE}/series/${buildSlug(item)}`);
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...urls].map((u) => `  <url><loc>${u}</loc><changefreq>daily</changefreq></url>`).join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400'
    }
  });
};
