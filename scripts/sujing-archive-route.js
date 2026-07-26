'use strict';

// Ensure the custom archives page wins over hexo-generator-archive's index.
hexo.extend.generator.register('sujing-archive-page', (locals) => {
  const page = locals.pages.toArray().find((item) => item.source === 'archives/index.md');
  if (!page) return [];
  return {
    path: page.path,
    layout: page.layout || 'page',
    data: page
  };
});
