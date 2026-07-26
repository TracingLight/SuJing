'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const assetVersion = (relativePath) => crypto
  .createHash('sha256')
  .update(fs.readFileSync(path.join(hexo.base_dir, relativePath)))
  .digest('hex')
  .slice(0, 12);

const sujingCssVersion = assetVersion('source/css/sujing.css');
const sujingJsVersion = assetVersion('source/js/sujing.js');
const sujingAdminCssVersion = assetVersion('source/css/sujing-admin.css');
const sujingAdminJsVersion = assetVersion('source/js/sujing-admin.js');

hexo.extend.filter.register('after_render:html', (html) => {
  const rendered = html
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

  if (!rendered.includes('type-sujing-home') || !rendered.includes('data-sujing-home')) {
    return rendered;
  }

  return rendered
    .replace('<div class="avatar-img text-center"></div>', '')
    .replace(/<div class="site-data text-center">[\s\S]*?(?=<div class="menus_items">)/, '');
});
