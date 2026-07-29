# 溯境博客 Markdown 语法大全

面向在本仓库写文章时使用。渲染栈是：

| 层 | 引擎 | 作用 |
|----|------|------|
| 正式发布 | Hexo `hexo-renderer-marked`（GFM）+ 主题 Butterfly 标签 | 线上读者看到的效果 |
| 本机 CMS 分栏预览 | `sujing-admin.js` 预览解析 | **覆盖下文第 2 节 GFM 写法**，以及常用 `note` / `label` / `hide*` / `btn`；`tabs` / `timeline` / `gallery` 等为简化预览 |

复杂主题交互（系列列表、Mermaid 真渲染等）仍以 `hexo server` / 线上为准。

---

## 1. 先分清：Front Matter ≠ Markdown 正文

文章文件结构：

```markdown
---
title: 标题
date: 2026-07-26 12:00:00
categories:
  - 学习笔记
tags:
  - C++
description: 一两句摘要
cover: /img/covers/xxx.webp
---

这里才是 Markdown 正文……
```

分类、标签、摘要、封面、文件名 slug 等，在本机 CMS 右侧「属性设置」填写即可，一般**不要**在正文里手写 YAML。

正文里也不要再写一层 `---` Front Matter。

---

## 2. 本站推荐的常用写法（优先掌握）

### 2.1 标题

```markdown
# 一级标题（文章里少用，页面已有标题）
## 二级标题
### 三级标题
#### 四级及以下
```

CMS 工具栏「H2」会给当前行加 `## `。目录（TOC）由主题根据标题自动生成。

### 2.2 段落与换行

- 空一行：新段落。
- 本站 `breaks: true`：**单独换行也会变成 `<br>`**（和部分「必须行尾两空格」的旧习惯不同）。

```markdown
第一行
第二行会紧挨着换行显示

上面空一行后，这里是新段落。
```

### 2.3 强调

```markdown
**加粗**
*斜体*
***加粗且斜体***
~~删除线~~
`行内代码`
```

也可用 `__加粗__`、`_斜体_`。行内代码用反引号，适合类型名、函数名，如 `` `std::vector` ``。

> CMS 预览支持加粗/斜体/删除线/行内代码；转义见 2.12。

### 2.4 上标 / 下标（算法复杂度常用）

本站是 **GFM + HTML**，**不支持** Pandoc 的 `^2^`、`~2~`，也**没有**开 KaTeX。  
`O(n^2)` 里的 `^` 只是普通字符，不会变成上标。

请直接写 HTML（Hexo 与 CMS 预览都认）：

```markdown
时间复杂度是 O(n<sup>2</sup>)，空间复杂度是 O(1)。
水分子写作 H<sub>2</sub>O。
同时用：x<sub>i</sub><sup>2</sup>
```

写法要点：

| 想要 | 写法 | 错误示例 |
|------|------|----------|
| 上标 ² | `<sup>2</sup>` | `^2`、`n^2`（不会抬高） |
| 下标 ₂ | `<sub>2</sub>` | `~2~`（本站不是删除线那种语义） |

CMS 工具栏有 **X² / X₂**：先选中数字或文字再点，会包上 `<sup>` / `<sub>`。

### 2.5 引用

```markdown
> 这是引用。
> 可连续多行。
```

### 2.6 列表

无序：

```markdown
- 第一项
- 第二项
  - 子项（缩进）
* 星号也可以
+ 加号也可以
```

有序：

```markdown
1. 第一步
2. 第二步
3. 第三步
```

任务列表（GFM；CMS 预览显示为复选框）：

```markdown
- [ ] 未完成
- [x] 已完成
```

### 2.7 代码块（技术文最常用）

围栏代码，**建议写上语言名**以便高亮（本站 `highlight.js`）：

````markdown
```cpp
class Widget {
public:
  explicit Widget(int n) : n_(n) {}
private:
  int n_;
};
```
````

常用语言标识：`cpp`、`c`、`csharp`、`js`、`ts`、`json`、`bash`、`yaml`、`markdown`、`text`。

主题开启了行号、复制按钮；过长代码块有高度限制（约 900px，可滚动）。

行内：`` `code` ``。

### 2.8 链接

外链：

```markdown
[文字](https://example.com)
[文字](https://example.com "可选 title")
```

**站内文章（推荐相对路径）**，permalink 为 `:year/:month/:day/:title/`：

```markdown
[上一篇：类的概念](/2026/07/25/学习笔记-c-面向对象-如何理解c-中类的概念-并用它将数/)
```

本机 CMS：点工具栏「链接」→ 在「本站文章」里搜索点选，会自动填入上述路径；也可手填 `https://…`。

自动链接（GFM）：

```markdown
https://sujing.dev
```

### 2.9 图片

```markdown
![说明文字](/img/posts/xxx.webp)
![说明文字](/img/posts/xxx.webp "可选 title")
```

约定：

- 正文插图优先 `/img/posts/…`
- 封面在属性里填 `/img/covers/…`，不要当正文首图硬塞
- CMS「图片」可上传本机或填 URL；主题开启 Fancybox，点击可灯箱放大

HTML 图片一般也能用，但优先 Markdown，便于维护。

### 2.10 表格（GFM）

```markdown
| 成员类型 | 拷贝行为 | 典型场景 |
| --- | --- | --- |
| 无指针 | 浅拷贝通常够用 | 值对象 |
| 有指针 | 常需三/五法则 | 资源管理 |
```

对齐：

```markdown
| 左对齐 | 居中 | 右对齐 |
| :--- | :---: | ---: |
| a | b | c |
```

### 2.11 分割线

```markdown
---
***
___
```

单独一行，前后最好空行。注意不要和 Front Matter 的 `---` 搞混（Front Matter 只在文件最顶部）。

### 2.12 转义

特殊字符前加反斜杠，避免被当成语法：

```markdown
\*不是斜体\*
\`不是代码\`
```

---

## 3. 与「常见 Markdown」的差异（容易踩坑）

| 习惯 | 本站实际情况 |
|------|----------------|
| 换行要行尾两空格 | 已开 GFM `breaks`，**直接回车就会断行** |
| Typora / Notion 的 Callout | 本站用 Butterfly `{% note %}`（见下节），不是 `::: tip` |
| Wiki `[[文章名]]` | **不支持**；用链接弹层选本站文章 |
| `$公式$` / KaTeX | **当前未配置**数学公式插件 |
| `n^2` / Pandoc `^2^` | **不会**变成上标；用 `n<sup>2</sup>`（见 2.4） |
| Mermaid 代码围栏 | 主题有 `{% mermaid %}` 标签，但站点未专门配 CDN；需要图示时优先用图片 |
| CMS 预览 ≈ 线上 | 第 2 节与常用标签可预览；系列列表 / Mermaid 真渲染等仍以正式站点为准 |

---

## 4. Butterfly 标签插件（Hexo 标签，不是标准 Markdown）

写法形如 `{% 标签名 参数 %}` … `{% end标签名 %}`。  
CMS 预览对 `note` / `label` / `hide*` / `btn` 做可读渲染；`tabs` / `timeline` / `gallery` 等显示为简化面板。

### 4.1 提示框 `note`（强烈推荐替代「伪 Callout」）

```markdown
{% note info %}
补充说明、背景知识。
{% endnote %}

{% note warning %}
容易写错的地方。
{% endnote %}

{% note danger %}
危险操作或未定义行为。
{% endnote %}

{% note success %}
推荐做法。
{% endnote %}

{% note primary %}
一般强调。
{% endnote %}
```

常见颜色/类型名：`default`、`primary`、`info`、`success`、`warning`、`danger` 等（以主题样式为准）。  
也可加样式后缀，如 `flat` / `modern` / `simple`（主题默认 note 风格与配置相关）。

### 4.2 折叠 / 隐藏

行内点击显示：

```markdown
答案是 {% hideInline 42,点击查看 %} 。
```

块级点击展开：

```markdown
{% hideBlock 点击展开详解 %}
这里可以写多段 Markdown、代码块。
{% endhideBlock %}
```

`<details>` 风格折叠：

```markdown
{% hideToggle 深入：拷贝构造细节 %}
长文补充……
{% endhideToggle %}
```

### 4.3 标签高亮 `label`

```markdown
{% label 重点 primary %}
{% label 易错 danger %}
{% label 可选 default %}
```

### 4.4 按钮 `btn`

```markdown
{% btn /2026/07/25/某篇文章/, 阅读上一篇, fa fa-book, blue %}
```

参数：`url, 文字, 图标类名, 选项`。选项可含颜色与 `outline` / `center` / `block` / `larger` 等。

### 4.5 选项卡 `tabs`

```markdown
{% tabs 示例 %}
<!-- tab C++ -->
```cpp
int main() {}
```
<!-- endtab -->
<!-- tab C -->
```c
int main(void) { return 0; }
```
<!-- endtab -->
{% endtabs %}
```

第二个参数可指定默认激活第几个页签，如 `{% tabs 示例, 2 %}`。

### 4.6 时间线 `timeline`

```markdown
{% timeline 学习路线, blue %}
<!-- timeline 第一步 -->
先搞清类与对象。
<!-- endtimeline -->
<!-- timeline 第二步 -->
再看指针成员与拷贝。
<!-- endtimeline -->
{% endtimeline %}
```

### 4.7 图库 `gallery`

正文多图拼贴（也可继续用普通 `![]()`）：

```markdown
{% gallery %}
![图1](/img/posts/a.webp)
![图2](/img/posts/b.webp)
{% endgallery %}
```

### 4.8 系列文列表 `series`

若 Front Matter 写了 `series: 某系列名`，正文可插入：

```markdown
{% series %}
```

本站主题已 `series.enable: true`。系列名需各文一致。

### 4.9 其它（按需）

| 标签 | 用途 | 备注 |
|------|------|------|
| `{% inlineImg /img/xxx.webp, 1.2em %}` | 行内小图 | 第二参为高度 |
| `{% mermaid %}` … `{% endmermaid %}` | 流程图 | 需主题加载 Mermaid；当前站点未重点配置 |
| `{% chartjs %}` | 图表 | 同上，非日常写作必需 |
| `{% flink %}` | 友链卡片 | 一般用于友情链接页 |
| `{% score %}` | 评分 | 少用 |

---

## 5. CMS 工具栏对照

| 按钮 | 插入内容 | 说明 |
|------|----------|------|
| B | `**…**` | 加粗 |
| I | `*…*` | 斜体 |
| X² | `<sup>…</sup>` | 上标 |
| X₂ | `<sub>…</sub>` | 下标 |
| H2 | 行首 `## ` | 二级标题 |
| 引用 | 行首 `> ` | 引用 |
| `</>` | 围栏代码块 | 记得改语言标识，如 `cpp` |
| 链接 | `[文字](url)` | 可搜本站文章 |
| 图片 | `![alt](url)` | 可上传到 `/img/posts/` |
| AI 生成（摘要） | 写 Front Matter `description` | 不是正文语法 |

快捷键（编辑器内）：Ctrl+B 加粗、Ctrl+I 斜体、Ctrl+K 链接。

---

## 6. 推荐排版模板（学习笔记）

````markdown
在上一篇 [xxx](/年/月/日/slug/) 中……

本篇聚焦……

## 概念

……

## 示例

```cpp
// …
```

{% note info %}
记住：**……**
{% endnote %}

## 对比

| 情况 A | 情况 B |
| --- | --- |
| … | … |

## 小结

- 要点一
- 要点二

下一篇预告……
````

---

## 7. 自检清单

1. 代码块是否写了语言（`cpp` 等）？
2. 站内链接是否为 `/年/月/日/slug/`，且 slug 与文件名一致？
3. 图片是否已在 `source/img/…` 且路径以 `/img/` 开头？
4. 用了 `{% … %}` 时，是否用 `hexo server` 看过正式效果？
5. 摘要、分类、标签、封面是否在属性栏填好（勿堆在正文）？

---

## 8. 参考

- 站点渲染：Hexo 8 + `hexo-renderer-marked`（GFM，`breaks` / `smartypants` 开启）
- 主题：Butterfly 5.x 标签插件
- 本机写作：`npm run admin` → 博客内「管」
- 配置入口：[`_config.yml`](../_config.yml)、[`_config.butterfly.yml`](../_config.butterfly.yml)
