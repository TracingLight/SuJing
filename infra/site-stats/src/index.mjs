const ALLOWED_ORIGINS = new Set([
  'https://sujing.dev',
  'https://www.sujing.dev',
  'https://sujing.pages.dev'
]);

const VISITOR_COOKIE = 'sujing_vid';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 400;
const HIT_RATE_LIMIT = 120;
const HIT_RATE_WINDOW = 60 * 60;

const isAllowedOrigin = (origin) => {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const url = new URL(origin);
    return url.protocol === 'https:'
      && (
        url.hostname === 'sujing.pages.dev'
        || url.hostname.endsWith('.sujing.pages.dev')
      );
  } catch {
    return false;
  }
};

const corsHeaders = (origin) => {
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  if (isAllowedOrigin(origin)) {
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
  for (let i = 0; i < 2; i += 1) {
    if (!path.includes('%')) break;
    try {
      const decoded = decodeURIComponent(path);
      if (decoded === path) break;
      path = decoded;
    } catch {
      break;
    }
  }
  if (!path.startsWith('/')) path = `/${path}`;
  path = path.replace(/\/{2,}/g, '/');
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  if ([...path].length > 240) return null;
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

const clientIp = (request) => (
  request.headers.get('CF-Connecting-IP')
  || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
  || 'unknown'
);

const enforceHitRateLimit = async (env, request) => {
  const ip = clientIp(request);
  const key = `hit-rate:${ip}`;
  const current = Number(await env.STATS.get(key)) || 0;
  if (current >= HIT_RATE_LIMIT) return false;
  await env.STATS.put(key, String(current + 1), { expirationTtl: HIT_RATE_WINDOW });
  return true;
};

const readCount = async (env, key) => {
  const value = await env.STATS.get(key);
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
};

const bumpCount = async (env, key) => {
  const next = (await readCount(env, key)) + 1;
  await env.STATS.put(key, String(next), { metadata: { count: next } });
  return next;
};

const addAmount = async (env, key, amount) => {
  const next = (await readCount(env, key)) + amount;
  await env.STATS.put(key, String(next), { metadata: { count: next } });
  return next;
};

const visitorCookie = (id) => (
  `${VISITOR_COOKIE}=${encodeURIComponent(id)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=None; Secure; HttpOnly`
);

const collectStats = async (env, path) => ({
  siteUv: await readCount(env, 'site:uv'),
  sitePv: await readCount(env, 'site:pv'),
  pagePv: await readCount(env, `page:pv:${path}`),
  pageUv: await readCount(env, `page:uv:${path}`)
});

const requireStatsAdmin = (request, env) => {
  const token = env.STATS_ADMIN_TOKEN;
  if (!token) return { ok: false, status: 503, error: 'admin_not_configured' };
  const header = request.headers.get('Authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match || match[1] !== token) return { ok: false, status: 401, error: 'unauthorized' };
  return { ok: true };
};

const listPageStats = async (env) => {
  const pages = new Map();
  const addPrefix = async (prefix, field) => {
    let cursor;
    do {
      const listed = await env.STATS.list({ prefix, cursor });
      for (const key of listed.keys || []) {
        const path = key.name.slice(prefix.length);
        if (!path || !path.startsWith('/')) continue;
        const row = pages.get(path) || { path, pagePv: 0, pageUv: 0, readSeconds: 0, readSamples: 0, depthSum: 0 };
        const metadataCount = Number(key.metadata?.count);
        row[field] = Number.isFinite(metadataCount) && metadataCount >= 0
          ? metadataCount
          : await readCount(env, key.name);
        pages.set(path, row);
      }
      cursor = listed.list_complete ? null : listed.cursor;
    } while (cursor);
  };
  await addPrefix('page:pv:', 'pagePv');
  await addPrefix('page:uv:', 'pageUv');
  await addPrefix('page:read:seconds:', 'readSeconds');
  await addPrefix('page:read:samples:', 'readSamples');
  await addPrefix('page:read:depth:', 'depthSum');
  return [...pages.values()]
    .filter((row) => row.pagePv > 0 || row.pageUv > 0 || row.readSamples > 0)
    .sort((a, b) => b.pagePv - a.pagePv || b.pageUv - a.pageUv || a.path.localeCompare(b.path));
};

const backfillStatsMetadata = async (env) => {
  let updated = 0;
  for (const prefix of ['page:pv:', 'page:uv:', 'page:read:seconds:', 'page:read:samples:', 'page:read:depth:']) {
    let cursor;
    do {
      const listed = await env.STATS.list({ prefix, cursor });
      for (const key of listed.keys || []) {
        const count = await readCount(env, key.name);
        if (Number(key.metadata?.count) === count) continue;
        await env.STATS.put(key.name, String(count), { metadata: { count } });
        updated += 1;
      }
      cursor = listed.list_complete ? null : listed.cursor;
    } while (cursor);
  }
  return { updated };
};

const handleHit = async (request, env, origin) => {
  // 无 Origin / 非白名单：拒绝写入，避免 curl 刷量；本机预览也不计入线上
  if (!isAllowedOrigin(origin)) {
    return jsonResponse({ error: 'origin_not_allowed' }, 403, origin);
  }

  if (!(await enforceHitRateLimit(env, request))) {
    return jsonResponse({ error: 'rate_limited' }, 429, origin);
  }

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
  let pageUv = await readCount(env, `page:uv:${path}`);
  const pageSeenKey = `page:seen:${visitorId}:${path}`;
  if (!(await env.STATS.get(pageSeenKey))) {
    pageUv = await bumpCount(env, `page:uv:${path}`);
    await env.STATS.put(pageSeenKey, '1', { expirationTtl: COOKIE_MAX_AGE });
  }
  let siteUv = await readCount(env, 'site:uv');

  if (isNewVisitor) {
    siteUv = await bumpCount(env, 'site:uv');
    await env.STATS.put(`visitor:${visitorId}`, '1', { expirationTtl: COOKIE_MAX_AGE });
  }

  return jsonResponse({ siteUv, sitePv, pagePv, pageUv, path }, 200, origin, extraHeaders);
};

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

const shanghaiDate = (epoch = Date.now()) => (
  new Date(epoch + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10)
);

const createSnapshot = async (env, date = shanghaiDate()) => {
  const pages = await listPageStats(env);
  const payload = {
    version: 1,
    date,
    generatedAt: new Date().toISOString(),
    timezone: 'Asia/Shanghai',
    sitePv: await readCount(env, 'site:pv'),
    siteUv: await readCount(env, 'site:uv'),
    pages
  };
  const key = `snapshot:${date}`;
  const body = JSON.stringify(payload);
  await env.STATS.put(key, body, {
    metadata: {
      date,
      sitePv: payload.sitePv,
      siteUv: payload.siteUv,
      pages: pages.length
    }
  });
  return { key, date, sitePv: payload.sitePv, siteUv: payload.siteUv, pages: pages.length, bytes: body.length };
};

const listSnapshots = async (env, days = 30) => {
  const limit = Math.min(180, Math.max(1, Number(days) || 30));
  const keys = [];
  let cursor;
  do {
    const listed = await env.STATS.list({ prefix: 'snapshot:', cursor });
    keys.push(...(listed.keys || []));
    cursor = listed.list_complete ? null : listed.cursor;
  } while (cursor);
  const selected = keys
    .filter((key) => /^snapshot:\d{4}-\d{2}-\d{2}$/.test(key.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(-limit);
  const snapshots = [];
  for (const key of selected) {
    const value = await env.STATS.get(key.name);
    if (!value) continue;
    try {
      const parsed = JSON.parse(value);
      snapshots.push(parsed);
    } catch {
      /* skip malformed snapshot */
    }
  }
  return snapshots;
};

const handleRead = async (request, env, origin) => {
  if (!isAllowedOrigin(origin)) {
    return jsonResponse({ error: 'origin_not_allowed' }, 403, origin);
  }
  if (!(await enforceHitRateLimit(env, request))) {
    return jsonResponse({ error: 'rate_limited' }, 429, origin);
  }
  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const path = normalizePath(body.path || '/');
  if (!path || shouldSkipPath(path)) {
    return jsonResponse({ error: 'invalid_path' }, 400, origin);
  }
  const seconds = Math.min(3600, Math.max(0, Number(body.seconds) || 0));
  const depth = Math.min(100, Math.max(0, Math.round(Number(body.depth) || 0)));
  if (seconds < 1 && depth < 1) {
    return jsonResponse({ ok: true, ignored: true }, 200, origin);
  }
  if (seconds >= 1) {
    await addAmount(env, `page:read:seconds:${path}`, Math.round(seconds));
    await bumpCount(env, `page:read:samples:${path}`);
    if (depth >= 1) {
      await addAmount(env, `page:read:depth:${path}`, depth);
    }
  }
  return jsonResponse({ ok: true, path, seconds: Math.round(seconds), depth }, 200, origin);
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

    if (url.pathname === '/v1/admin/backfill' && request.method === 'POST') {
      const auth = requireStatsAdmin(request, env);
      if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status, origin);
      const result = await backfillStatsMetadata(env);
      return jsonResponse({ ok: true, ...result }, 200, origin);
    }

    if (url.pathname === '/v1/admin/snapshot' && request.method === 'POST') {
      const auth = requireStatsAdmin(request, env);
      if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status, origin);
      const result = await createSnapshot(env);
      return jsonResponse({ ok: true, ...result }, 200, origin);
    }

    if (url.pathname === '/v1/admin/snapshots' && request.method === 'GET') {
      const auth = requireStatsAdmin(request, env);
      if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status, origin);
      const snapshots = await listSnapshots(env, url.searchParams.get('days'));
      return jsonResponse({ snapshots }, 200, origin);
    }

    if (url.pathname === '/v1/admin/stats' && request.method === 'GET') {
      const auth = requireStatsAdmin(request, env);
      if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status, origin);
      const pages = await listPageStats(env);
      return jsonResponse({
        generatedAt: new Date().toISOString(),
        sitePv: await readCount(env, 'site:pv'),
        siteUv: await readCount(env, 'site:uv'),
        pages
      }, 200, origin);
    }

    if (url.pathname === '/v1/read' && request.method === 'POST') {
      return handleRead(request, env, origin);
    }

    if (url.pathname === '/v1/hit' && request.method === 'POST') {
      return handleHit(request, env, origin);
    }

    if (url.pathname === '/' && request.method === 'GET') {
      return jsonResponse({
        service: 'sujing-site-stats',
        endpoints: ['/v1/hit', '/v1/read', '/v1/stats', '/v1/admin/stats', '/v1/admin/snapshot', '/v1/admin/snapshots', '/v1/admin/backfill', '/__health']
      }, 200, origin);
    }

    return textResponse('Not Found', 404, origin);
  },

  async scheduled(controller, env, ctx) {
    const date = shanghaiDate(controller.scheduledTime || Date.now());
    ctx.waitUntil(createSnapshot(env, date));
  }
};
