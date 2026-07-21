(() => {
  'use strict';

  const state = {
    data: null,
    dataPromise: null,
    lastFocus: null,
    trackIndex: 0
  };

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const loadSiteData = () => {
    if (state.data) return Promise.resolve(state.data);
    if (!state.dataPromise) {
      state.dataPromise = fetch('/site-index.json')
        .then((response) => {
          if (!response.ok) throw new Error(`site-index.json: ${response.status}`);
          return response.json();
        })
        .then((data) => {
          state.data = data;
          return data;
        })
        .catch((error) => {
          console.error('[Sujing]', error);
          return { posts: [], categories: [], tags: [], music: { tracks: [] }, notes: [], gallery: { albums: [] } };
        });
    }
    return state.dataPromise;
  };

  const toast = (message) => {
    let element = document.getElementById('sujing-toast');
    if (!element) {
      element = document.createElement('div');
      element.id = 'sujing-toast';
      element.setAttribute('role', 'status');
      element.setAttribute('aria-live', 'polite');
      document.body.appendChild(element);
    }
    element.textContent = message;
    element.classList.add('show');
    clearTimeout(element.hideTimer);
    element.hideTimer = setTimeout(() => element.classList.remove('show'), 1800);
  };

  const randomPost = async () => {
    const data = await loadSiteData();
    const currentPath = window.location.pathname.replace(/index\.html$/, '');
    const candidates = data.posts.filter((post) => post.path !== currentPath);
    const pool = candidates.length ? candidates : data.posts;
    if (!pool.length) return toast('暂时没有可随机访问的文章');
    window.location.href = pool[Math.floor(Math.random() * pool.length)].path;
  };

  const createNavAction = (id, icon, label, handler) => {
    const item = document.createElement('div');
    item.id = id;
    item.className = 'sujing-nav-action';
    item.innerHTML = `<button class="site-page" type="button" title="${label}" aria-label="${label}"><i class="fas ${icon} fa-fw" aria-hidden="true"></i></button>`;
    item.querySelector('button').addEventListener('click', handler);
    return item;
  };

  const closeConsole = () => {
    const element = document.getElementById('sujing-console');
    if (!element?.classList.contains('show')) return;
    element.classList.remove('show');
    element.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('sujing-console-open');
    state.lastFocus?.focus?.();
  };

  const openSearch = () => {
    closeConsole();
    window.setTimeout(() => document.getElementById('search-button')?.click(), 80);
  };

  const renderConsoleLinks = (container, items) => {
    container.innerHTML = items.length
      ? items.slice(0, 16).map((item) => `<a href="${item.path}"><span>${escapeHtml(item.name)}</span><small>${item.count}</small></a>`).join('')
      : '<span class="sujing-console-empty">内容整理中</span>';
  };

  const ensureConsole = () => {
    let element = document.getElementById('sujing-console');
    if (element) return element;
    element = document.createElement('div');
    element.id = 'sujing-console';
    element.setAttribute('aria-hidden', 'true');
    element.innerHTML = `
      <div class="sujing-console-mask" data-sujing-console-close></div>
      <section class="sujing-console-panel" role="dialog" aria-modal="true" aria-labelledby="sujing-console-title">
        <header class="sujing-console-header">
          <div><span class="sujing-console-kicker">QUICK ACCESS</span><h2 id="sujing-console-title">溯境中控台</h2></div>
          <button class="sujing-icon-command" type="button" data-sujing-console-close title="关闭" aria-label="关闭中控台"><i class="fas fa-xmark" aria-hidden="true"></i></button>
        </header>
        <div class="sujing-console-actions">
          <button type="button" data-console-action="search"><i class="fas fa-magnifying-glass" aria-hidden="true"></i><span>搜索</span></button>
          <a href="/articles/"><i class="fas fa-book-open" aria-hidden="true"></i><span>文章</span></a>
          <button type="button" data-console-action="random"><i class="fas fa-dice" aria-hidden="true"></i><span>随机</span></button>
          <button type="button" data-console-action="music"><i class="fas fa-music" aria-hidden="true"></i><span>音乐</span></button>
          <button type="button" data-console-action="theme"><i class="fas fa-circle-half-stroke" aria-hidden="true"></i><span>明暗</span></button>
        </div>
        <div class="sujing-console-grid">
          <section><h3>分类</h3><div class="sujing-console-links" data-console-categories><span class="sujing-console-empty">正在读取</span></div></section>
          <section><h3>标签</h3><div class="sujing-console-links" data-console-tags><span class="sujing-console-empty">正在读取</span></div></section>
        </div>
      </section>`;
    document.body.appendChild(element);
    element.querySelectorAll('[data-sujing-console-close]').forEach((item) => item.addEventListener('click', closeConsole));
    element.querySelector('[data-console-action="search"]').addEventListener('click', openSearch);
    element.querySelector('[data-console-action="random"]').addEventListener('click', randomPost);
    element.querySelector('[data-console-action="music"]').addEventListener('click', () => {
      closeConsole();
      toggleMusicPanel();
    });
    element.querySelector('[data-console-action="theme"]').addEventListener('click', () => {
      document.getElementById('darkmode')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    return element;
  };

  const openConsole = async (trigger) => {
    const element = ensureConsole();
    state.lastFocus = trigger || document.activeElement;
    element.classList.add('show');
    element.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('sujing-console-open');
    element.querySelector('[data-sujing-console-close]')?.focus();
    const data = await loadSiteData();
    renderConsoleLinks(element.querySelector('[data-console-categories]'), data.categories);
    renderConsoleLinks(element.querySelector('[data-console-tags]'), data.tags);
  };

  const installNavActions = () => {
    const menus = document.getElementById('menus');
    if (!menus || document.getElementById('sujing-console-button')) return;
    const searchButton = document.getElementById('search-button');
    const random = createNavAction('sujing-random-button', 'fa-dice', '随机阅读', randomPost);
    const consoleAction = createNavAction('sujing-console-button', 'fa-sliders', '中控台', (event) => openConsole(event.currentTarget));
    menus.insertBefore(consoleAction, searchButton || menus.firstChild);
    menus.insertBefore(random, consoleAction);
  };

  const ensureMusicPlayer = async () => {
    let player = document.getElementById('sujing-music');
    if (player) return player;
    const data = await loadSiteData();
    const tracks = Array.isArray(data.music?.tracks) ? data.music.tracks : [];
    player = document.createElement('aside');
    player.id = 'sujing-music';
    player.innerHTML = `
      <button class="sujing-music-toggle" type="button" title="音乐" aria-label="打开音乐播放器"><i class="fas fa-music" aria-hidden="true"></i></button>
      <section class="sujing-music-panel" aria-label="音乐播放器">
        <img class="sujing-music-cover" alt="" src="/img/sujing-mark.svg">
        <div class="sujing-music-info"><strong>${escapeHtml(data.music?.title || '溯境歌单')}</strong><span>${tracks.length ? '准备播放' : '歌单待添加'}</span></div>
        <div class="sujing-music-controls">
          <button type="button" data-music="prev" title="上一首" aria-label="上一首"><i class="fas fa-backward-step" aria-hidden="true"></i></button>
          <button type="button" data-music="play" title="播放" aria-label="播放"><i class="fas fa-play" aria-hidden="true"></i></button>
          <button type="button" data-music="next" title="下一首" aria-label="下一首"><i class="fas fa-forward-step" aria-hidden="true"></i></button>
        </div>
        <input class="sujing-music-progress" type="range" min="0" max="100" value="0" aria-label="播放进度">
        <audio preload="metadata"></audio>
      </section>`;
    document.body.appendChild(player);
    const audio = player.querySelector('audio');
    const playButton = player.querySelector('[data-music="play"]');
    const progress = player.querySelector('.sujing-music-progress');

    const setTrack = (index) => {
      if (!tracks.length) return;
      state.trackIndex = (index + tracks.length) % tracks.length;
      const track = tracks[state.trackIndex];
      audio.src = track.url;
      player.querySelector('.sujing-music-info strong').textContent = track.title || '未命名曲目';
      player.querySelector('.sujing-music-info span').textContent = track.artist || '未知作者';
      player.querySelector('.sujing-music-cover').src = track.cover || '/img/sujing-mark.svg';
      progress.value = 0;
    };
    const togglePlayback = async () => {
      if (!tracks.length) return toast('在 source/_data/music.yml 中添加歌单后即可播放');
      if (!audio.src) setTrack(state.trackIndex);
      if (audio.paused) await audio.play(); else audio.pause();
    };
    player.querySelector('.sujing-music-toggle').addEventListener('click', () => player.classList.toggle('show'));
    playButton.addEventListener('click', togglePlayback);
    player.querySelector('[data-music="prev"]').addEventListener('click', () => { setTrack(state.trackIndex - 1); audio.play(); });
    player.querySelector('[data-music="next"]').addEventListener('click', () => { setTrack(state.trackIndex + 1); audio.play(); });
    audio.addEventListener('play', () => playButton.innerHTML = '<i class="fas fa-pause" aria-hidden="true"></i>');
    audio.addEventListener('pause', () => playButton.innerHTML = '<i class="fas fa-play" aria-hidden="true"></i>');
    audio.addEventListener('ended', () => { setTrack(state.trackIndex + 1); audio.play(); });
    audio.addEventListener('timeupdate', () => {
      progress.value = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    });
    progress.addEventListener('input', () => {
      if (audio.duration) audio.currentTime = (Number(progress.value) / 100) * audio.duration;
    });
    player.sujingSelectTrack = async (index) => {
      if (!tracks.length) return toast('歌单正在整理');
      setTrack(index);
      player.classList.add('show');
      await audio.play();
    };
    if (tracks.length) setTrack(0);
    return player;
  };

  const toggleMusicPanel = async () => {
    const player = await ensureMusicPlayer();
    player.classList.toggle('show');
  };

  const installCategoryBar = async () => {
    if (!/^\/articles\/?$/.test(window.location.pathname)) return;
    const recentPosts = document.getElementById('recent-posts');
    if (!recentPosts || recentPosts.querySelector('.sujing-category-bar')) return;
    const data = await loadSiteData();
    const bar = document.createElement('nav');
    bar.className = 'sujing-category-bar';
    bar.setAttribute('aria-label', '文章分类');
    bar.innerHTML = `<a class="active" href="/articles/">全部</a>${data.categories.map((item) => `<a href="${item.path}">${escapeHtml(item.name)}<small>${item.count}</small></a>`).join('')}<a href="/categories/">更多<i class="fas fa-arrow-right" aria-hidden="true"></i></a>`;
    recentPosts.insertBefore(bar, recentPosts.firstChild);
  };

  const installAuthorSkills = () => {
    const card = document.querySelector('.card-widget.card-info');
    if (!card || card.querySelector('.sujing-author-skills')) return;
    const skills = document.createElement('div');
    skills.className = 'sujing-author-skills';
    skills.innerHTML = ['Unity', 'C#', 'C++', 'Lua'].map((item) => `<span>${item}</span>`).join('');
    const description = card.querySelector('.author-info-description');
    (description || card).insertAdjacentElement('afterend', skills);
  };

  const installPostTools = async () => {
    const copyright = document.querySelector('.post-copyright');
    if (!copyright || document.querySelector('.sujing-post-tools')) return;
    const data = await loadSiteData();
    const path = window.location.pathname.replace(/index\.html$/, '');
    const post = data.posts.find((item) => item.path === path);
    const tools = document.createElement('div');
    tools.className = 'sujing-post-tools';
    tools.innerHTML = `
      <button type="button" data-post-tool="copy" title="复制链接"><i class="fas fa-link" aria-hidden="true"></i><span>复制链接</span></button>
      <button type="button" data-post-tool="share" title="分享文章"><i class="fas fa-share-nodes" aria-hidden="true"></i><span>分享</span></button>
      ${post?.source ? `<a href="https://github.com/TracingLight/SuJing/edit/main/source/${post.source}" target="_blank" rel="noopener noreferrer" title="在 GitHub 编辑"><i class="fab fa-github" aria-hidden="true"></i><span>编辑</span></a>` : ''}
      <button type="button" data-post-tool="random" title="随机阅读"><i class="fas fa-dice" aria-hidden="true"></i><span>随机阅读</span></button>`;
    copyright.insertAdjacentElement('beforebegin', tools);
    tools.querySelector('[data-post-tool="copy"]').addEventListener('click', async () => {
      await navigator.clipboard.writeText(window.location.href);
      toast('文章链接已复制');
    });
    tools.querySelector('[data-post-tool="share"]').addEventListener('click', async () => {
      if (navigator.share) await navigator.share({ title: document.title, url: window.location.href });
      else {
        await navigator.clipboard.writeText(window.location.href);
        toast('当前浏览器不支持分享，链接已复制');
      }
    });
    tools.querySelector('[data-post-tool="random"]').addEventListener('click', randomPost);
  };

  const installHomeNote = async () => {
    const note = document.querySelector('.sujing-signal-copy p span');
    if (!note) return;
    const data = await loadSiteData();
    const latest = data.notes?.[0];
    if (latest?.content) note.textContent = latest.content;
  };

  const installNotesPage = async () => {
    const container = document.querySelector('[data-sujing-notes]');
    if (!container || container.dataset.ready) return;
    container.dataset.ready = 'true';
    const data = await loadSiteData();
    container.innerHTML = data.notes?.length
      ? `<div class="sujing-note-list">${data.notes.map((note) => `
          <article class="sujing-note-item">
            <time datetime="${escapeHtml(note.date)}">${escapeHtml(note.date)}</time>
            <p>${escapeHtml(note.content)}</p>
          </article>`).join('')}</div>`
      : '<div class="sujing-data-empty"><i class="fas fa-bolt" aria-hidden="true"></i><h2>短讯正在整理</h2></div>';
  };

  const installGalleryPage = async () => {
    const container = document.querySelector('[data-sujing-gallery]');
    if (!container || container.dataset.ready) return;
    container.dataset.ready = 'true';
    const data = await loadSiteData();
    const albums = data.gallery?.albums || [];
    container.innerHTML = albums.length
      ? albums.map((album) => `
          <section class="sujing-album">
            <header><p class="sujing-kicker">ALBUM</p><h2>${escapeHtml(album.title)}</h2><p>${escapeHtml(album.description || '')}</p></header>
            <div class="sujing-gallery-grid">${(album.images || []).map((image) => `<a href="${image.src}" data-fancybox="sujing-gallery"><img src="${image.src}" alt="${escapeHtml(image.alt || album.title)}" loading="lazy"></a>`).join('')}</div>
          </section>`).join('')
      : '<div class="sujing-data-empty"><i class="fas fa-images" aria-hidden="true"></i><h2>相册正在整理</h2></div>';
  };

  const installMusicPage = async () => {
    const container = document.querySelector('[data-sujing-music-page]');
    if (!container || container.dataset.ready) return;
    container.dataset.ready = 'true';
    const data = await loadSiteData();
    const tracks = data.music?.tracks || [];
    if (!tracks.length) {
      container.innerHTML = '<div class="sujing-data-empty"><i class="fas fa-music" aria-hidden="true"></i><h2>歌单正在整理</h2><p>播放器已经就绪，曲目将在素材确定后加入。</p></div>';
      return;
    }
    container.innerHTML = `<div class="sujing-track-list">${tracks.map((track, index) => `
      <button type="button" data-track-index="${index}">
        <img src="${track.cover || '/img/sujing-mark.svg'}" alt="" loading="lazy">
        <span><strong>${escapeHtml(track.title || '未命名曲目')}</strong><small>${escapeHtml(track.artist || '未知作者')}</small></span>
        <i class="fas fa-play" aria-hidden="true"></i>
      </button>`).join('')}</div>`;
    container.querySelectorAll('[data-track-index]').forEach((button) => {
      button.addEventListener('click', async () => {
        const player = await ensureMusicPlayer();
        player.sujingSelectTrack(Number(button.dataset.trackIndex));
      });
    });
  };

  const installBindings = () => {
    if (document.documentElement.dataset.sujingBindings) return;
    document.documentElement.dataset.sujingBindings = 'true';
    document.addEventListener('click', (event) => {
      if (event.target.closest('[data-sujing-random]')) randomPost();
    });
    document.addEventListener('keydown', (event) => {
      const target = event.target;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
      if (event.key === 'Escape') closeConsole();
      if (!typing && event.key === '/') {
        event.preventDefault();
        openSearch();
      }
      if (!typing && event.altKey && event.key.toLowerCase() === 'r') {
        event.preventDefault();
        randomPost();
      }
    });
  };

  const init = () => {
    installBindings();
    installNavActions();
    installCategoryBar();
    installAuthorSkills();
    installPostTools();
    installHomeNote();
    installNotesPage();
    installGalleryPage();
    installMusicPage();
    ensureMusicPlayer();
  };

  document.addEventListener('DOMContentLoaded', init);
  document.addEventListener('pjax:complete', init);
})();
