'use strict';

const {
  normalizeColumn,
  columnPath,
  modulePath
} = require('./lib/column-model');

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const pagePath = (route) => `${String(route).replace(/^\/+/, '')}index.html`;

const searchBox = (placeholder, label = '专栏检索') => `<section class="sujing-column-toolbar" data-sujing-reveal aria-label="${label}">
    <label class="sujing-archive-search">
      <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
      <input type="search" name="q" data-sujing-column-q placeholder="${escapeHtml(placeholder)}" autocomplete="off" spellcheck="false">
      <button type="button" data-sujing-column-clear hidden aria-label="清除检索">清除</button>
    </label>
  </section>`;

const columnPage = (column) => {
  const name = escapeHtml(column.name);
  const slug = escapeHtml(column.slug);
  const description = escapeHtml(column.description || `${column.name}相关文章`);
  return {
    path: pagePath(columnPath(column)),
    layout: ['page', 'index'],
    data: {
      title: column.name,
      description: column.description,
      top_img: false,
      aside: false,
      comments: false,
      type: 'sujing-column',
      column_slug: column.slug,
      content: `<div class="sujing-column-page" data-sujing-column-page data-column-slug="${slug}" aria-busy="true">
  <header class="sujing-column-hero" data-sujing-reveal>
    <div class="sujing-column-hero-copy">
      <p class="sujing-kicker">专栏</p>
      <h1>${name}</h1>
      <p>${description}</p>
    </div>
    <div class="sujing-column-hero-mark" aria-hidden="true">辑</div>
  </header>
  <p class="sujing-columns-status" data-sujing-column-status role="status">正在整理专栏…</p>
  <section class="sujing-column-modules" data-sujing-column-modules aria-label="专栏模块" hidden></section>
  ${searchBox('检索本专栏的标题、摘要、分类或标签')}
  <section class="sujing-column-stage" data-sujing-column-stage aria-live="polite"></section>
</div>`
    }
  };
};

const modulePage = (column, module) => {
  const columnName = escapeHtml(column.name);
  const moduleName = escapeHtml(module.name);
  const moduleSlug = escapeHtml(module.slug);
  const description = escapeHtml(module.description);
  const mark = escapeHtml(module.mark || '辑');
  const columnHref = escapeHtml(columnPath(column));
  return {
    path: pagePath(modulePath(column, module)),
    layout: ['page', 'index'],
    data: {
      title: module.name,
      description: module.description,
      top_img: false,
      aside: false,
      comments: false,
      type: 'sujing-column',
      column_slug: column.slug,
      module_slug: module.slug,
      content: `<div class="sujing-column-page" data-sujing-column-page data-column-slug="${escapeHtml(column.slug)}" data-module-slug="${moduleSlug}" aria-busy="true">
  <nav class="sujing-column-breadcrumb" aria-label="面包屑">
    <a href="/columns/">专栏</a>
    <span aria-hidden="true">/</span>
    <a href="${columnHref}">${columnName}</a>
    <span aria-hidden="true">/</span>
    <span aria-current="page">${moduleName}</span>
  </nav>
  <header class="sujing-column-hero sujing-column-hero--module" data-sujing-reveal>
    <div class="sujing-column-hero-copy">
      <p class="sujing-kicker">专栏 / 模块</p>
      <h1>${moduleName}</h1>
      <p>${description}</p>
    </div>
    <div class="sujing-column-hero-mark" aria-hidden="true">${mark}</div>
  </header>
  <div class="sujing-column-module-switcher-wrap" data-sujing-column-module-switcher hidden></div>
  <p class="sujing-columns-status" data-sujing-column-status role="status">正在整理模块…</p>
  ${searchBox('检索本模块的标题、摘要、标签', '模块检索')}
  <section class="sujing-column-stage" data-sujing-column-stage aria-live="polite"></section>
</div>`
    }
  };
};

hexo.extend.generator.register('sujing-column-pages', (locals) => {
  const columns = Array.isArray(locals.data.columns) ? locals.data.columns : [];
  const seen = new Set();
  return columns
    .map(normalizeColumn)
    .filter(Boolean)
    .filter((column) => {
      if (seen.has(column.slug)) return false;
      seen.add(column.slug);
      return true;
    })
    .flatMap((column) => [
      columnPage(column),
      ...column.modules.map((module) => modulePage(column, module))
    ]);
});
