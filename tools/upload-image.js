'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const configPath = path.join(root, 'image-host.config.json');
const mimeTypes = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

const fail = (message) => {
  console.error(`[image:upload] ${message}`);
  process.exit(1);
};

const args = process.argv.slice(2);
const printOnly = args.includes('--print-only') || args.includes('print-only');
const noCopy = args.includes('--no-copy') || args.includes('no-copy');
const flags = new Set(['--print-only', 'print-only', '--no-copy', 'no-copy']);
const positional = args.filter((arg) => !flags.has(arg) && !arg.startsWith('--'));
if (!positional[0]) {
  fail('Usage: npm run image:upload -- <file> [folder] [--print-only] [--no-copy]');
}

if (!fs.existsSync(configPath)) fail('Missing image-host.config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
if (!config.bucket) fail('Set bucket in image-host.config.json');

const file = path.resolve(positional[0]);
if (!fs.existsSync(file) || !fs.statSync(file).isFile()) fail(`File not found: ${file}`);

const extension = path.extname(file).toLowerCase();
const contentType = mimeTypes[extension];
if (!contentType) fail(`Unsupported image type: ${extension || '(none)'}`);

const bytes = fs.readFileSync(file);
const hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 12);
const now = new Date();
const year = String(now.getFullYear());
const month = String(now.getMonth() + 1).padStart(2, '0');
const slug = path.basename(file, extension)
  .normalize('NFKD')
  .replace(/[^a-zA-Z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
  .toLowerCase() || 'image';
const folder = (positional[1] || config.defaultFolder || 'blog')
  .replace(/\\/g, '/')
  .replace(/^\/+|\/+$/g, '')
  .replace(/\.\./g, '') || 'blog';
const key = `${folder}/${year}/${month}/${slug}-${hash}${extension}`;

if (bytes.length > 2 * 1024 * 1024) {
  console.warn(`[image:upload] Warning: ${(bytes.length / 1024 / 1024).toFixed(2)} MB. Compress large images before publishing.`);
}

if (!printOnly) {
  const command = [
    '--yes', 'wrangler', 'r2', 'object', 'put', `${config.bucket}/${key}`,
    '--file', file,
    '--content-type', contentType,
    '--cache-control', 'public, max-age=31536000, immutable',
    '--remote'
  ];
  let executable = 'npx';
  let commandArgs = command;
  if (process.platform === 'win32') {
    const npxScript = path.join(process.env.APPDATA || '', 'npm', 'npx.ps1');
    if (!fs.existsSync(npxScript)) fail(`Cannot find npx.ps1: ${npxScript}`);
    executable = 'powershell.exe';
    commandArgs = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', npxScript, ...command];
  }
  const result = spawnSync(executable, commandArgs, { cwd: root, stdio: 'inherit' });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) fail(`Wrangler exited with code ${result.status}`);
}

const baseUrl = String(process.env.IMAGE_CDN_BASE_URL || config.publicBaseUrl || '').replace(/\/$/, '');
const placeholder = !baseUrl || baseUrl.includes('REPLACE_WITH_YOUR_SUBDOMAIN');
const url = placeholder ? `<IMAGE_CDN_BASE_URL>/${key}` : `${baseUrl}/${key}`;
const alt = path.basename(file, extension).replace(/[-_]+/g, ' ');
const markdown = `![${alt}](${url})`;

console.log(`\nR2 key: ${key}`);
console.log(`URL: ${url}`);
console.log(`Markdown: ${markdown}`);

if (!printOnly && !noCopy && !placeholder && process.platform === 'win32') {
  const copied = spawnSync('clip.exe', [], { input: markdown, encoding: 'utf8' });
  if (copied.status === 0) console.log('Markdown copied to clipboard.');
}

if (placeholder) {
  console.log('Set publicBaseUrl in image-host.config.json after the first Worker deployment.');
}
