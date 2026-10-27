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

直接运行 `npm run server` 时默认访问地址为 `http://localhost:4000`。如果端口被占用，Hexo 会按自身提示处理；使用下方的 `npm run admin` 时，启动器会自动选择可用端口并在终端打印实际地址。

### Windows 快速打开本机控制台

双击项目根目录的 `start-console.bat`，启动管理 API 和博客预览，页面就绪后自动打开浏览器。在博客右下角点击「管」，首次使用时粘贴启动窗口显示的 Token。保留启动窗口，按 `Ctrl+C` 停止服务。服务已运行时，再次启动会直接打开页面。

运行以下命令，可在桌面创建带小猫图标的「溯境控制台」快捷方式；移动项目后重新运行即可更新路径：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\install-console-shortcut.ps1
```

本机控制台依赖 `tools/admin/`（按现有仓库规则仅保存在本机）。首次使用前先安装项目依赖。`npm run admin` 会先启动可用的 Hexo 预览，再启动 API；`4000` 被其它服务占用时会顺延到下一个端口，API 健康检查和管理台会跟随实际博客地址。

## 写作

```bash
npx hexo new post "文章标题"
```

文章位于 `source/_posts/`。发布前补全分类、标签、摘要和封面，并确认文章中涉及的版本、数据与结论可以复核。

本站 Markdown / Butterfly 标签说明见：[docs/写博客-Markdown语法.md](docs/写博客-Markdown语法.md)（含与常见 Markdown 的差异，以及预览与线上渲染不一致处）。

文章批注使用 `{% annotation "说明" %}词语{% endannotation %}`，专栏入口会悬浮显示 Unity、C#、C++、计算机基础和设计模式标签，点击后进入对应独立页面；文章按分类或标签自动归类，管理台正文工具栏可以直接插入批注。

工程结构、数据流、Worker 边界、发布流程和变更规则见：[docs/项目工程指南.md](docs/项目工程指南.md)。日常新建文章、发布、故障排查和资源下线见：[docs/维护与发布说明.md](docs/维护与发布说明.md)。

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

日常发布使用桌面「溯境控制台」：修改内容 → 写入本地 → 预览 → 在「发布」页点击 **确认部署**（GitHub → Pages）。

按钮依次执行本地构建、产物裁剪和验收，然后将全部未被 Git 忽略的项目修改（新增、修改、删除）提交到 main 并推送 GitHub，由 Cloudflare Pages 自动构建上线。文章、图片、配置和代码会一起同步；密钥、本机控制台、归档与重复原图按 .gitignore 排除。原本已经被 Git 跟踪的文件仍会提交。发布前请确认本地修改均可公开。

命令行入口为 npm run publish:site；旧的 publish-latest.bat 也已接入同一流程，不再只选最新文章。

要求处于 main 分支，且远端没有本机尚未合并的提交。构建或推送失败会停止并记录错误；推送失败时保留本地提交，修复后再次点击即可重试，不执行强制推送或自动合并。没有文件修改时仍会推送此前尚未上传的提交。

**GitHub 同步成功不代表已经上线。** 页面会提示查看 Cloudflare 部署记录；云端构建失败应在修复后重新提交发布。

npm run pages:deploy 保留为需要手动执行的本地直传入口，不会自动提交 Git。日常使用上面的统一发布入口，避免与 Git 自动部署交替覆盖。

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
