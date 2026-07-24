const ALLOWED_ORIGINS = new Set([
  'https://sujing.dev',
  'https://www.sujing.dev',
  'https://sujing.pages.dev',
  'http://localhost:4000',
  'http://127.0.0.1:4000'
]);

const VISITOR_COOKIE = 'sujing_vid';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

const corsHeaders = (origin) => {
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  return headers;
};

const jsonResponse = (data, status, origin, extraHeaders = {}) => {
  const headers = corsHeaders(origin);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  Object.entries(extraHeaders).forEach(([name, value]) => headers.set(name, value));
  return new Response(JSON.stringify(data), { status, headers });
};

const textResponse = (body, status, origin) => {
  const headers = corsHeaders(origin);
  headers.set('Content-Type', 'text/plain; charset=utf-8');
  return new Response(body, { status, headers });
};

const parseCookies = (header) => {
  const map = new Map();
  if (!header) return map;
  header.split(';').forEach((part) => {
    const index = part.indexOf('=');
    if (index <= 0) return;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) map.set(key, decodeURIComponent(value));
  });
  return map;
};

const createVisitorId = () => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const normalizePath = (value) => {
  if (typeof value !== 'string' || !value) return '/';
  let path = value.split('?')[0].split('#')[0].trim();
  if (!path.startsWith('/')) path = `/${path}`;
  path = path.replace(/\/{2,}/g, '/');
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  if (path.length > 180) return null;
  if (/[\u0000-\u001f\u007f]/.test(path)) return null;
  if (path.includes('\\') || path.includes('..')) return null;
  return path || '/';
};

const shouldSkipPath = (path) => {
  if (!path) return true;
  if (path.startsWith('/media/')) return true;
  if (path.startsWith('/css/') || path.startsWith('/js/') || path.startsWith('/img/')) return true;
  if (/\.(?:js|css|map|png|jpe?g|webp|gif|svg|ico|mp3|flac|woff2?|ttf|txt|xml|json)$/i.test(path)) return true;
  return false;
};

const readCount = async (env, key) => {
  const value = await env.STATS.get(key);
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
};

const bumpCount = async (env, key) => {
  const next = (await readCount(env, key)) + 1;
  await env.STATS.put(key, String(next));
  return next;
};

const visitorCookie = (id) => (
  `${VISITOR_COOKIE}=${encodeURIComponent(id)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=None; Secure; HttpOnly`
);

const collectStats = async (env, path) => ({
  siteUv: await readCount(env, 'site:uv'),
  sitePv: await readCount(env, 'site:pv'),
  pagePv: await readCount(env, `page:pv:${path}`)
});

const handleHit = async (request, env, origin) => {
  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const path = normalizePath(body.path || new URL(request.url).searchParams.get('path') || '/');
  if (!path || shouldSkipPath(path)) {
    return jsonResponse({ error: 'invalid_path' }, 400, origin);
  }

  const cookies = parseCookies(request.headers.get('Cookie'));
  let visitorId = cookies.get(VISITOR_COOKIE);
  let isNewVisitor = false;
  const extraHeaders = {};

  if (!visitorId || !/^[A-Za-z0-9-]{8,64}$/.test(visitorId)) {
    visitorId = createVisitorId();
    isNewVisitor = true;
    extraHeaders['Set-Cookie'] = visitorCookie(visitorId);
  } else {
    const seen = await env.STATS.get(`visitor:${visitorId}`);
    if (!seen) isNewVisitor = true;
  }

  const sitePv = await bumpCount(env, 'site:pv');
  const pagePv = await bumpCount(env, `page:pv:${path}`);
  let siteUv = await readCount(env, 'site:uv');

  if (isNewVisitor) {
    siteUv = await bumpCount(env, 'site:uv');
    await env.STATS.put(`visitor:${visitorId}`, '1', { expirationTtl: COOKIE_MAX_AGE });
  }

  return jsonResponse({ siteUv, sitePv, pagePv, path }, 200, origin, extraHeaders);
};

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname === '/__health') {
      return textResponse('ok', 200, origin);
    }

    if (url.pathname === '/v1/stats' && request.method === 'GET') {
      const path = normalizePath(url.searchParams.get('path') || '/');
      if (!path) return jsonResponse({ error: 'invalid_path' }, 400, origin);
      return jsonResponse(await collectStats(env, path), 200, origin);
    }

    if (url.pathname === '/v1/hit' && request.method === 'POST') {
      return handleHit(request, env, origin);
    }

    if (url.pathname === '/' && request.method === 'GET') {
      return jsonResponse({
        service: 'sujing-site-stats',
        endpoints: ['/v1/hit', '/v1/stats', '/__health']
      }, 200, origin);
    }

    return textResponse('Not Found', 404, origin);
  }
};
