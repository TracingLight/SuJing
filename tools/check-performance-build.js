'use strict';

/**
 * 产物验收：在 npm run check（或 npm run prune）之后运行，检查真正上线的 HTML。
 * 之前这里读取 site-index.json 的 images 字段，但该字段从未写入过，脚本一直是坏的；
 * 现在改为直接扫描产物里的 srcset，校验的是最终上线的引用。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cheerio = require('cheerio');

const root = path.join(__dirname, '..', 'public');

const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
};

const resolveUrl = (url) => {
  const clean = String(url || '').split('?')[0].split('#')[0];
  let decoded = clean;
  try {
    decoded = decodeURIComponent(clean);
  } catch {
    /* 保留原样 */
  }
  return path.join(root, decoded.replace(/^\/+/, ''));
};

assert.ok(fs.existsSync(path.join(root, 'site-index.json')), '缺少 public/site-index.json，请先运行 npm run check');

const data = JSON.parse(fs.readFileSync(path.join(root, 'site-index.json'), 'utf8'));
const home = cheerio.load(fs.readFileSync(path.join(root, 'index.html'), 'utf8'));

// 1. 首页「最新文章」必须在构建期就指向 site-index.json 的第一篇，不能靠前端 JS 兜底
const card = home('[data-sujing-latest-card]');
assert.equal(card.length, 1, '首页缺少最新文章卡片');
assert.equal(card.attr('href'), data.posts[0].path);
assert.equal(card.find('h2').text(), data.posts[0].title);
assert.equal(card.attr('data-sujing-prerendered'), 'true');
if (data.posts[0].cover) assert.equal(card.find('img').attr('src'), data.posts[0].cover);

// 2. 首屏主图必须 eager，且不能被懒加载占位图顶掉
const hero = home('[data-sujing-home-hero]');
assert.equal(hero.attr('data-lazy-src'), undefined);
assert.equal(hero.attr('fetchpriority'), 'high');

// 3. 第三方资源已本地化到 /vendor/
assert.equal(home('script[src*="cdnjs"], link[href*="cdnjs"]').length, 0);
assert.ok(home('link[rel="stylesheet"][href^="/vendor/"]').length);

// 4. 响应式图片：每个 srcset 候选都存在，且派生图确实小于原图
let variants = 0;
let imagesWithSrcset = 0;
for (const file of walk(root).filter((item) => item.endsWith('.html'))) {
  const $ = cheerio.load(fs.readFileSync(file, 'utf8'));
  $('img[srcset]').each((_, node) => {
    const img = $(node);
    const original = img.attr('src');
    if (!original) return;
    const originalPath = resolveUrl(original);
    if (!fs.existsSync(originalPath)) return;
    const originalBytes = fs.statSync(originalPath).size;
    imagesWithSrcset += 1;
    for (const entry of String(img.attr('srcset')).split(',')) {
      const [url, width] = entry.trim().split(/\s+/);
      if (!url || !width) continue;
      assert.match(width, /^\d+w$/, `srcset 宽度格式错误：${url} ${width}`);
      const variantPath = resolveUrl(url);
      assert.ok(fs.existsSync(variantPath), `缺少响应式图片：${url}`);
      if (url === original) continue;
      assert.ok(fs.statSync(variantPath).size < originalBytes, `派生图比原图大：${url}`);
      variants += 1;
    }
  });
}
assert.ok(imagesWithSrcset > 0, '产物里没有带 srcset 的图片');
assert.ok(variants > 0, '没有生成任何响应式图片派生文件');

// 5. 文章列表页布局与缓存头
const articles = cheerio.load(fs.readFileSync(path.join(root, 'articles/index.html'), 'utf8'));
assert.equal(articles('.sujing-list-intro').length, 1);
assert.match(fs.readFileSync(path.join(root, '_headers'), 'utf8'), /immutable/);
// 下线的历史资源必须通过 _redirects 显式拦截，否则 Pages 会回落到历史部署里的同名文件
assert.match(fs.readFileSync(path.join(root, '_redirects'), 'utf8'), /\/404\.html\s+404/);

console.log(
  `Build checks passed: 最新文章预渲染、首屏 eager、依赖本地化、${imagesWithSrcset} 张图共 ${variants} 个响应式引用、列表布局、缓存头。`
);
