'use strict';

/**
 * Butterfly 的 lazyload 过滤器不会跳过 nolazyload，
 * 会把 src 换成占位图并写入 data-lazy-src。
 * 首页「最新文章」封面在 JS 更新 src 后，点击时 lazyload 可能用旧 data-lazy-src 打回占位图。
 * 这里在渲染末尾把带 nolazyload 的图片还原为真实 src。
 */
hexo.extend.filter.register('after_render:html', (html) => {
  if (typeof html !== 'string' || !html.includes('nolazyload')) return html;

  return html.replace(/<img\b[^>]*\bnolazyload\b[^>]*>/gi, (tag) => {
    const lazyMatch = tag.match(/\sdata-lazy-src=(["'])(.*?)\1/i);
    if (!lazyMatch) return tag;

    const realSrc = lazyMatch[2];
    if (!realSrc || realSrc.startsWith('data:')) return tag;

    let next = tag.replace(/\ssrc=(["'])(.*?)\1/i, ` src="${realSrc}"`);
    next = next.replace(/\sdata-lazy-src=(["'])(.*?)\1/i, '');
    return next;
  });
}, 99);
