'use strict';

hexo.extend.filter.register('after_render:html', (html) => {
  return html
    .replace(
      '<title>溯境 | 溯境</title>',
      '<title>溯境 - 在代码与世界之间，也记录生活的回声</title>'
    )
    .replace('<script type="application/ld+json"></script>', '');
});
