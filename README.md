# 溯境

溯光如初的游戏开发技术博客，基于 Hexo 与 Butterfly 构建，部署于 Cloudflare Pages。

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

## 图片素材

- 用户提供的原始图片放入 `assets/user/`
- 经过筛选、裁切和压缩的站点图片放入 `source/img/user/`
- 网站中以 `/img/user/文件名.webp` 引用处理后的图片

不要直接覆盖原始素材。我会根据用途生成适合首页横幅、文章封面、项目截图或正文插图的版本，并尽量转换为 WebP。

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
```

该命令会清理旧产物并重新生成站点。输出目录为 `public/`。

## Cloudflare Pages

- Project: `sujing`
- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `public`
- Node.js version: `22`

当前可通过以下命令清理、构建并部署生产版本：

```bash
npm run pages:deploy
```

GitHub 仓库接入 Cloudflare Pages 后，推送到 `main` 将由 Cloudflare 自动构建。站点主域名：

<https://sujing.dev>

Pages 回退地址：<https://sujing.pages.dev>

图床主域名：<https://img.sujing.dev>。`workers.dev` 地址保留为故障回退入口。

## 设计参考

站点以 Butterfly 为底层，并参考 AnZhiYu 的首页信息架构、中控台、分类横栏、音乐入口、短讯和相册体验。相关增强均在本项目中重新实现，没有复制 AnZhiYu 的 GPL-3.0 源码。
