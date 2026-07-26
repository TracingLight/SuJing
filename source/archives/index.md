---
title: 归档
date: 2026-07-21 12:00:00
type: sujing-archive
aside: false
comments: false
top_img: false
description: 溯境文章卷宗。时间轴与矩阵两种阅览，支持分类、标签与检索。
---

<div class="sujing-archive" data-sujing-archive aria-busy="true">
  <header class="sujing-archive-hero" data-sujing-reveal>
    <div class="sujing-archive-hero-copy">
      <p class="sujing-kicker">卷宗</p>
      <h1>文章归档</h1>
      <p>以时间为经，以主题为纬。可在时间轴与矩阵间切换，并用分类、标签与关键词检阅全文。</p>
    </div>
    <aside class="sujing-archive-hero-meta" aria-label="文章总数">
      <span>篇目</span>
      <strong data-sujing-archive-total>—</strong>
    </aside>
  </header>

  <section class="sujing-archive-toolbar" data-sujing-reveal aria-label="归档筛选">
    <label class="sujing-archive-search">
      <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
      <input type="search" name="q" data-sujing-archive-q placeholder="检索标题、摘要、分类或标签" autocomplete="off" spellcheck="false">
      <button type="button" data-sujing-archive-clear hidden aria-label="清除检索">清除</button>
    </label>
    <div class="sujing-archive-view" role="group" aria-label="显示形态">
      <button type="button" data-sujing-archive-view="timeline" aria-pressed="true"><i class="fas fa-timeline" aria-hidden="true"></i><span>时间轴</span></button>
      <button type="button" data-sujing-archive-view="matrix" aria-pressed="false"><i class="fas fa-border-all" aria-hidden="true"></i><span>矩阵</span></button>
    </div>
  </section>

  <section class="sujing-archive-filters" data-sujing-reveal aria-label="分类与标签">
    <div class="sujing-archive-filter-row">
      <span class="sujing-archive-filter-label">分类</span>
      <div class="sujing-archive-chips" data-sujing-archive-categories></div>
    </div>
    <div class="sujing-archive-filter-row">
      <span class="sujing-archive-filter-label">标签</span>
      <div class="sujing-archive-chips" data-sujing-archive-tags></div>
    </div>
    <p class="sujing-archive-status" data-sujing-archive-status>正在整理卷宗…</p>
  </section>

  <div class="sujing-archive-stage" data-sujing-archive-stage aria-live="polite"></div>
</div>
