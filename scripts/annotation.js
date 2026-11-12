'use strict';

let annotationId = 0;

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const parseNote = (args) => {
  const raw = (args || []).join(' ').trim();
  if (!raw) return '';
  try {
    return String(JSON.parse(raw) || '').trim();
  } catch {
    // Keep malformed legacy input from breaking the whole Hexo build.
    // 「引号」工具会把 JSON 双引号转成中文弯引号，这里一并剥掉。
    const unwrapped = raw.replace(/^("|'|“|‘)|("|'|”|’)$/g, '').trim();
    return unwrapped;
  }
};

hexo.extend.tag.register('annotation', (args, content) => {
  const note = parseNote(args);
  const body = String(content ?? '');
  if (!note || !body) return body;

  const id = `sujing-annotation-${++annotationId}`;
  return [
    `<span class="sujing-annotation" data-sujing-annotation tabindex="0" role="button" aria-label="查看批注" aria-expanded="false" aria-describedby="${id}">`,
    `<span class="sujing-annotation-text">${body}</span>`,
    `<span class="sujing-annotation-tooltip" id="${id}" role="tooltip" aria-hidden="true">`,
    '<span class="sujing-annotation-card">',
    '<span class="sujing-annotation-head">',
    '<span class="sujing-annotation-eyebrow">批注</span>',
    '</span>',
    '<span class="sujing-annotation-term" data-sujing-annotation-term></span>',
    `<span class="sujing-annotation-note">${escapeHtml(note)}</span>`,
    '</span>',
    '</span>',
    '</span>'
  ].join('');
}, true);
