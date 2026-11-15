'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
let routes = [];

hexo.extend.filter.register('before_generate', () => {
  routes = [];
  // Font Awesome webfonts are replaced by size-optimized subsets (assets/fontawesome-subset)
  // after generation (tools/subset-fonts.js). Read the subset bytes here when present so the
  // vendor hash (and therefore the immutable cache URL) changes whenever the subset changes.
  const faSubsetDir = path.join(hexo.base_dir, 'assets', 'fontawesome-subset');
  const faWebfonts = fs
    .readdirSync(path.join(hexo.base_dir, 'node_modules/@fortawesome/fontawesome-free/webfonts'))
    .map((file) => `webfonts/${file}`);
  const definitions = [
    { name: 'pjax', files: ['pjax.min.js', 'LICENSE'], assets: { pjax: 'pjax.min.js' } },
    { name: 'vanilla-lazyload', files: ['dist/lazyload.iife.min.js', 'LICENSE'], assets: { lazyload: 'dist/lazyload.iife.min.js' } },
    { name: '@fancyapps/ui', files: ['dist/fancybox/fancybox.umd.js', 'dist/fancybox/fancybox.css', 'LICENSE.md'], assets: { fancybox: 'dist/fancybox/fancybox.umd.js', fancybox_css: 'dist/fancybox/fancybox.css' } },
    { name: '@fortawesome/fontawesome-free', files: ['css/all.min.css', 'LICENSE.txt', ...faWebfonts], assets: { fontawesome: 'css/all.min.css' }, subsetDir: faSubsetDir }
  ];
  const options = {};
  for (const definition of definitions) {
    const base = path.join(hexo.base_dir, 'node_modules', definition.name);
    const contents = definition.files.map((file) => {
      const subsetFile = definition.subsetDir ? path.join(definition.subsetDir, path.basename(file)) : null;
      if (subsetFile && file.startsWith('webfonts/') && fs.existsSync(subsetFile)) {
        return [file, fs.readFileSync(subsetFile)];
      }
      return [file, fs.readFileSync(path.join(base, file))];
    });
    const hash = crypto.createHash('sha256');
    for (const [file, data] of contents) hash.update(file).update(data);
    const prefix = `vendor/${definition.name.replaceAll('/', '-')}-${hash.digest('hex').slice(0, 12)}`;
    for (const [file, data] of contents) routes.push({ path: `${prefix}/${file}`, data });
    for (const [key, file] of Object.entries(definition.assets)) options[key] = `/${prefix}/${file}`;
  }
  hexo.theme.config.CDN.option = { ...hexo.theme.config.CDN.option, ...options };
}, 8);

hexo.extend.generator.register('sujing-local-vendor', () => routes);
