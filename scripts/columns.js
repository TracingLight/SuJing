'use strict';

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const columnPage = (column) => {
  const name = escapeHtml(column.name);
  const slug = escapeHtml(column.slug);
  const description = escapeHtml(column.description || `${column.name}相关文章`);
  return {
    path: `columns/${column.slug}/index.html`,
    layout: ['page', 'index'],
    data: {
      title: column.name,
      description: column.description || `${column.name}相关文章`,
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
  <section class="sujing-column-toolbar" data-sujing-reveal aria-label="专栏检索">
    <label class="sujing-archive-search">
      <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
      <input type="search" name="q" data-sujing-column-q placeholder="检索本专栏的标题、摘要、分类或标签" autocomplete="off" spellcheck="false">
      <button type="button" data-sujing-column-clear hidden aria-label="清除检索">清除</button>
    </label>
  </section>
  <section class="sujing-column-stage" data-sujing-column-stage aria-live="polite"></section>
</div>`
    }
  };
};

hexo.extend.generator.register('sujing-column-pages', (locals) => {
  const columns = Array.isArray(locals.data.columns) ? locals.data.columns : [];
  return columns
    .map((column) => ({
      name: String(column.name || '').trim(),
      slug: String(column.slug || '').trim().toLowerCase(),
      description: String(column.description || '').trim(),
      icon: String(column.icon || '').trim()
    }))
    .filter((column) => column.name && column.slug)
    .map(columnPage);
});

