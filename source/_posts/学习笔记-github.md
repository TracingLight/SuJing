---
title: GitHub网站与核心概念
date: '2026-09-09 22:58:26'
updated: '2026-09-10 14:26:24'
categories:
  - 学习笔记
tags:
  - Github
description: 摘要：本文介绍了GitHub的访问方法、账户注册与安全设置，以及仓库、Issue、Pull Request等核心概念。
cover: /img/covers/preview-mtu7jtvv.jpg
copyright: true
cover_position: 66.6% 38.8%
---

在学习任何具体操作之前，我们首先要登陆这片名为GitHub的新大陆。本章的目标是解决一个最基础但至关重要的问题：如何从零开始，认识并进入GitHub这个全球最大的开发者社区与代码托管平台？ 

## 国内访问GitHub的方法

由于网络原因，国内用户直接访问 github.com 可能速度缓慢甚至无法连接。这是学习GitHub的第一道门槛。

解决方案概览：主要有两种思路：修改本地系统配置，或使用代理工具。

方案一：修改本地Hosts文件

核心概念：Hosts文件
一个位于操作系统中的文本文件，其作用是将域名（如 github.com）映射到对应的IP地址，绕开DNS（域名系统）解析，直接告诉计算机该去哪里访问这个网站。

操作逻辑：
- 获取IP：从可靠的网站或工具查询 `github.com、assets-cdn.github.com` 等关键域名当前最快、最稳定的IP地址。
- 修改Hosts：以管理员身份编辑系统Hosts文件（路径通常为 `C:\Windows\System32\drivers\etc\hosts` 或 `/etc/hosts`），在文件末尾添加映射关系，例如：`140.82.114.4 github.com`
- 刷新缓存：在命令行执行 ipconfig /flushdns (Windows) 或 sudo killall -HUP mDNSResponder (macOS) 使修改生效。

时效性：GitHub的服务器IP地址可能会变更，因此此方法获取的IP可能在一段时间后失效，需要重新查找和更新。
操作风险：错误编辑Hosts文件可能导致其他网站无法访问。修改前建议备份原文件。

方案二：使用科学上网工具/代理服务

核心概念：代理 (Proxy)
一个中间服务器，你的网络请求先发送到代理服务器，再由它转发到目标网站（如GitHub），并将响应返回给你。这可以突破本地网络的限制。

优势：通常更稳定、速度更快，且能一劳永逸地解决多种海外网站的访问问题。

## 账户创建与安全

成功访问 github.com 后，下一步是获得一个GitHub账户。

注册账户步骤

- 点击首页的 "Sign up" 按钮。
- 依次填写：邮箱（用于验证和通知）、密码、用户名（将成为你个人主页地址的一部分，如 https://github.com/你的用户名）。
- 完成邮箱验证，激活账户。

### 双重身份验证 (2FA, Two-Factor Authentication)

定义：在密码之外，增加第二道身份验证屏障（通常是手机APP生成的一次性动态码或物理安全密钥）。

为何必需？ 密码可能因泄露、被猜解而失效。2FA确保了即使密码被盗，攻击者没有你的第二验证设备（通常是手机），也无法登录你的账户。这是保护代码资产最关键的安全措施之一。

常见工具：Authenticator类APP（如 Google Authenticator, Microsoft Authenticator, Authy）。

![image](/img/posts/image-mtv59bw1.png)

位置在`Settings`下的`Password and authentication`
![image](/img/posts/image-mtu8cixc.png)

![image](/img/posts/image-mtu8ibku.png)
> 务必保存好2FA的备用恢复码！ 如果丢失了验证设备（如手机），恢复码是找回账户访问权的唯一途径。
> 建议备份到网盘和U盘中。

## 核心模块概览

登录后，你将看到GitHub的界面。

### 仓库 (Repository / Repo)

GitHub上最基本的存储单位。一个仓库通常对应一个项目，里面包含项目的所有文件（代码、文档、图片等）以及每个文件的修改历史。

就像一个项目的"专属文件夹"，但这个文件夹自带完整的版本记录和协作功能。

关键文件：README.md。这是仓库的"门面"和说明书，使用Markdown语法编写，用于向访客介绍项目是什么、如何安装、如何使用等。

### 议题 (Issue)

用于跟踪任务、增强功能、报告缺陷（Bug）或发起讨论的板块。你可以把它理解为项目的"任务清单"或"问题讨论区"。

作用：在开源项目中，用户可以通过提交Issue来反馈Bug。开发者则用Issue来规划新功能或分配开发任务。它是异步协作的核心工具。

### 拉取请求 (Pull Request / PR)
一种通知机制。当你修改了某个项目的代码（通常是在你自己复制的仓库里），并希望将你的修改合并到原项目中时，你就可以发起一个PR。

工作流程：PR中会清晰展示你做了哪些修改（代码差异）。项目维护者可以审查你的代码，讨论修改，最后决定是否接受（合并）你的贡献。这是开源协作中贡献代码的标准方式。

### 发布 (Release)

为仓库的特定版本（如 v1.0.0, v2.1-beta）打包并提供可下载的软件包（如 .zip, .exe）。

作用：为软件用户提供稳定、打包好的版本，而非总是让他们下载最新的、可能不稳定的开发代码。Release通常附带版本说明，告知用户此版本的新特性和修复的问题。

> 为什么是"Pull Request"而不是"Push Request"？ 这源于Git的分布式哲学。
> 在Git中，push（推送）是指你主动将本地的修改上传到远程仓库。而pull request的本质是：你请求（Request）项目的原始维护者"拉取（Pull）"你的修改到他的仓库中。主动权在维护者手中，他有权审查并决定是否接受你的代码。


