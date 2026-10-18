'use strict';

/**
 * 发布前裁剪。
 *
 * public/ 是 source/ 的整份镜像，本地才会用到的管理控制台资源会被原样打进产物并
 * 上传到 Cloudflare Pages。这一步把它们从产物里摘掉：删文件 + 清掉所有对它们的
 * 引用标签，最后再全量复查一遍，确保公开产物里没有残留。
 *
 * 用法：node tools/prune-public.js   （在 npm run check 之后、pages deploy 之前）
 */
const fs = require('node:fs');
const path = require('node:path');

const publicDir = path.join(__dirname, '..', 'public');

// 只在本机运行、不进入公开产物的资源
const PRUNE_FILE_PATTERNS = [
  /^css[\\/]sujing-admin[^\\/]*\.css$/i,
  /^js[\\/]sujing-admin[^\\/]*\.js$/i
];

const PRUNE_MARKER = 'sujing-admin';

// <link ...sujing-admin...> 或 <script ...sujing-admin...></script>，连同行尾换行
const TAG_RE = /[ \t]*<(link|script)\b[^>]*sujing-admin[^>]*>(?:[ \t]*<\/script>)?[ \t]*\r?\n?/gi;

const TEXT_EXTENSIONS = new Set(['.html', '.htm', '.js', '.css', '.json', '.xml', '.txt']);

const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
};

const relative = (file) => path.relative(publicDir, file).replace(/\\/g, '/');

const fail = (message) => {
  console.error(`[prune] ${message}`);
  process.exit(1);
};

if (!fs.existsSync(publicDir)) fail('找不到 public/，请先运行 npm run check');

const files = walk(publicDir);

// 1. 删除控制台文件
const removed = [];
let removedBytes = 0;
for (const file of files) {
  const rel = relative(file);
  if (!PRUNE_FILE_PATTERNS.some((pattern) => pattern.test(rel))) continue;
  removedBytes += fs.statSync(file).size;
  fs.rmSync(file);
  removed.push(rel);
}

// 2. 清掉引用标签
const rewritten = [];
for (const file of files) {
  if (!TEXT_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;
  const rel = relative(file);
  if (PRUNE_FILE_PATTERNS.some((pattern) => pattern.test(rel))) continue;
  if (!fs.existsSync(file)) continue;

  const source = fs.readFileSync(file, 'utf8');
  if (!source.includes(PRUNE_MARKER)) continue;

  const next = source.replace(TAG_RE, '');
  if (next === source) continue;
  fs.writeFileSync(file, next, 'utf8');
  rewritten.push(rel);
}

// 3. 复查：产物里不允许再出现任何引用
const leftovers = [];
for (const file of walk(publicDir)) {
  if (!TEXT_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;
  const source = fs.readFileSync(file, 'utf8');
  if (!source.includes(PRUNE_MARKER)) continue;
  const line = source.slice(0, source.indexOf(PRUNE_MARKER)).split('\n').length;
  leftovers.push(`${relative(file)}:${line}`);
}

if (leftovers.length) {
  console.error('[prune] 产物里仍有控制台引用，发布已中止：');
  for (const item of leftovers.slice(0, 20)) console.error(`  ${item}`);
  if (leftovers.length > 20) console.error(`  ...还有 ${leftovers.length - 20} 处`);
  process.exit(1);
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
console.log(
  `[prune] 移除 ${removed.length} 个文件（${kb(removedBytes)}），清理 ${rewritten.length} 个页面的引用，产物已确认无残留。`
);
if (removed.length) console.log(`[prune] 已删除：${removed.join(', ')}`);
