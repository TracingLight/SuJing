'use strict';

// Build a disposable pre-change checkout without touching the user's worktree.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const destination = path.join(root, 'tmp/performance-static-baseline');
fs.mkdirSync(destination, { recursive: true });
for (const file of ['source', '_config.yml', '_config.butterfly.yml', 'package.json', 'tools/hexo-tz.js']) {
  fs.cpSync(path.join(root, file), path.join(destination, file), { recursive: true });
}
const tracked = execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD', 'scripts'], { cwd: root, encoding: 'utf8' }).trim().split('\n');
for (const file of [...tracked, 'source/js/sujing.js', 'source/css/sujing.css']) {
  fs.mkdirSync(path.dirname(path.join(destination, file)), { recursive: true });
  fs.writeFileSync(path.join(destination, file), execFileSync('git', ['show', `HEAD:${file}`], { cwd: root, maxBuffer: 16 * 1024 * 1024 }));
}
const modules = path.join(destination, 'node_modules');
if (!fs.existsSync(modules)) fs.symlinkSync(path.join(root, 'node_modules'), modules, 'junction');
console.log(destination);
