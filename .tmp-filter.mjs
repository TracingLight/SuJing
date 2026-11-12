import fs from 'fs';

// Simulate: after hexo's backtick_code_block filter, code blocks are <hexoPostRenderCodeBlock>…
const sample = [
  '通过 static_cast 将对象转换为右值引用对应的表达式类别',
  '',
  '<hexoPostRenderCodeBlock><figure class="highlight cpp"><pre><span class="built_in">static_cast</span>&lt;<span class="type">remove_reference_t</span>&gt;</pre></figure></hexoPostRenderCodeBlock>',
  '',
  '为什么需要 remove_reference？',
  '',
  '==重点=='
].join('\n');

const registered = [];
global.hexo = { extend: { filter: { register: (name, fn) => registered.push({ name, fn }) } } };
await import('./scripts/markdown-literals.js');

const filter = registered.find((f) => f.name === 'before_post_render');
const out = filter.fn({ content: sample }).content;

console.log('--- output ---');
console.log(out);
console.log('--- checks ---');
console.log('code block keeps plain underscores:', out.includes('remove_reference_t&gt;') && !out.includes('remove\\_reference\\_t'));
console.log('prose still escaped:', out.includes('static\\_cast'), out.includes('remove\\_reference？'));
console.log('mark still rendered:', out.includes('<mark class="sujing-key">重点</mark>'));
