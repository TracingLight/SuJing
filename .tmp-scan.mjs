import fs from 'fs';
import path from 'path';

const walk = (dir, acc = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.name.endsWith('.html')) acc.push(full);
  }
  return acc;
};

const ESCAPED = String.fromCharCode(92) + '_';
const files = walk('public');
let hit = 0;
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const n = text.split(ESCAPED).length - 1;
  if (n > 0) {
    hit += 1;
    console.log(`  ${n}  ${file}`);
  }
}
console.log(`files with backslash-underscore: ${hit} of ${files.length}`);

const article = 'public/2026/11/12/学习笔记-c-移动语义-右值引用/index.html';
const html = fs.readFileSync(article, 'utf8');
console.log('article len:', html.length);
console.log('article escaped underscores:', html.split(ESCAPED).length - 1);
console.log('article annotation pills:', (html.match(/class="sujing-annotation"/g) || []).length);
console.log('article mark highlights:', (html.match(/class="sujing-key"/g) || []).length);
