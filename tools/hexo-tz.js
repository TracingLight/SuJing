'use strict';

/**
 * 强制以 Asia/Shanghai 跑 hexo，避免 Cloudflare / CI 默认 UTC
 * 把 permalink 的年月日和本机 CMS 链接功能拧成同一套。
 */
process.env.TZ = 'Asia/Shanghai';

const { spawnSync } = require('node:child_process');

const args = process.argv.slice(2);
if (!args.length) {
  console.error('用法: node tools/hexo-tz.js <hexo-args...>');
  process.exit(1);
}

const result = spawnSync('npx', ['hexo', ...args], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: process.env,
  cwd: require('node:path').join(__dirname, '..')
});

process.exit(result.status == null ? 1 : result.status);
