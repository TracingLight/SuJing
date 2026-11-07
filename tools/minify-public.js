'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..', 'public');
const jsDir = path.join(root, 'js');
const cssDir = path.join(root, 'css');

const human = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
const compressed = (buffer) => zlib.gzipSync(buffer, { level: 9 }).length;

const collect = (dir, extension) => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .filter((entry) => !entry.name.startsWith('sujing-admin'))
    .map((entry) => path.join(dir, entry.name))
    .sort();
};

const minify = async (file, loader) => {
  const before = fs.readFileSync(file);
  const result = await esbuild.transform(before.toString('utf8'), {
    loader,
    minify: true,
    target: loader === 'js' ? ['es2019'] : undefined,
    legalComments: 'none',
    charset: 'utf8'
  });
  const after = Buffer.from(result.code, 'utf8');
  if (after.length >= before.length) {
    return { file, before: before.length, after: before.length, gzipBefore: compressed(before), gzipAfter: compressed(before), skipped: true };
  }
  fs.writeFileSync(file, after);
  return {
    file,
    before: before.length,
    after: after.length,
    gzipBefore: compressed(before),
    gzipAfter: compressed(after),
    skipped: false
  };
};

(async () => {
  if (!fs.existsSync(path.join(root, 'site-index.json'))) {
    throw new Error('public/site-index.json 不存在，请先运行 npm run check');
  }

  const files = [
    ...collect(jsDir, '.js').map((file) => ({ file, loader: 'js' })),
    ...collect(cssDir, '.css').map((file) => ({ file, loader: 'css' }))
  ];

  let saved = 0;
  for (const item of files) {
    const result = await minify(item.file, item.loader);
    const relative = path.relative(root, result.file).replaceAll('\\', '/');
    const delta = result.before - result.after;
    saved += delta;
    console.log(
      `[minify] ${relative}: ${human(result.before)} -> ${human(result.after)}` +
      ` (gzip ${human(result.gzipBefore)} -> ${human(result.gzipAfter)})` +
      (result.skipped ? ' [already minified]' : '')
    );
  }

  console.log(`[minify] ${files.length} files, raw saved ${human(saved)}`);
})().catch((error) => {
  console.error(`[minify] ${error.message}`);
  process.exitCode = 1;
});
