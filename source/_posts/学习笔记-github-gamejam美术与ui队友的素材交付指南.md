---
title: GameJam美术素材交付指南
date: '2026-11-25 16:28:00'
categories:
  - 学习笔记
tags:
  - Github
  - GameJam
  - 团队协作
  - Unity
description: 这是一篇面向美术和UI同学的GameJam素材交付指南，介绍了如何通过GitHub网页上传和GitHub Desktop两种方式提交美术素材，并附带了常见问题解答与速查表
copyright: true
updated: '2026-11-25 17:46:18'
cover: /img/covers/wallpaper-01-4k-mwvxtqew.webp
cover_position: 54.8% 13.7%
---

这篇是写给美术和UI同学的交付指南

如果你还没注册账号、或者访问 GitHub 有困难，先看[《GitHub网站与核心概念》](/2026/09/09/学习笔记-github/)；想系统了解提交、分支、PR 这些概念，看[《GitHub网站上的核心操作》](/2026/09/09/学习笔记-github-本文介绍了github网站上的核心操/)

本篇默认你已经有账号、能打开仓库页面

{% note info %}
本文以 Windows + GitHub 网页为例，macOS 操作基本一致，文中的目录名（如 `Assets/Art/UI`）是示例，请替换成你们队实际的目录。
{% endnote %}

## 首先要装 Git 吗？

**不用**

- **网页上传**：什么都不用装，浏览器打开仓库就能传
- **GitHub Desktop**：图形界面客户端，**自带 Git**，也不需要单独安装 Git
- **命令行 Git**：才需要单独安装，本篇不教，美术同学也用不上


| 路线 | 需要安装 | 适合谁 | 学习成本 |
| --- | --- | --- | --- |
| 网页上传 | 无 | 偶尔传一批新素材的同学 | 5 分钟 |
| GitHub Desktop | Desktop（自带 Git） | 每天改图、要同步别人进度、批量管理文件的同学 | 半小时 |
| 命令行 Git | Git | 程序 | 本篇不涉及 |

**GameJam 期间，网页上传就是正当的交付方式** 

不必让美术同学学 Git，防止出现问题，主要靠团队约定即可

下面先讲多数人用的网页路线，再讲进阶的 Desktop 路线

## 一分钟建立认知

把仓库想成一个**带历史记录的共享文件夹**：

- 你上传文件 = 往共享文件夹里存东西，并自动记录一条信息，<span style="color:#d75a4a">谁在什么时候存了什么</span>，这条记录叫**提交（Commit）**
- 网页上看到的永远是最新版本，而程序同学习惯把仓库**克隆**一份到自己电脑上，那份是副本，要**拉取（Pull）**才会更新
- 如果出现我传上去了，队友怎么没看到的情况，多半是他没拉取，或者你传错了目录/分支

## 路线 A：网页上传的标准流程

<!-- 截图：仓库文件列表页，标注左上角分支下拉框、Add file 按钮 -->


![image](/img/posts/image-mwvvreqk.png)



![image](/img/posts/image-mwvvvhpf.png)



1. 打开仓库页面，确认左上角分支下拉框显示的是 `main`（主分支）
2. 点进**自己负责的文件夹**，比如 `Assets/Resources/UI`，一定先确认路径再传，<span style="color:#d75a4a">不要传错路径</span>
3. 点文件列表右上方的 `Add file`（添加文件）→ `Upload files`（上传文件）
4. 把文件拖进虚线框，可以一次选中多个文件一起拖，确认页面列出的文件名无误
5. 在下方 `Commit changes`（提交变更）区域写提交信息，一行说清"加了什么/改了什么"，例如：

```text
UI: 新增主界面按钮图标 12 张
```

最好不要写"更新""111"这种，几天后没人知道这个提交干了什么（）

6. 选择 `Commit directly to the main branch`（直接提交到 main 分支），点 `Commit changes`


![image](/img/posts/image-mwvw0f7i.png)



{% note warning %}
网页上传是**直接提交到 main、没有审查**的，正式项目通常走分支 + PR（见[《GitHub网站上的核心操作》](/2026/09/09/学习笔记-github-本文介绍了github网站上的核心操/)），但 GameJam 争分夺秒，我们接受这个简化，但请遵守各自的团队约定，防止出现问题
{% endnote %}

{% note info %}
**大小限制**：网页上传单个文件不能超过 **25 MiB（约 26 MB）**，超了会直接失败；git 推送的上限是单文件 100 MiB（超过 50 MiB 会警告），再大的文件需要 Git LFS，最好不使用，比赛期间可以优先压缩、切图，见[官方文档](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)，若仓库已配置 Git LFS（`.gitattributes` 中有对应规则），被其管理的文件类型网页上传会被直接拦截，哪怕文件很小，详见 FAQ
{% endnote %}

### 替换已有素材

改了一张图怎么办？**在同一个文件夹里重新上传同名文件**，就是覆盖

旧版本不会消失，留在历史记录里（文件页的 `History` 按钮可以查看）

### 网页端的弊端

- 批量重命名、移动、删除多个文件：网页只能一个个点开文件操作，很痛苦
- 管理整个文件夹、几十上百个文件：用 Desktop
- 在线编辑图片：网页只能编辑文本文件，图片只能重新上传覆盖

删除单个误传的文件：在网页上点开该文件 → 右上角垃圾桶图标（Delete this file，删除此文件）→ 提交

当你发现自己频繁需要这些操作时，可以尝试使用 Desktop 

## 路线 B：GitHub Desktop（频繁协作者）

适合：每天都要改图、需要拿到程序和其他美术的最新文件、一次管理大量素材的同学



![image](/img/posts/image-mwvwztv0.png)




![image](/img/posts/image-mwvx1he4.png)




![image](/img/posts/image-mwvx8ryj.png)




![image](/img/posts/image-mwvxen0x.png)





![image](/img/posts/image-mwvxo45f.png)






![image](/img/posts/image-mwvxspc1.png)





1. **安装**：到 [desktop.github.com](https://desktop.github.com) 下载安装，它自带 Git，不用另外装
2. **登录**：首次启动按引导登录（浏览器授权）；也可以从 `File`（文件）→ `Options`（选项）→ `Accounts`（账户）登录
3. **克隆仓库**：`File`（文件）→ `Clone repository`（克隆仓库）→ 选中你们的仓库 → 选一个本地路径，完成后本地就有一份完整项目，克隆下来的是整个仓库（包括 Unity 工程），你只需要关心素材目录，其他文件夹别动
4. **每天开工第一步：拉取**，点右上角 `Fetch origin`（获取远端更新）；如果按钮变成 `Pull origin`（拉取），再点一次，把队友的更新合并到本地
5. **放素材**：在资源管理器里，把文件放进本地仓库的对应文件夹（和网页上传是同一套目录）
6. **提交**：回到 Desktop，左侧 `Changes`（更改）列出所有改动 → **只勾选自己的素材**，别把不认识的改动一起提交 → 左下角 `Summary`（摘要）写提交信息 → 点 `Commit to main`（提交到 main）
7. **推送**：点右上角 `Push origin`（推送到远端），**不推送，队友就看不到你的改动**，提交只是存到你本机，推送才是上传

{% note danger %}
顺序不能乱：**先拉取 → 再改 → 提交 → 推送**，落后于远端时直接推送会被拒绝，Desktop 会提示你先拉取
{% endnote %}



## FAQ：出问题先查这里

**Q：找不到 Upload files 按钮 / 提示没有权限？**
私有仓库需要仓库管理员把你加为协作者：仓库 `Settings`（设置）→ `Collaborators`（协作者）→ `Add people`（添加成员），然后你在邮箱或 GitHub 通知里接受邀请。组织仓库则由管理员在组织成员/团队里添加

**Q：上传失败，提示文件太大？**
网页单文件上限 25 MiB。先压缩（PNG 可用 TinyPNG 等工具）、切图、音频降采样；还超就走 Desktop（100 MiB 以内）；再大请找程序评估 LFS

**Q：提示"以下文件配置为存储在 Git LFS 中，必须通过安装 Git LFS 的 Git 命令行推送"？**
说明仓库的 `.gitattributes` 已把这类文件交给 Git LFS 管理，而网页上传写不了 LFS，会被直接拦截，改走 GitHub Desktop（内置 LFS，提示里写命令行但 Desktop 同样可以）或交程序代传；若队里其实不需要 LFS、历史里也还没有 LFS 指针文件（本地跑 `git lfs ls-files` 可查），由程序删改 `.gitattributes` 对应规则并提交即可恢复网页上传。已有指针文件时不能直接删规则，否则队友拉取后拿到的是指针文本而非素材

**Q：传错了怎么办？**
少量误传：网页上打开该文件 → 垃圾桶图标删除 → 提交；或者同名覆盖正确版本。已经影响到别人：找程序用 revert 回退，别自己删库或强制操作

**Q：看不到队友刚传的图？**
分三种情况：网页端刷新就是最新的（先确认分支和目录对不对）；Desktop/本地克隆要先 Fetch/Pull；Unity 里还要等程序导入并提交 `.meta` 后拉取

**Q：没装 Git 能用吗？**
网页上传完全不用装；Desktop 自带 Git；只有命令行才需要单独装

**Q：图传上去了，Unity 里引用却丢了（Inspector 显示 Missing）？**
找程序检查：`.meta` 是否提交了、是不是有人在网页上改了名/挪了目录、覆盖时是否保持了同名

## 一页速查表

| 场景 | 操作 |
| --- | --- |
| 传新素材 | 进对文件夹 → Upload files → 写清提交信息 → Commit → 群里 @程序 |
| 改已有素材 | 同名覆盖 → 覆盖前打招呼 → @程序 |
| Desktop 日常 | 先 Fetch/Pull → 改文件 → Commit → Push |
| 文件超 25 MiB | 压缩/切图，或走 Desktop；超 100 MiB 找程序 |
| 传错了 | 网页删除该文件或同名覆盖；影响别人就找程序 revert |


