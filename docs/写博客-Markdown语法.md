# 溯境博客 Markdown 语法大全

面向在本仓库写文章时使用。正式渲染栈是：

**Hexo `hexo-renderer-marked`（GFM）+ 主题 Butterfly 标签插件**

用了 `{% note %}`、表格、任务列表等扩展时，请以本地 `hexo server` 或部署后页面为准。

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

分类、标签、摘要、封面、文件名 slug 等写在 Front Matter（文件顶部 YAML）里，一般**不要**塞进正文。

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

目录（TOC）由主题根据标题自动生成。

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

### 2.4 引用

```markdown
> 这是引用。
> 可连续多行。
```

### 2.5 列表

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

任务列表（GFM）：

```markdown
- [ ] 未完成
- [x] 已完成
```

### 2.6 代码块（技术文最常用）

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

### 2.7 链接

外链：

```markdown
[文字](https://example.com)
[文字](https://example.com "可选 title")
```

**站内文章（推荐相对路径）**，permalink 为 `:year/:month/:day/:title/`：

```markdown
[上一篇：类的概念](/2026/07/25/学习笔记-c-面向对象-如何理解c-中类的概念-并用它将数/)
```

自动链接（GFM）：

```markdown
https://sujing.dev
```

### 2.8 图片

```markdown
![说明文字](/img/posts/xxx.webp)
![说明文字](/img/posts/xxx.webp "可选 title")
```

约定：

- 正文插图优先 `/img/posts/…`
- 封面写在 Front Matter 的 `cover: /img/covers/…`
- 主题开启 Fancybox，点击可灯箱放大

### 2.9 表格（GFM）

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

### 2.10 分割线

```markdown
---
***
___
```

单独一行，前后最好空行。注意不要和 Front Matter 的 `---` 搞混（Front Matter 只在文件最顶部）。

### 2.11 转义

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
| Wiki `[[文章名]]` | **不支持**；用标准 Markdown 链接 |
| `$公式$` / KaTeX | **当前未配置**数学公式插件 |
| Mermaid 代码围栏 | 主题有 `{% mermaid %}` 标签，但站点未专门配 CDN；需要图示时优先用图片 |

---

## 4. Butterfly 标签插件（Hexo 标签，不是标准 Markdown）

写法形如 `{% 标签名 参数 %}` … `{% end标签名 %}`。  
**在 `hexo generate` / 线上生效。**

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

## 5. 推荐排版模板（学习笔记）

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

## 6. 自检清单

1. 代码块是否写了语言（`cpp` 等）？
2. 站内链接是否为 `/年/月/日/slug/`，且 slug 与文件名一致？
3. 图片是否已在 `source/img/…` 且路径以 `/img/` 开头？
4. 用了 `{% … %}` 时，是否用 `hexo server` 看过正式效果？
5. 摘要、分类、标签、封面是否写在 Front Matter（勿堆在正文）？

---

## 7. 参考

- 站点渲染：Hexo 8 + `hexo-renderer-marked`（GFM，`breaks` / `smartypants` 开启）
- 主题：Butterfly 5.x 标签插件
- 本地预览：`npm run server`
- 配置入口：[`_config.yml`](../_config.yml)、[`_config.butterfly.yml`](../_config.butterfly.yml)
