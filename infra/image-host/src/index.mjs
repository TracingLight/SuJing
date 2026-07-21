const ALLOWED_METHODS = 'GET, HEAD, OPTIONS';

const baseHeaders = () => new Headers({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': ALLOWED_METHODS,
  'Access-Control-Allow-Headers': 'If-None-Match, If-Modified-Since, Range',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, ETag',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer'
});

const textResponse = (body, status, extraHeaders = {}) => {
  const headers = baseHeaders();
  headers.set('Content-Type', 'text/plain; charset=utf-8');
  Object.entries(extraHeaders).forEach(([name, value]) => headers.set(name, value));
  return new Response(body, { status, headers });
};

const getObjectKey = (url) => {
  try {
    const key = decodeURIComponent(url.pathname.slice(1));
    if (!key || key.includes('\\') || key.split('/').includes('..')) return null;
    return key;
  } catch {
    return null;
  }
};

const canUseEdgeCache = (request) => {
  return request.method === 'GET'
    && !request.headers.has('Range')
    && !request.headers.has('If-None-Match')
    && !request.headers.has('If-Modified-Since')
    && !request.headers.has('If-Match')
    && !request.headers.has('If-Unmodified-Since')
    && !request.headers.has('If-Range');
};

const objectHeaders = (object, defaultCacheControl) => {
  const headers = baseHeaders();
  object.writeHttpMetadata(headers);
  headers.set('ETag', object.httpEtag);
  headers.set('Accept-Ranges', 'bytes');
  if (!headers.has('Cache-Control')) {
    headers.set('Cache-Control', defaultCacheControl);
  }
  return headers;
};

const etagMatches = (value, etag) => {
  if (!value) return false;
  const normalize = (tag) => tag.trim().replace(/^W\//, '').replace(/^"|"$/g, '');
  return value.split(',').some((candidate) => {
    const normalized = normalize(candidate);
    return normalized === '*' || normalized === normalize(etag);
  });
};

const conditionalResponse = (request, object, defaultCacheControl) => {
  const ifMatch = request.headers.get('If-Match');
  if (ifMatch && !etagMatches(ifMatch, object.httpEtag)) {
    return new Response(null, { status: 412, headers: objectHeaders(object, defaultCacheControl) });
  }

  const ifUnmodifiedSince = Date.parse(request.headers.get('If-Unmodified-Since') || '');
  if (Number.isFinite(ifUnmodifiedSince) && object.uploaded.getTime() > ifUnmodifiedSince) {
    return new Response(null, { status: 412, headers: objectHeaders(object, defaultCacheControl) });
  }

  const ifNoneMatch = request.headers.get('If-None-Match');
  const ifModifiedSince = Date.parse(request.headers.get('If-Modified-Since') || '');
  const notModified = etagMatches(ifNoneMatch, object.httpEtag)
    || (!ifNoneMatch && Number.isFinite(ifModifiedSince) && object.uploaded.getTime() <= ifModifiedSince);
  if (!notModified) return null;

  const headers = objectHeaders(object, defaultCacheControl);
  headers.delete('Content-Length');
  return new Response(null, { status: 304, headers });
};

const responseFromObject = (object, request, defaultCacheControl) => {
  const headers = objectHeaders(object, defaultCacheControl);

  const hasBody = 'body' in object;
  const isRange = hasBody
    && request.method === 'GET'
    && request.headers.has('Range')
    && object.range
    && Number.isFinite(object.range.offset)
    && Number.isFinite(object.range.length);
  if (isRange) {
    const end = object.range.offset + object.range.length - 1;
    headers.set('Content-Range', `bytes ${object.range.offset}-${end}/${object.size}`);
    headers.set('Content-Length', String(object.range.length));
  }
  const status = hasBody ? (isRange ? 206 : 200) : 412;
  const body = request.method === 'HEAD' || !hasBody ? null : object.body;
  return new Response(body, { status, headers });
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.hostname === 'www.sujing.dev') {
      return Response.redirect(`https://sujing.dev${url.pathname}${url.search}`, 301);
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: baseHeaders() });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return textResponse('Method Not Allowed', 405, { Allow: ALLOWED_METHODS });
    }

    if (url.pathname === '/__health') {
      return textResponse('ok', 200, { 'Cache-Control': 'no-store' });
    }

    const key = getObjectKey(url);
    if (!key) return textResponse('Not Found', 404);

    const cacheable = canUseEdgeCache(request);
    const cache = caches.default;
    if (cacheable) {
      const cached = await cache.match(request);
      if (cached) return cached;
    }

    const object = await env.IMAGES.get(key, { range: request.headers });
    if (object === null) return textResponse('Not Found', 404);

    const defaultCacheControl = env.DEFAULT_CACHE_CONTROL || 'public, max-age=31536000, immutable';
    const precondition = conditionalResponse(request, object, defaultCacheControl);
    if (precondition) return precondition;

    const response = responseFromObject(
      object,
      request,
      defaultCacheControl
    );

    if (cacheable && response.ok) {
      ctx.waitUntil(cache.put(request, response.clone()));
    }
    return response;
  }
};
