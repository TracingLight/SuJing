'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { normalizeQuotes } = require('./quote-normalize');

const root = path.join(__dirname, '..');
const postsDir = path.join(root, 'source', '_posts');
const write = process.argv.includes('--write');
const files = fs.readdirSync(postsDir).filter((file) => file.endsWith('.md'));
let totalChanges = 0;
let totalIssues = 0;

for (const file of files) {
  const full = path.join(postsDir, file);
  const original = fs.readFileSync(full, 'utf8');
  const frontmatter = original.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  const prefix = frontmatter ? frontmatter[0] : '';
  const body = frontmatter ? original.slice(prefix.length) : original;
  const result = normalizeQuotes(body);
  totalChanges += result.changes.length;
  totalIssues += result.issues.length;
  if (!result.changes.length && !result.issues.length) continue;
  console.log(`\n${file} · 修正 ${result.changes.length} · 待人工 ${result.issues.length}`);
  result.changes.slice(0, 8).forEach((change) => console.log(`  L${change.line}: ${change.from} → ${change.to}`));
  result.issues.slice(0, 5).forEach((issue) => console.log(`  L${issue.line} [${issue.type}]: ${issue.text}`));
  if (write && result.changes.length) fs.writeFileSync(full, prefix + result.text, 'utf8');
}

console.log(`\n${write ? '已写入' : '预览'}：${totalChanges} 处可安全修正，${totalIssues} 处需人工确认。`);
