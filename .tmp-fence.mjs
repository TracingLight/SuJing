import fs from 'fs';

const text = fs.readFileSync('source/_posts/学习笔记-c-移动语义-右值引用.md', 'utf8').replace(/\r\n/g, '\n');

const test = (name, re) => {
  const stash = [];
  const hold = (v) => `\u0000${stash.push(v) - 1}\u0000`;
  const stashed = text.replace(re, hold);
  // 检查每个被 stash 的块：是否首尾都是合法围栏
  let bad = 0;
  for (const block of stash) {
    const lines = block.split('\n').filter((l) => l.length);
    const open = lines[0].trim();
    const close = lines[lines.length - 1].trim();
    if (!/^(`{3,}|~{3,})/.test(open) || !/^(`{3,}|~{3,})\s*$/.test(close)) {
      bad += 1;
      if (bad <= 3) console.log(`  [${name}] bad block: open=${JSON.stringify(open)} close=${JSON.stringify(close)}`);
    }
  }
  console.log(`${name}: stashed=${stash.length}, malformed=${bad}`);
  const escaped = stashed.replace(/(?<!\\)_/g, '\\_');
  const leftover = escaped.split('\n').filter((l) => l.includes('\\_'));
  console.log(`  lines still escaped = ${leftover.length}`);
  leftover.slice(0, 6).forEach((l) => console.log(`    ${l.trim().slice(0, 90)}`));
};

test('current', /(^|\n)(`{3,}|~{3,})[\s\S]*?\n\2(?=\n|$)/g);
test('fixed  ', /(^|\n)(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\2[ \t]*(?=\n|$)/g);
