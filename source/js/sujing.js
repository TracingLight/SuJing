(() => {
  'use strict';

  const state = {
    data: null,
    dataPromise: null,
    lastFocus: null,
    trackIndex: 0,
    revealObserver: null,
    scrollFrame: null,
    starfield: {
      canvas: null,
      context: null,
      particles: [],
      frame: null,
      lastFrame: 0,
      resizeFrame: null,
      motionQuery: null,
      pointerQuery: null,
      themeObserver: null,
      pointer: {
        x: -9999,
        y: -9999,
        active: false
      },
      bound: false
    }
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
    element.hideTimer = window.setTimeout(() => element.classList.remove('show'), 1800);
  };

  const formatDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date).replaceAll('/', '.');
  };

  const randomPost = async () => {
    const data = await loadSiteData();
    const currentPath = window.location.pathname.replace(/index\.html$/, '');
    const candidates = data.posts.filter((post) => post.path !== currentPath);
    const pool = candidates.length ? candidates : data.posts;
    if (!pool.length) {
      toast('暂时没有可随机访问的文章');
      return;
    }
    window.location.href = pool[Math.floor(Math.random() * pool.length)].path;
  };

  const getFocusable = (container) => Array.from(container.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter((element) => element.offsetParent !== null);

  const closeCommand = (restoreFocus = true) => {
    const element = document.getElementById('sujing-command');
    if (!element?.classList.contains('show')) return;
    element.classList.remove('show');
    element.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('sujing-command-open');
    if (restoreFocus) state.lastFocus?.focus?.();
  };

  const renderCommandLinks = (container, items) => {
    container.innerHTML = items.length
      ? items.slice(0, 12).map((item) => (
          `<a href="${escapeHtml(item.path)}"><span>${escapeHtml(item.name)}</span><small>${Number(item.count) || 0}</small></a>`
        )).join('')
      : '<span class="sujing-command-empty">内容整理中</span>';
  };

  const ensureCommand = () => {
    let element = document.getElementById('sujing-command');
    if (element) return element;

    element = document.createElement('div');
    element.id = 'sujing-command';
    element.setAttribute('aria-hidden', 'true');
    element.innerHTML = `
      <div class="sujing-command-mask" data-sujing-command-close></div>
      <section class="sujing-command-panel" role="dialog" aria-modal="true" aria-labelledby="sujing-command-title">
        <header class="sujing-command-header">
          <div><span>QUICK NAVIGATION / 01</span><h2 id="sujing-command-title">探索溯境</h2></div>
          <button class="sujing-icon-button" type="button" data-sujing-command-close title="关闭" aria-label="关闭快捷导航"><i class="fas fa-xmark" aria-hidden="true"></i></button>
        </header>
        <div class="sujing-command-actions">
          <button type="button" data-command-action="search"><i class="fas fa-magnifying-glass" aria-hidden="true"></i><span>搜索</span><small>/</small></button>
          <button type="button" data-command-action="random"><i class="fas fa-dice" aria-hidden="true"></i><span>随机阅读</span><small>ALT R</small></button>
          <button type="button" data-command-action="theme"><i class="fas fa-circle-half-stroke" aria-hidden="true"></i><span>切换明暗</span><small>MODE</small></button>
        </div>
        <nav class="sujing-command-routes" aria-label="主要页面">
          <a href="/articles/"><span>文章库</span><i class="fas fa-arrow-right" aria-hidden="true"></i></a>
          <a href="/archives/"><span>归档</span><i class="fas fa-arrow-right" aria-hidden="true"></i></a>
          <a href="/notes/"><span>短讯</span><i class="fas fa-arrow-right" aria-hidden="true"></i></a>
          <a href="/gallery/"><span>相册</span><i class="fas fa-arrow-right" aria-hidden="true"></i></a>
          <a href="/categories/"><span>主题</span><i class="fas fa-arrow-right" aria-hidden="true"></i></a>
          <a href="/about/"><span>关于</span><i class="fas fa-arrow-right" aria-hidden="true"></i></a>
        </nav>
        <div class="sujing-command-taxonomy">
          <section><h3>分类</h3><div data-command-categories><span class="sujing-command-empty">正在读取</span></div></section>
          <section><h3>标签</h3><div data-command-tags><span class="sujing-command-empty">正在读取</span></div></section>
        </div>
      </section>`;
    document.body.appendChild(element);
    return element;
  };

  const openCommand = async (trigger) => {
    const element = ensureCommand();
    state.lastFocus = trigger || document.activeElement;
    element.classList.add('show');
    element.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('sujing-command-open');
    element.querySelector('[data-command-action="search"]')?.focus();

    const data = await loadSiteData();
    renderCommandLinks(element.querySelector('[data-command-categories]'), data.categories || []);
    renderCommandLinks(element.querySelector('[data-command-tags]'), data.tags || []);
  };

  const openSearch = () => {
    closeCommand(false);
    window.setTimeout(() => document.querySelector('#search-button .search')?.click(), 60);
  };

  const toggleTheme = () => {
    const nativeButton = document.getElementById('darkmode');
    if (nativeButton) {
      nativeButton.click();
      return;
    }
    const willUseDark = document.documentElement.getAttribute('data-theme') !== 'dark';
    if (window.btf) {
      willUseDark ? window.btf.activateDarkMode() : window.btf.activateLightMode();
      window.btf.saveToLocal?.set('theme', willUseDark ? 'dark' : 'light', 2);
    } else {
      document.documentElement.setAttribute('data-theme', willUseDark ? 'dark' : 'light');
    }
  };

  const installNavCommand = () => {
    const menus = document.getElementById('menus');
    if (!menus || document.getElementById('sujing-command-button')) return;

    document.getElementById('search-button')?.classList.add('sujing-native-search');
    const item = document.createElement('div');
    item.id = 'sujing-command-button';
    item.className = 'sujing-nav-action';
    item.innerHTML = '<button class="site-page" type="button" title="快捷导航" aria-label="打开快捷导航"><i class="fas fa-compass" aria-hidden="true"></i></button>';
    const toggleMenu = document.getElementById('toggle-menu');
    menus.insertBefore(item, toggleMenu || null);
    item.querySelector('button').addEventListener('click', (event) => openCommand(event.currentTarget));
  };

  const normalizePath = (value) => {
    const path = String(value || '/').replace(/index\.html$/, '').replace(/\/+$/, '');
    return path || '/';
  };

  const installCurrentNavigation = () => {
    const current = normalizePath(window.location.pathname);
    const links = Array.from(document.querySelectorAll('#nav .menus_items a[href]'));
    document.querySelectorAll('#nav .site-page.is-current').forEach((link) => {
      link.classList.remove('is-current');
      link.removeAttribute('aria-current');
    });

    links.forEach((link) => {
      const url = new URL(link.href, window.location.origin);
      if (url.origin !== window.location.origin) return;
      const target = normalizePath(url.pathname);
      const postSection = document.querySelector('#body-wrap.post') && target === '/articles';
      const matches = current === target || (target !== '/' && current.startsWith(`${target}/`)) || postSection;
      if (!matches) return;
      link.classList.add('is-current');
      link.setAttribute('aria-current', 'page');
      link.closest('.menus_item_child')
        ?.closest('.menus_item')
        ?.querySelector(':scope > .site-page')
        ?.classList.add('is-current');
    });
  };

  const isDesktopNav = () => window.matchMedia('(min-width: 769px)').matches;

  const setNavDropdownOpen = (item, open) => {
    const trigger = item?.querySelector(':scope > .site-page');
    if (!trigger) return;
    item.classList.toggle('is-open', open);
    trigger.setAttribute('aria-expanded', String(open));
  };

  const closeNavDropdowns = (except = null, restoreFocus = false) => {
    let focusTarget = null;
    let focusItem = null;
    document.querySelectorAll('#nav .menus_item.is-open').forEach((item) => {
      if (item === except) return;
      if (!focusTarget) {
        focusTarget = item.querySelector(':scope > .site-page');
        focusItem = item;
      }
      setNavDropdownOpen(item, false);
    });
    if (restoreFocus && focusTarget) {
      focusTarget.focus();
      setNavDropdownOpen(focusItem, false);
    }
  };

  const installNavDropdowns = () => {
    document.querySelectorAll('#nav .menus_item').forEach((item, index) => {
      const submenu = item.querySelector(':scope > .menus_item_child');
      const trigger = item.querySelector(':scope > .site-page');
      if (!submenu || !trigger) return;

      submenu.id ||= `sujing-submenu-${index + 1}`;
      if (!trigger.matches('a[href], button, [tabindex]')) trigger.tabIndex = 0;
      if (trigger.tagName !== 'A' && trigger.tagName !== 'BUTTON') trigger.setAttribute('role', 'button');
      trigger.setAttribute('aria-haspopup', 'true');
      trigger.setAttribute('aria-controls', submenu.id);
      trigger.setAttribute('aria-expanded', item.classList.contains('is-open') ? 'true' : 'false');
      if (item.dataset.sujingDropdownReady) return;
      item.dataset.sujingDropdownReady = 'true';

      const toggle = () => {
        if (!isDesktopNav()) return;
        const willOpen = !item.classList.contains('is-open');
        closeNavDropdowns(item);
        setNavDropdownOpen(item, willOpen);
      };

      trigger.addEventListener('click', (event) => {
        if (!isDesktopNav()) return;
        event.preventDefault();
        toggle();
      });
      trigger.addEventListener('keydown', (event) => {
        if (!isDesktopNav()) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggle();
        } else if (event.key === 'ArrowDown') {
          event.preventDefault();
          closeNavDropdowns(item);
          setNavDropdownOpen(item, true);
          submenu.querySelector('a[href]')?.focus();
        }
      });
      item.addEventListener('mouseenter', () => {
        if (!isDesktopNav()) return;
        closeNavDropdowns(item);
        setNavDropdownOpen(item, true);
      });
      item.addEventListener('mouseleave', () => {
        if (isDesktopNav() && !item.contains(document.activeElement)) setNavDropdownOpen(item, false);
      });
      item.addEventListener('focusin', (event) => {
        if (!isDesktopNav() || !submenu.contains(event.target)) return;
        closeNavDropdowns(item);
        setNavDropdownOpen(item, true);
      });
      item.addEventListener('focusout', () => {
        window.setTimeout(() => {
          if (isDesktopNav() && !item.contains(document.activeElement)) setNavDropdownOpen(item, false);
        }, 0);
      });
    });
  };

  const starfieldPalette = () => document.documentElement.getAttribute('data-theme') === 'dark'
    ? [
        { color: '237, 244, 243', opacity: 0.8 },
        { color: '82, 184, 181', opacity: 0.76 },
        { color: '215, 90, 74', opacity: 0.6 }
      ]
    : [
        { color: '23, 126, 137', opacity: 0.6 },
        { color: '23, 36, 43', opacity: 0.4 },
        { color: '215, 90, 74', opacity: 0.46 }
      ];

  const createStarfieldParticles = () => {
    const area = window.innerWidth * window.innerHeight;
    const mobile = window.innerWidth <= 640;
    const count = mobile
      ? Math.min(48, Math.max(32, Math.round(area / 11500)))
      : Math.min(120, Math.max(84, Math.round(area / 13000)));
    const contentWidth = Math.min(1180, Math.max(0, window.innerWidth - 32));
    const gutterWidth = Math.max(0, (window.innerWidth - contentWidth) / 2);
    const randomX = () => {
      if (mobile || gutterWidth < 72 || Math.random() >= 0.78) {
        return Math.random() * window.innerWidth;
      }
      const padding = Math.min(18, gutterWidth * 0.15);
      const gutterX = padding + Math.random() * Math.max(1, gutterWidth - padding * 2);
      return Math.random() < 0.5 ? gutterX : window.innerWidth - gutterX;
    };
    state.starfield.particles = Array.from({ length: count }, () => ({
      x: randomX(),
      y: Math.random() * window.innerHeight,
      size: 1.1 + Math.random() * 1.65,
      vx: -0.14 + Math.random() * 0.3,
      vy: 0.2 + Math.random() * 0.3,
      opacity: 0.72 + Math.random() * 0.28,
      color: Math.floor(Math.random() * 3),
      streak: Math.random() < 0.23,
      spark: Math.random() < 0.38,
      length: 12 + Math.random() * 18,
      phase: Math.random() * Math.PI * 2,
      twinkle: 0.018 + Math.random() * 0.022
    }));
  };

  const drawStarfield = (move = false) => {
    const { canvas, context, particles } = state.starfield;
    if (!canvas || !context) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const palette = starfieldPalette();
    const reduced = Boolean(state.starfield.motionQuery?.matches);
    const pointer = state.starfield.pointer;
    context.clearRect(0, 0, width, height);

    const renderPoints = particles.map((particle) => {
      if (!pointer.active || reduced) return { x: particle.x, y: particle.y, boost: 0 };
      const dx = particle.x - pointer.x;
      const dy = particle.y - pointer.y;
      const distance = Math.hypot(dx, dy);
      if (!distance || distance >= 160) return { x: particle.x, y: particle.y, boost: 0 };
      const boost = 1 - distance / 160;
      const offset = boost * 4;
      return {
        x: particle.x + (dx / distance) * offset,
        y: particle.y + (dy / distance) * offset,
        boost
      };
    });

    if (!reduced) {
      const maximumDistance = width <= 640 ? 76 : 96;
      const maximumLinks = width <= 640 ? 6 : 18;
      let links = 0;
      context.lineWidth = 0.7;
      for (let first = 0; first < renderPoints.length && links < maximumLinks; first += 1) {
        for (let second = first + 1; second < renderPoints.length && links < maximumLinks; second += 1) {
          if ((first * 17 + second * 31) % 7 !== 0) continue;
          const a = renderPoints[first];
          const b = renderPoints[second];
          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          if (distance > maximumDistance) continue;
          const alpha = (1 - distance / maximumDistance) * (document.documentElement.getAttribute('data-theme') === 'dark' ? 0.2 : 0.13);
          context.strokeStyle = `rgba(82, 184, 181, ${alpha})`;
          context.beginPath();
          context.moveTo(a.x, a.y);
          context.lineTo(b.x, b.y);
          context.stroke();
          links += 1;
        }
      }
    }

    particles.forEach((particle, index) => {
      const point = renderPoints[index];
      const swatch = palette[particle.color % palette.length];
      const twinkle = 0.76 + Math.sin(particle.phase) * 0.24;
      const alpha = Math.min(1, swatch.opacity * particle.opacity * twinkle * (1 + point.boost * 0.45));
      context.fillStyle = `rgba(${swatch.color}, ${alpha})`;
      context.fillRect(point.x, point.y, particle.size, particle.size);
      if (particle.spark) {
        context.fillStyle = `rgba(${swatch.color}, ${alpha * 0.42})`;
        const arm = particle.size * 1.8;
        context.fillRect(point.x - arm, point.y + particle.size * 0.35, arm * 2 + particle.size, Math.max(0.5, particle.size * 0.3));
        context.fillRect(point.x + particle.size * 0.35, point.y - arm, Math.max(0.5, particle.size * 0.3), arm * 2 + particle.size);
      }
      if (particle.streak && !reduced) {
        context.strokeStyle = `rgba(${swatch.color}, ${alpha * 0.72})`;
        context.lineWidth = Math.max(0.65, particle.size * 0.48);
        context.beginPath();
        context.moveTo(point.x, point.y);
        context.lineTo(point.x - particle.length, point.y - particle.length * 0.38);
        context.stroke();
      }
      if (!move) return;
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.phase += particle.twinkle;
      if (particle.y > height + particle.length) particle.y = -particle.length;
      if (particle.x < -particle.length) particle.x = width + particle.length;
      if (particle.x > width + particle.length) particle.x = -particle.length;
    });
  };

  const stopStarfield = () => {
    if (state.starfield.frame !== null) window.cancelAnimationFrame(state.starfield.frame);
    state.starfield.frame = null;
  };

  const runStarfield = () => {
    stopStarfield();
    if (document.hidden || state.starfield.motionQuery?.matches) {
      drawStarfield(false);
      return;
    }
    const tick = (time) => {
      state.starfield.frame = null;
      if (document.hidden || state.starfield.motionQuery?.matches) {
        drawStarfield(false);
        return;
      }
      if (time - state.starfield.lastFrame >= 33) {
        drawStarfield(true);
        state.starfield.lastFrame = time;
      }
      state.starfield.frame = window.requestAnimationFrame(tick);
    };
    state.starfield.frame = window.requestAnimationFrame(tick);
  };

  const resizeStarfield = () => {
    const { canvas, context } = state.starfield;
    if (!canvas || !context) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    createStarfieldParticles();
    drawStarfield(false);
  };

  const installStarfield = () => {
    const background = document.getElementById('web_bg');
    if (!background) return;
    if (state.starfield.canvas && !state.starfield.canvas.isConnected) {
      stopStarfield();
      state.starfield.canvas = null;
      state.starfield.context = null;
    }

    let canvas = document.getElementById('sujing-starfield');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'sujing-starfield';
      canvas.setAttribute('aria-hidden', 'true');
      background.appendChild(canvas);
    }
    state.starfield.canvas = canvas;
    state.starfield.context = canvas.getContext('2d', { willReadFrequently: true });
    state.starfield.motionQuery ||= window.matchMedia('(prefers-reduced-motion: reduce)');
    state.starfield.pointerQuery ||= window.matchMedia('(hover: hover) and (pointer: fine)');
    resizeStarfield();

    if (!state.starfield.bound) {
      state.starfield.bound = true;
      document.addEventListener('visibilitychange', runStarfield);
      window.addEventListener('resize', () => {
        if (state.starfield.resizeFrame !== null) return;
        state.starfield.resizeFrame = window.requestAnimationFrame(() => {
          state.starfield.resizeFrame = null;
          resizeStarfield();
        });
      }, { passive: true });
      state.starfield.motionQuery.addEventListener('change', runStarfield);
      state.starfield.pointerQuery.addEventListener('change', () => {
        state.starfield.pointer.active = false;
        drawStarfield(false);
      });
      window.addEventListener('pointermove', (event) => {
        if (!state.starfield.pointerQuery?.matches || state.starfield.motionQuery?.matches) return;
        state.starfield.pointer.x = event.clientX;
        state.starfield.pointer.y = event.clientY;
        state.starfield.pointer.active = true;
      }, { passive: true });
      window.addEventListener('pointerout', (event) => {
        if (event.relatedTarget) return;
        state.starfield.pointer.active = false;
      }, { passive: true });
      state.starfield.themeObserver = new MutationObserver(() => drawStarfield(false));
      state.starfield.themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme']
      });
    }
    runStarfield();
  };

  const copyText = async (text) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const input = document.createElement('textarea');
    input.value = text;
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    input.remove();
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
      ${navigator.share ? '<button type="button" data-post-tool="share" title="分享文章"><i class="fas fa-share-nodes" aria-hidden="true"></i><span>分享</span></button>' : ''}
      ${post?.source ? `<a href="https://github.com/TracingLight/SuJing/edit/main/source/${escapeHtml(post.source)}" target="_blank" rel="noopener noreferrer" title="在 GitHub 编辑"><i class="fab fa-github" aria-hidden="true"></i><span>编辑</span></a>` : ''}`;
    copyright.insertAdjacentElement('beforebegin', tools);

    tools.querySelector('[data-post-tool="copy"]')?.addEventListener('click', async () => {
      await copyText(window.location.href);
      toast('文章链接已复制');
    });
    tools.querySelector('[data-post-tool="share"]')?.addEventListener('click', () => (
      navigator.share({ title: document.title, url: window.location.href })
    ));
  };

  const installHomeContent = async () => {
    const home = document.querySelector('[data-sujing-home]');
    if (!home) return;

    const data = await loadSiteData();
    const card = home.querySelector('[data-sujing-latest-card]');
    const latest = data.posts?.[0];
    if (card && latest) {
      card.href = latest.path;
      const time = card.querySelector('time');
      const title = card.querySelector('h2');
      const description = card.querySelector('.sujing-bento-card-copy > p');
      const cover = card.querySelector('[data-sujing-latest-cover]');
      if (time) {
        time.dateTime = latest.date || '';
        time.textContent = formatDate(latest.date);
      }
      if (title) title.textContent = latest.title || '最新文章';
      if (description) description.textContent = latest.description || '继续阅读最新记录。';
      if (cover && latest.cover) {
        cover.src = latest.cover;
        cover.alt = `${latest.title || '最新文章'}封面`;
      }
    }

    const latestNote = data.notes?.[0];
    if (latestNote?.content) {
      home.querySelectorAll('[data-sujing-home-note]').forEach((target) => {
        target.textContent = latestNote.content;
      });
      home.querySelectorAll('[data-sujing-home-note-time]').forEach((time) => {
        time.dateTime = latestNote.date || '';
        time.textContent = formatDate(latestNote.date);
      });
    }

    const images = (data.gallery?.albums || []).flatMap((album) => album.images || []);
    const setImage = (image, item) => {
      if (!image || !item?.src) return;
      image.src = item.src;
      image.alt = item.alt || item.title || '溯境图库插画';
      if (Number(item.width)) image.width = Number(item.width);
      if (Number(item.height)) image.height = Number(item.height);
    };
    const heroImage = images.find((image) => image.title === '月夜观星台') || images[0];
    setImage(home.querySelector('[data-sujing-home-hero]'), heroImage);

    const preferred = ['晨光云海学院', '雨夜旧城', '秋日镜湖']
      .map((title) => images.find((image) => image.title === title))
      .filter(Boolean);
    const previews = preferred.length === 3 ? preferred : images.slice(1, 4);
    home.querySelectorAll('[data-sujing-gallery-preview]').forEach((link, index) => {
      const item = previews[index];
      if (!item) return;
      link.href = item.src;
      link.dataset.fancybox = 'sujing-home-gallery';
      link.dataset.caption = item.title || item.alt || '溯境图库';
      link.setAttribute('aria-label', `查看${item.title || '图库图片'}`);
      setImage(link.querySelector('img'), item);
      const label = link.querySelector('span');
      if (label) label.textContent = item.title || '世界切片';
    });
    installFancyboxFallback(home);
  };

  const installArticlesIntro = () => {
    if (!/^\/articles\/?$/.test(window.location.pathname)) return;
    const recentPosts = document.getElementById('recent-posts');
    if (!recentPosts || recentPosts.querySelector('.sujing-list-intro')) return;
    const intro = document.createElement('header');
    intro.className = 'sujing-list-intro';
    intro.setAttribute('data-sujing-reveal', '');
    intro.innerHTML = `
      <div><p class="sujing-kicker">TECHNICAL ARCHIVE</p><h1>文章库</h1></div>
      <p>以游戏开发为主线，记录能够复现的实践、判断过程与阶段性结论。</p>`;
    recentPosts.prepend(intro);
  };

  const installNotesPage = async () => {
    const container = document.querySelector('[data-sujing-notes]');
    if (!container || container.dataset.ready) return;
    container.dataset.ready = 'true';
    const data = await loadSiteData();
    container.setAttribute('aria-busy', 'false');
    container.innerHTML = data.notes?.length
      ? `<div class="sujing-note-list">${data.notes.map((note, index) => `
          <article class="sujing-note-item" data-sujing-reveal>
            <span>${String(index + 1).padStart(2, '0')}</span>
            <time datetime="${escapeHtml(note.date)}">${escapeHtml(formatDate(note.date))}</time>
            <p>${escapeHtml(note.content)}</p>
          </article>`).join('')}</div>`
      : '<div class="sujing-data-empty"><i class="fas fa-bolt" aria-hidden="true"></i><h2>短讯正在整理</h2><p>新的即时记录会先出现在这里。</p></div>';
    installMotion();
  };

  const installGalleryPage = async () => {
    const container = document.querySelector('[data-sujing-gallery]');
    if (!container || container.dataset.ready) return;
    container.dataset.ready = 'true';
    const data = await loadSiteData();
    const albums = data.gallery?.albums || [];
    container.setAttribute('aria-busy', 'false');
    container.innerHTML = albums.length
      ? albums.map((album, albumIndex) => `
          <section class="sujing-album">
            <header data-sujing-reveal><p class="sujing-kicker">ALBUM / ${String(albumIndex + 1).padStart(2, '0')}</p><h2>${escapeHtml(album.title)}</h2><p>${escapeHtml(album.description || '')}</p></header>
            <div class="sujing-gallery-grid">${(album.images || []).map((image) => `
              <figure data-sujing-reveal>
                <a href="${escapeHtml(image.src)}" data-fancybox="sujing-gallery-${albumIndex}" data-caption="${escapeHtml(image.title || image.alt || album.title)}">
                  <img src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt || image.title || album.title)}" width="${Number(image.width) || 1536}" height="${Number(image.height) || 1024}" loading="lazy">
                </a>
                <figcaption><strong>${escapeHtml(image.title || album.title)}</strong>${image.description ? `<span>${escapeHtml(image.description)}</span>` : ''}</figcaption>
              </figure>`).join('')}</div>
          </section>`).join('')
      : '<div class="sujing-data-empty"><i class="fas fa-images" aria-hidden="true"></i><h2>相册正在整理</h2></div>';
    installMotion();
    installFancyboxFallback(container);
  };

  const installFancyboxFallback = (root = document) => {
    if (typeof window.Fancybox !== 'undefined') return;
    root.querySelectorAll('a[data-fancybox]').forEach((link) => {
      if (link.dataset.sujingFancyboxFallback) return;
      link.dataset.sujingFancyboxFallback = 'true';
      link.addEventListener('click', (event) => {
        if (typeof window.Fancybox !== 'undefined') return;
        event.preventDefault();
        window.open(link.href, '_blank', 'noopener,noreferrer');
      });
    });
  };

  const ensureMusicPlayer = async () => {
    let player = document.getElementById('sujing-music');
    if (player) return player;
    const data = await loadSiteData();
    const tracks = Array.isArray(data.music?.tracks) ? data.music.tracks : [];
    if (!tracks.length) return null;

    player = document.createElement('aside');
    player.id = 'sujing-music';
    player.innerHTML = `
      <button class="sujing-music-toggle" type="button" title="音乐" aria-label="打开音乐播放器"><i class="fas fa-music" aria-hidden="true"></i></button>
      <section class="sujing-music-panel" aria-label="音乐播放器">
        <img class="sujing-music-cover" alt="" src="${escapeHtml(tracks[0].cover || '/img/sujing-mark.svg')}">
        <div class="sujing-music-info"><strong></strong><span></span></div>
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
      state.trackIndex = (index + tracks.length) % tracks.length;
      const track = tracks[state.trackIndex];
      audio.src = track.url;
      player.querySelector('.sujing-music-info strong').textContent = track.title || '未命名曲目';
      player.querySelector('.sujing-music-info span').textContent = track.artist || '未知作者';
      player.querySelector('.sujing-music-cover').src = track.cover || '/img/sujing-mark.svg';
      progress.value = 0;
    };
    const safePlay = async () => {
      try {
        await audio.play();
      } catch (error) {
        console.warn('[Sujing] audio play blocked', error);
        toast('浏览器阻止了自动播放，请再点一次播放');
      }
    };
    const play = async () => {
      if (audio.paused) await safePlay();
      else audio.pause();
    };

    setTrack(0);
    player.querySelector('.sujing-music-toggle').addEventListener('click', () => player.classList.toggle('show'));
    playButton.addEventListener('click', play);
    player.querySelector('[data-music="prev"]').addEventListener('click', () => {
      setTrack(state.trackIndex - 1);
      safePlay();
    });
    player.querySelector('[data-music="next"]').addEventListener('click', () => {
      setTrack(state.trackIndex + 1);
      safePlay();
    });
    audio.addEventListener('play', () => { playButton.innerHTML = '<i class="fas fa-pause" aria-hidden="true"></i>'; });
    audio.addEventListener('pause', () => { playButton.innerHTML = '<i class="fas fa-play" aria-hidden="true"></i>'; });
    audio.addEventListener('ended', () => {
      setTrack(state.trackIndex + 1);
      safePlay();
    });
    audio.addEventListener('timeupdate', () => {
      progress.value = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    });
    progress.addEventListener('input', () => {
      if (audio.duration) audio.currentTime = (Number(progress.value) / 100) * audio.duration;
    });
    player.sujingSelectTrack = async (index) => {
      setTrack(index);
      player.classList.add('show');
      await safePlay();
    };
    return player;
  };

  const installMusicPage = async () => {
    const container = document.querySelector('[data-sujing-music-page]');
    if (!container || container.dataset.ready) return;
    container.dataset.ready = 'true';
    const data = await loadSiteData();
    const tracks = data.music?.tracks || [];
    container.setAttribute('aria-busy', 'false');
    if (!tracks.length) {
      container.innerHTML = '<div class="sujing-data-empty"><i class="fas fa-music" aria-hidden="true"></i><h2>歌单正在整理</h2><p>曲目确定后，这里会重新开放播放入口。</p></div>';
      return;
    }
    container.innerHTML = `<div class="sujing-track-list">${tracks.map((track, index) => `
      <button type="button" data-track-index="${index}">
        <img src="${escapeHtml(track.cover || '/img/sujing-mark.svg')}" alt="" loading="lazy">
        <span><strong>${escapeHtml(track.title || '未命名曲目')}</strong><small>${escapeHtml(track.artist || '未知作者')}</small></span>
        <i class="fas fa-play" aria-hidden="true"></i>
      </button>`).join('')}</div>`;
    container.querySelectorAll('[data-track-index]').forEach((button) => {
      button.addEventListener('click', async () => {
        const player = await ensureMusicPlayer();
        await player?.sujingSelectTrack(Number(button.dataset.trackIndex));
      });
    });
  };

  const installReadingProgress = () => {
    document.getElementById('sujing-reading-progress')?.remove();
    const article = document.querySelector('.post #article-container');
    const bodyWrap = document.getElementById('body-wrap');
    if (!article || !bodyWrap) return;
    const progress = document.createElement('div');
    progress.id = 'sujing-reading-progress';
    progress.setAttribute('aria-hidden', 'true');
    progress.innerHTML = '<span></span>';
    bodyWrap.prepend(progress);
  };

  const updateReadingProgress = () => {
    const progress = document.querySelector('#sujing-reading-progress span');
    const article = document.querySelector('.post #article-container');
    if (!progress || !article) return;
    const start = article.getBoundingClientRect().top + window.scrollY - 96;
    const distance = Math.max(article.offsetHeight - window.innerHeight + 160, 1);
    const value = Math.min(1, Math.max(0, (window.scrollY - start) / distance));
    progress.style.transform = `scaleX(${value})`;
  };

  const installMotion = () => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const targets = document.querySelectorAll('[data-sujing-reveal]:not([data-sujing-motion-ready])');
    targets.forEach((target, index) => {
      target.dataset.sujingMotionReady = 'true';
      target.style.setProperty('--sujing-reveal-delay', `${Math.min(index * 70, 420)}ms`);
    });

    if (reduced || !('IntersectionObserver' in window)) {
      targets.forEach((target) => target.classList.add('is-visible'));
    } else {
      if (!state.revealObserver) {
        state.revealObserver = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('is-visible');
            state.revealObserver.unobserve(entry.target);
          });
        }, { threshold: 0.12, rootMargin: '0px 0px -36px' });
      }
      targets.forEach((target) => state.revealObserver.observe(target));
    }

    if (reduced || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    document.querySelectorAll('[data-sujing-tilt]:not([data-sujing-tilt-ready])').forEach((element) => {
      element.dataset.sujingTiltReady = 'true';
      element.addEventListener('pointermove', (event) => {
        const rect = element.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        element.style.setProperty('--sujing-tilt-x', `${((0.5 - y) * 4.2).toFixed(2)}deg`);
        element.style.setProperty('--sujing-tilt-y', `${((x - 0.5) * 4.2).toFixed(2)}deg`);
        element.style.setProperty('--sujing-glow-x', `${(x * 100).toFixed(1)}%`);
        element.style.setProperty('--sujing-glow-y', `${(y * 100).toFixed(1)}%`);
      });
      element.addEventListener('pointerleave', () => {
        element.style.removeProperty('--sujing-tilt-x');
        element.style.removeProperty('--sujing-tilt-y');
        element.style.removeProperty('--sujing-glow-x');
        element.style.removeProperty('--sujing-glow-y');
      });
    });
  };

  const installHeroParallax = () => {
    const hero = document.querySelector('.sujing-bento-hero');
    const image = hero?.querySelector('img');
    if (!hero || !image || hero.dataset.sujingParallaxReady) return;
    hero.dataset.sujingParallaxReady = 'true';
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let frame = null;
    const update = () => {
      frame = null;
      const rect = hero.getBoundingClientRect();
      const view = Math.max(window.innerHeight, 1);
      const progress = Math.min(1, Math.max(0, 1 - (rect.bottom / (view + rect.height))));
      hero.style.setProperty('--sujing-hero-shift', `${(progress * -28).toFixed(1)}px`);
    };
    const onScroll = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
  };

  const installMagneticButtons = () => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    document.querySelectorAll('.sujing-button:not([data-sujing-magnet-ready])').forEach((button) => {
      button.dataset.sujingMagnetReady = 'true';
      button.addEventListener('pointermove', (event) => {
        const rect = button.getBoundingClientRect();
        const x = event.clientX - rect.left - rect.width / 2;
        const y = event.clientY - rect.top - rect.height / 2;
        button.style.setProperty('--sujing-magnet-x', `${(x * 0.18).toFixed(1)}px`);
        button.style.setProperty('--sujing-magnet-y', `${(y * 0.22).toFixed(1)}px`);
      });
      button.addEventListener('pointerleave', () => {
        button.style.setProperty('--sujing-magnet-x', '0px');
        button.style.setProperty('--sujing-magnet-y', '0px');
      });
    });
  };

  const rippleSelector = [
    '#nav .site-page',
    '.sujing-button',
    '.sujing-now-strip',
    'a.sujing-bento-card',
    '.sujing-bento-tracks nav a',
    '.sujing-bento-gallery a',
    '.sujing-bento-profile[href]',
    '.sujing-bento-destinations > a',
    '.sujing-about-links a',
    '.sujing-command-actions button',
    '.sujing-command-routes a',
    '.sujing-command-taxonomy a',
    '.sujing-gallery-grid a'
  ].join(',');

  const createInteractionRipple = (event) => {
    if (event.button !== 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const control = event.target.closest?.(rippleSelector);
    if (!control) return;

    const rect = control.getBoundingClientRect();
    const ripple = document.createElement('span');
    const size = Math.ceil(Math.hypot(rect.width, rect.height) * 2);
    control.dataset.sujingRipple = 'true';
    control.querySelectorAll(':scope > .sujing-interaction-ripple').forEach((item) => item.remove());
    ripple.className = 'sujing-interaction-ripple';
    ripple.setAttribute('aria-hidden', 'true');
    ripple.style.setProperty('--sujing-ripple-size', `${size}px`);
    ripple.style.left = `${event.clientX - rect.left}px`;
    ripple.style.top = `${event.clientY - rect.top}px`;
    ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
    control.appendChild(ripple);
  };

  const installBindings = () => {
    if (document.documentElement.dataset.sujingBindings) return;
    document.documentElement.dataset.sujingBindings = 'true';
    document.documentElement.classList.add('sujing-motion');

    document.addEventListener('pointerdown', createInteractionRipple, { passive: true });

    document.addEventListener('click', (event) => {
      const openTrigger = event.target.closest('[data-sujing-command-open]');
      if (openTrigger) openCommand(openTrigger);
      if (event.target.closest('[data-sujing-command-close]')) closeCommand();
      if (event.target.closest('#sujing-command a')) closeCommand(false);

      const action = event.target.closest('[data-command-action]')?.dataset.commandAction;
      if (action === 'search') openSearch();
      if (action === 'random') randomPost();
      if (action === 'theme') toggleTheme();
      if (!event.target.closest('#nav .menus_item')) closeNavDropdowns();
    });

    document.addEventListener('keydown', (event) => {
      const target = event.target;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
      const command = document.getElementById('sujing-command');
      const commandOpen = command?.classList.contains('show');
      const dropdownOpen = document.querySelector('#nav .menus_item.is-open');

      if (event.key === 'Escape' && commandOpen) {
        event.preventDefault();
        closeCommand();
        return;
      }
      if (event.key === 'Escape' && dropdownOpen) {
        event.preventDefault();
        closeNavDropdowns(null, true);
        return;
      }
      if (commandOpen && event.key === 'Tab') {
        const focusable = getFocusable(command);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
      if (!typing && !commandOpen && event.key === '/') {
        event.preventDefault();
        openSearch();
      }
      if (!typing && !commandOpen && event.altKey && event.key.toLowerCase() === 'r') {
        event.preventDefault();
        randomPost();
      }
    });

    window.addEventListener('scroll', () => {
      if (state.scrollFrame) return;
      state.scrollFrame = window.requestAnimationFrame(() => {
        updateReadingProgress();
        state.scrollFrame = null;
      });
    }, { passive: true });
  };

  const init = () => {
    installBindings();
    closeCommand(false);
    installNavCommand();
    installCurrentNavigation();
    installNavDropdowns();
    installStarfield();
    installHomeContent();
    installArticlesIntro();
    installPostTools();
    installNotesPage();
    installGalleryPage();
    installMusicPage();
    installReadingProgress();
    installMotion();
    installHeroParallax();
    installMagneticButtons();
    updateReadingProgress();
  };

  document.addEventListener('DOMContentLoaded', init);
  document.addEventListener('pjax:complete', init);
})();
