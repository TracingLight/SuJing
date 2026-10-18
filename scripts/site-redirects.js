'use strict';

/**
 * 已下线资源的硬性拦截。
 *
 * Cloudflare Pages 在新部署缺少某个文件时，会回落到历史部署里的同名文件：
 * 文件已经从 source/ 删掉、产物里也没有了，线上仍然能按老路径取到 200。
 * 仅靠「从产物里删文件」无法真正下线，必须用 _redirects 显式声明这些路径不可访问。
 *
 * 注意：这里列出的路径都只在本机使用或已废弃，页面中不再有任何引用。
 */
const GONE = [
  // 本机管理控制台
  '/js/sujing-admin.js',
  '/js/sujing-admin-loader.js',
  '/css/sujing-admin.css',
  // 历史实验样式与脚本（已移到 assets/_archive/）
  '/css/advanced-effects.css',
  '/css/visual-enhancements.css',
  '/css/image-responsive.css',
  '/js/featured-posts.js',
  '/js/image-enhancements.js',
  '/js/keyboard-shortcuts.js',
  '/js/loading-effects.js',
  '/js/menu-enhancements.js',
  '/js/particle-background.js',
  '/js/scroll-enhancements.js',
  '/js/sujing-effects.js'
];

hexo.extend.generator.register('sujing-redirects', () => ({
  path: '_redirects',
  data: `${GONE.map((item) => `${item}  /404.html  404`).join('\n')}\n`
}));
