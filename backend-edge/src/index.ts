import type { Env } from './env';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Range, Authorization',
  'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
  'Access-Control-Max-Age': '86400',
};

function getBackendUrl(env: Env): string {
  return env.GO_BACKEND_URL || env.RENDER_BASE_URL || 'https://steamheaven.onrender.com';
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const backendBase = getBackendUrl(env).replace(/\/+$/, '');

    // App Version Check endpoint (immune to zone-level managed challenges)
    if (url.pathname === '/version.json') {
      return new Response(
        JSON.stringify({
          appName: 'CineCub',
          versionName: '1.7.1',
          versionCode: 21,
          apkUrl: 'https://cinecub.stream/CineCub.apk?v=171',
          apkSha256: 'c7e96386dc66cb621550d5c95cdb09aec15225dc58960134ed430168dd4df564',
          downloadUrl: 'https://cinecub.stream/CineCub.apk?v=171',
          minSupportedVersion: 1,
          mandatory: false,
          releaseNotes: 'CineCub 1.7.1: Enhanced Google Sign-In with full annotation preservation, automatic browser OAuth fallback, and streaming performance updates.',
          updatedAt: '2026-09-17T08:14:00Z',
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=60, s-maxage=60',
            ...CORS_HEADERS,
          },
        }
      );
    }

    // Direct APK download proxy (completely immune to zone-level Bot Fight Mode)
    if (url.pathname === '/CineCub.apk' || url.pathname === '/StreamHeaven.apk') {
      try {
        let apkResp = await fetch(`${backendBase}/CineCub.apk`, {
          headers: { 'User-Agent': 'CineCubEdge/1.5' },
        });
        if (!apkResp.ok) {
          apkResp = await fetch(`${backendBase}/StreamHeaven.apk`, {
            headers: { 'User-Agent': 'CineCubEdge/1.5' },
          });
        }
        if (apkResp.ok) {
          return new Response(apkResp.body, {
            status: 200,
            headers: {
              'Content-Type': 'application/vnd.android.package-archive',
              'Content-Disposition': 'attachment; filename="CineCub.apk"',
              'Content-Length': apkResp.headers.get('content-length') || '',
              ...CORS_HEADERS,
            },
          });
        }
      } catch (err) {
        console.error('[APK Proxy Error]', err);
      }
    }

    // Health check endpoint
    if (url.pathname === '/api/health') {
      try {
        const goResp = await fetch(`${backendBase}/api/health`, {
          signal: AbortSignal.timeout(5000),
        });
        const goData = await goResp.json().catch(() => ({}));
        return new Response(
          JSON.stringify({
            edge: 'ok',
            edgeLocation: request.cf?.colo ?? 'edge',
            goBackend: goData,
            time: new Date().toISOString(),
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
          }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({
            edge: 'ok',
            edgeLocation: request.cf?.colo ?? 'edge',
            goBackend: { status: 'unreachable', error: String(err) },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
          }
        );
      }
    }

    // Edge-cached stream gateway
    if (url.pathname.startsWith('/api/streams/')) {
      const cache = (caches as any).default;
      const cacheKey = new Request(url.toString(), { method: 'GET' });

      // 1. Check Cloudflare Edge Cache
      const cached = await cache.match(cacheKey);
      if (cached) {
        const headers = new Headers(cached.headers);
        for (const [k, v] of Object.entries(CORS_HEADERS)) {
          headers.set(k, v);
        }
        headers.set('X-Edge-Cache', 'HIT');
        return new Response(cached.body, {
          status: cached.status,
          statusText: cached.statusText,
          headers,
        });
      }

      // 2. Cache MISS: Forward request to high-performance Go backend
      const targetUrl = `${backendBase}${url.pathname}${url.search}`;
      try {
        const resp = await fetch(targetUrl, {
          headers: {
            'User-Agent': request.headers.get('User-Agent') || 'CineCub-EdgeGateway',
            'Accept': 'application/json',
          },
          signal: AbortSignal.timeout(25000),
        });

        if (!resp.ok) {
          return new Response(resp.body, {
            status: resp.status,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
          });
        }

        const data = await resp.text();
        const edgeResponse = new Response(data, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=180, s-maxage=180',
            'X-Edge-Cache': 'MISS',
            ...CORS_HEADERS,
          },
        });

        // Store in Cloudflare Edge cache in background
        ctx.waitUntil(cache.put(cacheKey, edgeResponse.clone()));

        return edgeResponse;
      } catch (err) {
        return new Response(
          JSON.stringify({ error: 'Go backend unreachable', details: String(err) }),
          {
            status: 502,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
          }
        );
      }
    }

    // Direct proxy endpoints (/m3u8-proxy, /ts-proxy, /api/v/*) forward to Go backend
    if (url.pathname === '/m3u8-proxy' || url.pathname === '/ts-proxy' || url.pathname.startsWith('/api/v/')) {
      const targetUrl = `${backendBase}${url.pathname}${url.search}`;
      const fwdHeaders = new Headers(request.headers);
      fwdHeaders.set('Host', new URL(backendBase).host);

      return fetch(targetUrl, {
        method: request.method,
        headers: fwdHeaders,
      });
    }

    return new Response(JSON.stringify({ error: 'Not Found', path: url.pathname }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  },

  // Keep-alive cron trigger: pings Go backend every 10 min to prevent cold starts
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    const backendBase = getBackendUrl(env).replace(/\/+$/, '');
    try {
      const resp = await fetch(`${backendBase}/api/health`, {
        signal: AbortSignal.timeout(8000),
      });
      console.log(`[Keep-Alive Cron] Go backend ping status: ${resp.status}`);
    } catch (err) {
      console.error('[Keep-Alive Cron] Ping failed:', err);
    }
  },

  // Queue consumer handler (satisfies Cloudflare queue binding)
  async queue(batch: MessageBatch<unknown>): Promise<void> {
    for (const msg of batch.messages) {
      msg.ack();
    }
  },
};
