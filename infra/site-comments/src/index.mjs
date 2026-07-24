const ALLOWED_ORIGINS = new Set([
  'https://sujing.dev',
  'https://www.sujing.dev',
  'https://sujing.pages.dev',
  'http://localhost:4000',
  'http://127.0.0.1:4000'
]);

const MAX_CONTENT = 800;
const MAX_NICKNAME = 24;
const MAX_WEBSITE = 120;
const RATE_LIMIT = 8;
const RATE_WINDOW = 60 * 60;

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

const jsonResponse = (data, status, origin) => {
  const headers = corsHeaders(origin);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { status, headers });
};

const textResponse = (body, status, origin) => {
  const headers = corsHeaders(origin);
  headers.set('Content-Type', 'text/plain; charset=utf-8');
  return new Response(body, { status, headers });
};

const normalizePath = (value) => {
  if (typeof value !== 'string' || !value) return null;
  let path = value.split('?')[0].split('#')[0].trim();
  if (!path.startsWith('/')) path = `/${path}`;
  path = path.replace(/\/{2,}/g, '/');
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  if (path.length > 180) return null;
  if (/[\u0000-\u001f\u007f]/.test(path)) return null;
  if (path.includes('\\') || path.includes('..')) return null;
  return path || '/';
};

const cleanText = (value, max) => String(value || '')
  .replace(/<[^>]*>/g, '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

const isValidWebsite = (value) => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const sha256Hex = async (value) => {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const createId = () => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const clientIp = (request) => (
  request.headers.get('CF-Connecting-IP')
  || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
  || 'unknown'
);

const enforceRateLimit = async (env, request) => {
  const ip = clientIp(request);
  const key = `comment-rate:${ip}`;
  const current = Number(await env.RATE.get(key)) || 0;
  if (current >= RATE_LIMIT) return false;
  await env.RATE.put(key, String(current + 1), { expirationTtl: RATE_WINDOW });
  return true;
};

const mapComment = (row) => ({
  id: row.id,
  path: row.path,
  parentId: row.parent_id || null,
  nickname: row.nickname,
  emailHash: row.email_hash || '',
  website: row.website || '',
  content: row.content,
  createdAt: row.created_at
});

const listComments = async (env, path) => {
  const result = await env.DB.prepare(`
    SELECT id, path, parent_id, nickname, email_hash, website, content, created_at
    FROM comments
    WHERE path = ? AND status = 'approved'
    ORDER BY created_at ASC
    LIMIT 200
  `).bind(path).all();
  return (result.results || []).map(mapComment);
};

const createComment = async (request, env, origin) => {
  let body = {};
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400, origin);
  }

  // Honeypot — bots often fill hidden fields.
  if (body.company || body.website_url) {
    return jsonResponse({ ok: true, ignored: true }, 200, origin);
  }

  const path = normalizePath(body.path);
  if (!path) return jsonResponse({ error: 'invalid_path' }, 400, origin);

  const nickname = cleanText(body.nickname, MAX_NICKNAME);
  const content = cleanText(body.content, MAX_CONTENT);
  const website = cleanText(body.website, MAX_WEBSITE);
  const email = cleanText(body.email, 80).toLowerCase();
  const parentId = body.parentId ? cleanText(body.parentId, 64) : null;

  if (nickname.length < 2) return jsonResponse({ error: 'invalid_nickname' }, 400, origin);
  if (content.length < 2) return jsonResponse({ error: 'invalid_content' }, 400, origin);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ error: 'invalid_email' }, 400, origin);
  }
  if (!isValidWebsite(website)) return jsonResponse({ error: 'invalid_website' }, 400, origin);

  if (!(await enforceRateLimit(env, request))) {
    return jsonResponse({ error: 'rate_limited' }, 429, origin);
  }

  if (parentId) {
    const parent = await env.DB.prepare(
      'SELECT id FROM comments WHERE id = ? AND path = ? AND status = ? LIMIT 1'
    ).bind(parentId, path, 'approved').first();
    if (!parent) return jsonResponse({ error: 'invalid_parent' }, 400, origin);
  }

  const id = createId();
  const createdAt = Date.now();
  const emailHash = email ? await sha256Hex(email) : '';

  await env.DB.prepare(`
    INSERT INTO comments (id, path, parent_id, nickname, email_hash, website, content, created_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved')
  `).bind(
    id,
    path,
    parentId,
    nickname,
    emailHash || null,
    website || null,
    content,
    createdAt
  ).run();

  return jsonResponse({
    ok: true,
    comment: {
      id,
      path,
      parentId,
      nickname,
      emailHash,
      website,
      content,
      createdAt
    }
  }, 201, origin);
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

    if (url.pathname === '/v1/comments' && request.method === 'GET') {
      const path = normalizePath(url.searchParams.get('path') || '');
      if (!path) return jsonResponse({ error: 'invalid_path' }, 400, origin);
      const comments = await listComments(env, path);
      return jsonResponse({ path, comments, total: comments.length }, 200, origin);
    }

    if (url.pathname === '/v1/comments' && request.method === 'POST') {
      return createComment(request, env, origin);
    }

    if (url.pathname === '/' && request.method === 'GET') {
      return jsonResponse({
        service: 'sujing-site-comments',
        endpoints: ['/v1/comments', '/__health']
      }, 200, origin);
    }

    return textResponse('Not Found', 404, origin);
  }
};
