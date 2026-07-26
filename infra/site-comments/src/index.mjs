const ALLOWED_ORIGINS = new Set([
  'https://sujing.dev',
  'https://www.sujing.dev',
  'https://sujing.pages.dev'
]);

const MAX_CONTENT = 800;
const MAX_NICKNAME = 24;
const MAX_WEBSITE = 120;
const RATE_LIMIT = 8;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const MAX_REPLY_DEPTH = 2;
const MAX_LINKS = 3;

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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

const cleanText = (value, max) => String(value || '')
  .replace(/<[^>]*>/g, '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

const cleanContent = (value, max) => {
  let text = String(value || '')
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/\r\n?/g, '\n');
  text = text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.slice(0, max);
};

const normalizeWebsite = (value) => {
  const raw = cleanText(value, MAX_WEBSITE);
  if (!raw) return '';
  const candidate = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname || !url.hostname.includes('.')) return null;
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
};

const countLinks = (content) => {
  const matches = content.match(/https?:\/\/[^\s]+/gi) || [];
  return matches.length;
};

const isLinkSpam = (content) => {
  const links = countLinks(content);
  if (links > MAX_LINKS) return true;
  const withoutLinks = content.replace(/https?:\/\/[^\s]+/gi, '').replace(/\s+/g, '');
  return links >= 1 && withoutLinks.length < 2;
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
  const now = Date.now();
  const row = await env.DB.prepare(
    'SELECT count, reset_at FROM rate_limits WHERE key = ? LIMIT 1'
  ).bind(key).first();

  if (!row || Number(row.reset_at) <= now) {
    await env.DB.prepare(`
      INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
      ON CONFLICT(key) DO UPDATE SET count = 1, reset_at = excluded.reset_at
    `).bind(key, now + RATE_WINDOW_MS).run();
    return true;
  }

  const count = Number(row.count) || 0;
  if (count >= RATE_LIMIT) return false;

  await env.DB.prepare(
    'UPDATE rate_limits SET count = count + 1 WHERE key = ? AND count < ?'
  ).bind(key, RATE_LIMIT).run();

  const after = await env.DB.prepare(
    'SELECT count FROM rate_limits WHERE key = ? LIMIT 1'
  ).bind(key).first();
  return (Number(after?.count) || 0) <= RATE_LIMIT;
};

const mapComment = (row) => ({
  id: row.id,
  path: row.path,
  parentId: row.parent_id || null,
  nickname: row.nickname,
  emailHash: row.email_hash || '',
  website: row.website || '',
  content: row.content,
  createdAt: row.created_at,
  status: row.status || 'approved'
});

const mapAdminComment = (row) => ({
  ...mapComment(row),
  email: row.email || '',
  hasEmail: Boolean(row.email || row.email_hash)
});

const listComments = async (env, path) => {
  const result = await env.DB.prepare(`
    SELECT id, path, parent_id, nickname, email_hash, website, content, created_at, status
    FROM comments
    WHERE path = ? AND status = 'approved'
    ORDER BY created_at ASC
    LIMIT 200
  `).bind(path).all();
  return (result.results || []).map(mapComment);
};

const replyDepth = async (env, path, parentId) => {
  let depth = 0;
  let current = parentId;
  while (current && depth <= MAX_REPLY_DEPTH + 1) {
    const row = await env.DB.prepare(
      'SELECT parent_id FROM comments WHERE id = ? AND path = ? AND status = ? LIMIT 1'
    ).bind(current, path, 'approved').first();
    if (!row) return -1;
    depth += 1;
    current = row.parent_id || null;
  }
  return depth;
};

const requireAdmin = (request, env) => {
  const token = env.COMMENTS_ADMIN_TOKEN;
  if (!token) return { ok: false, status: 503, error: 'admin_not_configured' };
  const header = request.headers.get('Authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match || match[1] !== token) return { ok: false, status: 401, error: 'unauthorized' };
  return { ok: true };
};

const listAdminComments = async (env, url) => {
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50));
  const cursor = Number(url.searchParams.get('cursor')) || 0;
  const result = await env.DB.prepare(`
    SELECT id, path, parent_id, nickname, email_hash, email, website, content, created_at, status
    FROM comments
    WHERE (? = 0 OR created_at < ?)
    ORDER BY created_at DESC
    LIMIT ?
  `).bind(cursor, cursor, limit).all();
  const comments = (result.results || []).map(mapAdminComment);
  const nextCursor = comments.length ? comments[comments.length - 1].createdAt : null;
  return { comments, nextCursor, total: comments.length };
};

const hideComment = async (env, id) => {
  const existing = await env.DB.prepare(
    'SELECT id FROM comments WHERE id = ? LIMIT 1'
  ).bind(id).first();
  if (!existing) return null;
  await env.DB.prepare(
    "UPDATE comments SET status = 'hidden' WHERE id = ?"
  ).bind(id).run();
  return { id, status: 'hidden' };
};

const createComment = async (request, env, origin) => {
  let body = {};
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400, origin);
  }

  // Honeypot — bots / autofill often fill hidden fields.
  // Must NOT look like a successful create to the client.
  if (body.company || body.website_url) {
    return jsonResponse({ ok: false, ignored: true }, 200, origin);
  }

  const path = normalizePath(body.path);
  if (!path) return jsonResponse({ error: 'invalid_path' }, 400, origin);

  const nickname = cleanText(body.nickname, MAX_NICKNAME);
  const content = cleanContent(body.content, MAX_CONTENT);
  const website = normalizeWebsite(body.website);
  const email = cleanText(body.email, 80).toLowerCase();
  const parentId = body.parentId ? cleanText(body.parentId, 64) : null;

  if (nickname.length < 1) return jsonResponse({ error: 'invalid_nickname' }, 400, origin);
  if (content.length < 1) return jsonResponse({ error: 'invalid_content' }, 400, origin);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ error: 'invalid_email' }, 400, origin);
  }
  if (website === null) return jsonResponse({ error: 'invalid_website' }, 400, origin);
  if (isLinkSpam(content)) return jsonResponse({ error: 'spam_links' }, 400, origin);

  if (!(await enforceRateLimit(env, request))) {
    return jsonResponse({ error: 'rate_limited' }, 429, origin);
  }

  if (parentId) {
    const depth = await replyDepth(env, path, parentId);
    if (depth < 1) return jsonResponse({ error: 'invalid_parent' }, 400, origin);
    if (depth > MAX_REPLY_DEPTH) return jsonResponse({ error: 'reply_too_deep' }, 400, origin);
  }

  const id = createId();
  const createdAt = Date.now();
  const emailHash = email ? await sha256Hex(email) : '';

  await env.DB.prepare(`
    INSERT INTO comments (id, path, parent_id, nickname, email_hash, email, website, content, created_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')
  `).bind(
    id,
    path,
    parentId,
    nickname,
    emailHash || null,
    email || null,
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

    if (url.pathname === '/v1/admin/comments' && request.method === 'GET') {
      const auth = requireAdmin(request, env);
      if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status, origin);
      const payload = await listAdminComments(env, url);
      return jsonResponse(payload, 200, origin);
    }

    const hideMatch = url.pathname.match(/^\/v1\/admin\/comments\/([^/]+)\/hide$/);
    if (hideMatch && request.method === 'POST') {
      const auth = requireAdmin(request, env);
      if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status, origin);
      const id = decodeURIComponent(hideMatch[1]);
      const result = await hideComment(env, id);
      if (!result) return jsonResponse({ error: 'not_found' }, 404, origin);
      return jsonResponse({ ok: true, ...result }, 200, origin);
    }

    if (url.pathname === '/' && request.method === 'GET') {
      return jsonResponse({
        service: 'sujing-site-comments',
        endpoints: ['/v1/comments', '/v1/admin/comments', '/__health']
      }, 200, origin);
    }

    return textResponse('Not Found', 404, origin);
  }
};
