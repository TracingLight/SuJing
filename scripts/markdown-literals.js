'use strict';

// Keep literal underscores in prose from becoming emphasis, and turn the
// editor's ==highlight== syntax into a semantic mark element.
hexo.extend.filter.register('before_post_render', (data) => {
  if (!data || typeof data.content !== 'string' || !data.content.trim()) return data;

  const stash = [];
  const hold = (value) => {
    const index = stash.push(value) - 1;
    return `\u0000${index}\u0000`;
  };

  let text = data.content.replace(/\r\n/g, '\n');
  text = text.replace(/(^|\n)(`{3,}|~{3,})[\s\S]*?\n\2(?=\n|$)/g, hold);
  text = text.replace(/(`+)([^\n]*?)\1/g, hold);
  text = text.replace(/!\[[^\]]*\]\([^)\n]*\)/g, hold);
  text = text.replace(/\[[^\]]*\]\([^)\n]*\)/g, hold);
  text = text.replace(/<\/?[a-z][^>\n]*>/gi, hold);
  text = text.replace(/https?:\/\/[^\s)\]>]+/g, hold);
  text = text.replace(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g, hold);
  text = text.replace(/\{%[\s\S]*?%\}/g, hold);

  // A literal underscore should stay literal. Underscore emphasis is no
  // longer supported; *emphasis* remains available.
  text = text.replace(/(?<!\\)_/g, '\\_');
  text = text.replace(/==([^=\n]+)==/g, '<mark class="sujing-key">$1</mark>');

  data.content = text.replace(/\u0000(\d+)\u0000/g, (_, index) => stash[Number(index)] || '');
  return data;
});
