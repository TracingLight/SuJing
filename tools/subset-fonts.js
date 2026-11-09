const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const publicVendor = path.join(root, 'public', 'vendor');
const assets = path.join(root, 'assets', 'fontawesome-subset');
const fontNames = ['fa-solid-900.woff2', 'fa-brands-400.woff2', 'fa-regular-400.woff2', 'fa-v4compatibility.woff2'];

if (!fs.existsSync(assets)) {
  console.warn('[fonts] subset assets not found; skipping');
  process.exit(0);
}

const packageDir = fs.existsSync(publicVendor)
  ? fs.readdirSync(publicVendor).find((name) => name.startsWith('@fortawesome-fontawesome-free-'))
  : null;

if (!packageDir) {
  console.warn('[fonts] Font Awesome vendor not found; skipping');
  process.exit(0);
}

const targetDir = path.join(publicVendor, packageDir, 'webfonts');
if (!fs.existsSync(targetDir)) {
  console.warn('[fonts] webfonts directory not found; skipping');
  process.exit(0);
}

let saved = 0;
for (const name of fontNames) {
  const source = path.join(assets, name);
  const target = path.join(targetDir, name);
  if (!fs.existsSync(source)) continue;
  const before = fs.existsSync(target) ? fs.statSync(target).size : 0;
  fs.copyFileSync(source, target);
  const after = fs.statSync(target).size;
  if (before > after) saved += before - after;
}

console.log(`[fonts] subset Font Awesome installed (saved ${(saved / 1024).toFixed(1)} KB)`);
