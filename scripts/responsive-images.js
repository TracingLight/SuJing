'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const cheerio = require('cheerio');

const images = new Map();
const cacheDir = path.join(hexo.base_dir, 'node_modules/.cache/sujing-images');
const sizes = '(max-width: 768px) calc(100vw - 32px), 780px';
const cardSizes = '(max-width: 768px) calc(100vw - 32px), 580px';

hexo.extend.filter.register('before_generate', async () => {
  images.clear();
  await fs.mkdir(cacheDir, { recursive: true });
  const files = await fs.readdir(path.join(hexo.source_dir, 'img'), { recursive: true });
  // Serial encoding bounds memory usage on local previews and small CI workers.
  for (const file of files.filter(file => /\.(png|jpe?g|webp)$/i.test(file))) {
    const input = await fs.readFile(path.join(hexo.source_dir, 'img', file));
    const metadata = await sharp(input).metadata();
    if (metadata.pages > 1 || !metadata.width || metadata.width < 480) continue;
    const hash = crypto.createHash('sha256').update(input).update('quality96-v2').digest('hex').slice(0, 16);
    const variants = [];
    for (const width of [480, 800, 1200, 1600].filter(width => width < metadata.width)) {
      const name = `${hash}-${width}.webp`;
      const target = path.join(cacheDir, name);
      try { await fs.access(target); } catch {
        await sharp(input).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 96, effort: 5 }).toFile(target);
      }
      if ((await fs.stat(target)).size >= input.length) continue;
      variants.push({ width, path: `img/responsive/${name}`, file: target });
    }
    const original = `/img/${file.replaceAll('\\', '/')}`;
    images.set(original, { width: metadata.width, height: metadata.height, variants, srcset: [...variants.map(v => `/${v.path} ${v.width}w`), `${original} ${metadata.width}w`].join(', ') });
  }
  hexo.sujingImages = Object.fromEntries([...images].map(([src, image]) => [src, { srcset: image.srcset, width: image.width, height: image.height }]));
}, 5);

hexo.extend.generator.register('sujing-responsive-images', () => {
  const routes = new Map();
  for (const image of images.values()) for (const variant of image.variants) {
    routes.set(variant.path, { path: variant.path, data: () => require('node:fs').createReadStream(variant.file) });
  }
  routes.set('_headers', { path: '_headers', data: '/img/responsive/*\n  Cache-Control: public, max-age=31536000, immutable\n/vendor/*\n  Cache-Control: public, max-age=31536000, immutable\n' });
  return [...routes.values()];
});

hexo.extend.filter.register('after_render:html', (html, locals) => {
  if (typeof html !== 'string') return html;
  const $ = cheerio.load(html, { decodeEntities: false });
  $('link[rel="preconnect"][href="//cdnjs.cloudflare.com"]').remove();
  const latest = hexo.locals.get('posts').sort('date', -1).first();
  if (/^articles\/(?:index\.html)?$/.test(locals?.page?.path || '') && $('#recent-posts').length && !$('.sujing-list-intro').length) {
    $('#recent-posts').prepend('<header class="sujing-list-intro" data-sujing-reveal><div><p class="sujing-kicker">文章</p><h1>文章库</h1></div><p>以游戏开发笔记为主，同时补齐计算机基础方面的知识。</p></header>');
  }
  const card = $('[data-sujing-latest-card]');
  if (latest && card.length) {
    card.attr('href', `/${latest.path}`).attr('data-sujing-prerendered', 'true');
    card.find('h2').text(latest.title);
    card.find('time').attr('datetime', latest.date.toISOString()).text(latest.date.format('YYYY.MM.DD'));
    card.find('.sujing-bento-card-copy > p').text(String(latest.description || '').replace(/<[^>]*>/g, '').trim());
    if (latest.cover) {
      const coverImg = card.find('img');
      coverImg.attr('src', latest.cover).removeAttr('data-lazy-src').attr('alt', `${latest.title}封面`);
      const coverPosition = String(latest.cover_position || '').trim();
      if (coverPosition) coverImg.css('object-position', coverPosition);
    }
  }
  $('img').each((_, node) => {
    const img = $(node);
    const src = img.attr('data-lazy-src') || img.attr('src');
    const image = images.get(src);
    const hero = img.is('[data-sujing-home-hero]');
    const eager = hero || img.is('[data-sujing-latest-cover]');
    if (eager && src) img.attr('src', src).removeAttr('data-lazy-src').addClass('nolazyload').attr('loading', 'eager');
    if (hero) img.attr('fetchpriority', 'high');
    if (!image) return;
    const responsiveSizes = hero ? '(max-width: 1212px) calc(100vw - 32px), 1180px' : img.closest('.recent-post-item, [data-sujing-latest-card]').length ? cardSizes : sizes;
    img.attr('width', image.width).attr('height', image.height).attr('decoding', 'async');
    img.attr('sizes', responsiveSizes);
    if (img.attr('data-lazy-src')) img.attr('data-srcset', image.srcset);
    else img.attr('srcset', image.srcset);
    // Native lazy images are also used by client-rendered pages; full-size links stay intact.
  });
  return $.html();
}, 1100);
