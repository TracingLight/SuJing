# 溯境

该博客基于 Hexo 与 Butterfly 构建，部署于 Cloudflare Pages。

- Website: <https://sujing.dev>
- Repository: <https://github.com/TracingLight/SuJing>

## 本地开发

要求 Node.js 22 和 npm 10。

```bash
npm install
npm run server
```

默认访问地址为 `http://localhost:4000`。

## 写作

```bash
npx hexo new post "文章标题"
```

文章位于 `source/_posts/`。发布前补全分类、标签、摘要和封面，并确认文章中涉及的版本、数据与结论可以复核。

本站 Markdown / Butterfly 标签说明见：[docs/写博客-Markdown语法.md](docs/写博客-Markdown语法.md)（含与常见 Markdown 的差异，以及预览与线上渲染不一致处）。

## 图片素材

- 用户提供的原始图片放入 `assets/user/`
- 经过筛选、裁切和压缩的站点图片放入 `source/img/user/`
- 网站中以 `/img/user/文件名.webp` 引用处理后的图片

不会直接覆盖原始素材，会根据用途生成适合首页横幅、文章封面、项目截图或正文插图的版本，并尽量转换为 WebP。

## 访问统计

全站访客 / 访问量与文章阅读量由自建 Cloudflare Worker + KV 提供，不依赖不蒜子。

- 代码：`infra/site-stats/`
- 公开接口：`https://stats.sujing.dev`
- 部署：`npm run stats:deploy`

## 留言评论

文章页与关于页使用自建 Cloudflare Worker + D1 留言系统，前端样式在 `sujing.css` / `sujing.js`。

- 代码：`infra/site-comments/`
- 公开接口：`https://comments.sujing.dev`
- 初始化表结构：`npm run comments:schema`
- 部署：`npm run comments:deploy`

## R2 图床

博客使用 Cloudflare R2 作为长期图片存储，Worker 提供只读图片地址。配置与代码位于 `infra/image-host/`，上传工具为 `tools/upload-image.js`。仓库中不保存 Cloudflare 密钥。

首次配置：

先在 Cloudflare Dashboard 的 R2 页面启用 R2。Cloudflare 可能要求确认计费资料；R2 未启用时，Wrangler 会返回错误代码 `10042`。

```bash
npm run image:login
npm run image:bucket
npm run image:deploy
```

部署完成后，将 Wrangler 输出的 Worker 地址写入 `image-host.config.json` 的 `publicBaseUrl`。例如：

```json
{
  "bucket": "sujing-images",
  "publicBaseUrl": "https://sujing-image-cdn.example.workers.dev",
  "defaultFolder": "blog"
}
```

上传图片：

```bash
npm run image:upload -- assets/user/illustrations/example.webp
npm run image:upload -- assets/user/screenshots/example.png screenshots
```

上传成功后会输出 R2 Key、公开 URL 和 Markdown；Windows 下会自动把 Markdown 复制到剪贴板。文件名包含内容哈希，可使用一年不可变缓存。购买域名后，建议把 Worker 绑定到 `img.你的域名`，再更新 `publicBaseUrl`。

## 音乐、短讯与相册

- 歌单配置：`source/_data/music.yml`
- 短讯配置：`source/_data/notes.yml`
- 相册配置：`source/_data/gallery.yml`
- 本地音频建议放在 `source/media/music/`

## 验证

```bash
npm run check
npm run check:performance-build
```

`npm run check` 会清理旧产物并重新生成站点，输出目录为 `public/`。

`npm run check:performance-build` 校验的是真正上线的 HTML：最新文章已预渲染、首屏图 eager、第三方资源已本地化、每个响应式图片候选都存在且小于原图、缓存头生效。

## Cloudflare Pages

- Project: `sujing`
- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `public`
- Node.js version: `22`

仓库可以独立构建（`scripts/local-vendor.js` 与 `scripts/responsive-images.js` 已纳入版本控制，第三方资源与响应式图片都在构建期生成），因此下面两条发布路径都可用：

- **本地直传**：`npm run pages:deploy`，依次执行 `npm run check`（构建）、`npm run prune`（把仅本机使用的资源从产物中移除并复查无残留）、`npm run check:performance-build`（产物验收）、`wrangler pages deploy`。工作区里未提交的内容也会一并发布。
- **Git 构建**：推送到 `main` 后由 Pages 自动构建，只包含仓库里已提交的内容。

两条路径写入同一个生产环境，后执行的一方覆盖前一方。推送前请确认内容已提交，否则 Git 构建会把尚未提交的文章回退掉。

### 下线资源

Cloudflare Pages 在新部署缺少某个文件时，会回落到历史部署里的同名文件：文件已经从 `source/` 删掉、产物里也没有了，线上按老路径请求仍然返回 200，清缓存也不解决。因此下线一个资源必须同时做两件事：

1. 从 `source/` 移除（本地直传时 `npm run prune` 还会把它从产物里摘掉）；
2. 在 `scripts/site-redirects.js` 的名单里登记该路径，构建时生成的 `_redirects` 会把它固定为 404。

`npm run check:performance-build` 会校验 `_redirects` 存在且规则生效。

站点主域名：

<https://sujing.dev>

Pages 回退地址：<https://sujing.pages.dev>

图床主域名：<https://img.sujing.dev>。`workers.dev` 地址保留为故障回退入口。

## 设计参考

站点以 Butterfly 为底层，并参考 AnZhiYu 的首页信息架构、中控台、分类横栏、音乐入口、短讯和相册体验。相关增强均在本项目中重新实现，没有复制 AnZhiYu 的 GPL-3.0 源码。
