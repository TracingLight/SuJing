'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const assetVersion = (relativePath) => {
  try {
    return crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.join(hexo.base_dir, relativePath)))
      .digest('hex')
      .slice(0, 12);
  } catch {
    return String(Date.now());
  }
};

const parseCoverFocus = (page = {}) => {
  const pos = String(page.cover_position || page.coverPosition || '').trim();
  if (!pos) return null;
  const parts = pos.split(/\s+/).filter(Boolean);
  const x = String(parts[0] || '').replace(/[^\d.%\-]/g, '');
  const y = String(parts[1] || '').replace(/[^\d.%\-]/g, '');
  if (!x || !y) return null;
  const safe = pos
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
  return { pos, safe, x, y };
};

const coverFocusHeadSnippet = (focus) => {
  if (!focus) return '';
  return [
    `<meta name="sujing-cover-position" content="${focus.safe}">`,
    `<style id="sujing-cover-focus-vars">#page-header.post-bg{--sujing-cover-x:${focus.x};--sujing-cover-y:${focus.y}}</style>`
  ].join('\n');
};

/** PJAX 只换 body 不换 head：把焦点写进顶栏行内样式，软跳转首屏就正确 */
const applyCoverFocusToHeader = (html, focus) => {
  if (!focus || !html.includes('id="page-header"')) return html;
  return html.replace(
    /<header\b([^>]*\bid="page-header"[^>]*)>/i,
    (full, attrs) => {
      let next = attrs;
      if (!/\bdata-cover-position=/i.test(next)) {
        next += ` data-cover-position="${focus.safe}"`;
      }
      if (/\bstyle="/i.test(next)) {
        next = next.replace(
          /\bstyle="/i,
          `style="--sujing-cover-x:${focus.x};--sujing-cover-y:${focus.y};`
        );
      } else {
        next += ` style="--sujing-cover-x:${focus.x};--sujing-cover-y:${focus.y}"`;
      }
      return `<header${next}>`;
    }
  );
};

hexo.extend.filter.register('after_render:html', (html, locals) => {
  // 每次渲染重算：本地改 CSS/JS 后不必重启 hexo 也能换 ?v=
  const sujingCssVersion = assetVersion('source/css/sujing.css');
  const sujingJsVersion = assetVersion('source/js/sujing.js');
  const sujingAdminCssVersion = assetVersion('source/css/sujing-admin.css');
  const sujingAdminJsVersion = assetVersion('source/js/sujing-admin.js');

  let rendered = html
    .replace(
      '<title>溯境 | 溯境</title>',
      '<title>溯境 - 写游戏，也记日常</title>'
    )
    .replace('<script type="application/ld+json"></script>', '')
    .replace(
      'href="/css/sujing.css"',
      `href="/css/sujing.css?v=${sujingCssVersion}"`
    )
    .replace(
      'href="/css/sujing-admin.css"',
      `href="/css/sujing-admin.css?v=${sujingAdminCssVersion}"`
    )
    .replace(
      'src="/js/sujing.js"',
      `src="/js/sujing.js?v=${sujingJsVersion}"`
    )
    .replace(
      'src="/js/sujing-admin.js"',
      `src="/js/sujing-admin.js?v=${sujingAdminJsVersion}"`
    );

  const page = locals?.page || {};
  const focus = parseCoverFocus(page);
  if (focus) {
    if (!rendered.includes('name="sujing-cover-position"')) {
      rendered = rendered.replace('</head>', `${coverFocusHeadSnippet(focus)}\n</head>`);
    }
    rendered = applyCoverFocusToHeader(rendered, focus);
  }

  if (!rendered.includes('type-sujing-home') || !rendered.includes('data-sujing-home')) {
    return rendered;
  }

  return rendered
    .replace('<div class="avatar-img text-center"></div>', '')
    .replace(/<div class="site-data text-center">[\s\S]*?(?=<div class="menus_items">)/, '');
});
