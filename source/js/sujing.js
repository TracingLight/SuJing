(() => {
  'use strict';

  const state = {
    data: null,
    dataPromise: null,
    lastFocus: null,
    trackIndex: 0,
    musicPersistTimer: null,
    revealObserver: null,
    scrollFrame: null,
    statsPath: '',
    statsPending: false,
    navDropdownResizeBound: false,
    annotation: {
      active: null,
      closeTimer: 0,
      frame: 0,
      pointerDown: null,
      pointerTimer: 0,
      hoverQuery: null,
      bound: false
    },
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
        lastX: -9999,
        lastY: -9999,
        vx: 0,
        vy: 0,
        active: false,
        dragging: false,
        pointerId: null
      },
      bound: false
    }
  };

  const MUSIC_STATE_KEY = 'sujing-music-state';

  const readMusicState = () => {
    try {
      return JSON.parse(sessionStorage.getItem(MUSIC_STATE_KEY) || 'null');
    } catch {
      return null;
    }
  };

  const writeMusicState = (patch) => {
    try {
      const prev = readMusicState() || {};
      sessionStorage.setItem(MUSIC_STATE_KEY, JSON.stringify({ ...prev, ...patch, updatedAt: Date.now() }));
    } catch {
      /* ignore quota / private mode */
    }
  };

  const navigateTo = (href) => {
    if (window.pjax?.loadUrl) {
      window.pjax.loadUrl(href);
      return;
    }
    window.location.href = href;
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
          return {
            posts: [],
            categories: [],
            tags: [],
            music: { tracks: [] },
            notes: [],
            gallery: { albums: [] },
            columns: [],
            stats: {
              posts: 0,
              categories: 0,
              tags: 0,
              notes: 0,
              tracks: 0,
              albums: 0,
              words: 0,
              since: '2026-07-21'
            }
          };
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

  /* ---------------------------------------------------------------------------
   * Inline annotations
   * 一条词条 = 渐变下划 + 菱形粒子标记 + hover/click 词条卡
   * 视觉层：全屏 Canvas（WebGL 着色器光晕 + GPU 点精灵粒子；降级 2D Canvas）
   * ------------------------------------------------------------------------- */

  const annotationTooltipOf = (annotation) => {
    const id = annotation?.getAttribute?.('aria-describedby');
    return id ? document.getElementById(id) : null;
  };

  const annotationOwnerOf = (tooltip) => {
    if (!tooltip?.id) return null;
    return document.querySelector(`[data-sujing-annotation][aria-describedby="${tooltip.id}"]`);
  };

  const annotationHoverEnabled = () => {
    state.annotation.hoverQuery ||= window.matchMedia('(hover: hover) and (pointer: fine)');
    return state.annotation.hoverQuery.matches;
  };

  const annotationMotionReduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const annotationFx = {
    canvas: null,
    gl: null,
    ctx: null,
    mode: '',
    failed: false,
    width: 0,
    height: 0,
    dpr: 1,
    rect: null,
    open: 0,
    target: 0,
    time: 0,
    age: 0,
    last: 0,
    raf: 0,
    emit: 0,
    particles: [],
    haloProgram: null,
    pointProgram: null,
    quad: null,
    pointBuffer: null,
    haloUniform: {},
    pointUniform: {},
    haloAttr: 0,
    pointAttr: {},

    shaders: {
      haloVs: `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`,
      haloFs: `
precision highp float;
varying vec2 vUv;
uniform vec2 uRes;
uniform vec2 uCenter;
uniform vec2 uSize;
uniform float uTime;
uniform float uOpen;
uniform float uAge;
uniform vec3 uA;
uniform vec3 uB;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    v += amp * noise(p);
    p = p * 2.03 + 17.1;
    amp *= 0.5;
  }
  return v;
}

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec2 p = vUv * uRes - uCenter;
  vec2 halfSize = max(uSize * 0.5, vec2(8.0));
  float d = sdRoundBox(p, halfSize + vec2(3.0), 10.0);
  float t = uTime;
  float n = fbm(p * 0.12 + vec2(t * 0.2, -t * 0.15));
  float n2 = noise(p * 0.18 - vec2(t * 0.16, t * 0.22));
  float ringWidth = 3.0 + n * 1.2;
  float ring = exp(-pow(abs(d) / ringWidth, 2.0));
  float glow = 1.0 - smoothstep(0.0, 38.0, max(abs(d), 0.0));
  float ang = atan(p.y, p.x);
  float sweep = pow(max(0.0, cos(ang - t * 1.5 + n * 2.5)), 14.0);
  float insideFade = smoothstep(-6.0, 0.0, d);
  float age = clamp(uAge / 0.9, 0.0, 1.0);
  float wave = exp(-pow((abs(d) - age * 56.0) / 3.2, 2.0)) * (1.0 - age);
  float alpha = (ring * (0.42 + 0.2 * n2) + glow * 0.1 + ring * sweep * 0.65 + wave * 0.55) * insideFade;
  alpha *= uOpen;
  alpha = min(alpha, 0.9);
  vec3 col = mix(uA, uB, clamp(0.2 + sweep * 0.8 + n2 * 0.1, 0.0, 1.0));
  col += vec3(0.18) * sweep;
  gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.85));
}`,
      pointVs: `
attribute vec2 aPos;
attribute float aSize;
attribute float aAlpha;
attribute float aHue;
uniform vec2 uRes;
uniform float uDpr;
varying float vAlpha;
varying float vHue;
void main() {
  vec2 clip = (aPos / uRes) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  gl_PointSize = aSize * uDpr;
  vAlpha = aAlpha;
  vHue = aHue;
}`,
      pointFs: `
precision mediump float;
varying float vAlpha;
varying float vHue;
uniform vec3 uA;
uniform vec3 uB;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float core = pow(max(0.0, 1.0 - d * 2.0), 3.0);
  float halo = 1.0 - smoothstep(0.0, 0.5, d);
  float a = core + halo * 0.22;
  vec3 col = mix(uA, uB, vHue);
  gl_FragColor = vec4(col, a * vAlpha);
}`
    },

    compile(gl, type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    },

    program(gl, vsSource, fsSource) {
      const vs = this.compile(gl, gl.VERTEX_SHADER, vsSource);
      const fs = this.compile(gl, gl.FRAGMENT_SHADER, fsSource);
      if (!vs || !fs) return null;
      const program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        gl.deleteProgram(program);
        return null;
      }
      return program;
    },

    mount() {
      const canvas = document.createElement('canvas');
      canvas.id = 'sujing-annotation-fx';
      canvas.setAttribute('aria-hidden', 'true');
      document.body.appendChild(canvas);
      this.canvas = canvas;
      return canvas;
    },

    init() {
      if (this.canvas) return this.mode !== 'none';
      if (this.failed || annotationMotionReduced()) return false;
      if (window.matchMedia('(max-width: 640px)').matches) {
        this.mode = 'none';
        this.failed = true;
        return false;
      }

      let canvas = this.mount();
      const gl = canvas.getContext('webgl', {
        alpha: true,
        antialias: false,
        premultipliedAlpha: false,
        powerPreference: 'low-power'
      });
      if (gl) {
        const halo = this.program(gl, this.shaders.haloVs, this.shaders.haloFs);
        const points = this.program(gl, this.shaders.pointVs, this.shaders.pointFs);
        if (halo && points) {
          this.gl = gl;
          this.haloProgram = halo;
          this.pointProgram = points;
          this.mode = 'webgl';
          this.quad = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1, 1, -1, -1, 1,
            -1, 1, 1, -1, 1, 1
          ]), gl.STATIC_DRAW);
          this.pointBuffer = gl.createBuffer();
          this.haloAttr = gl.getAttribLocation(halo, 'aPos');
          this.haloUniform = {
            res: gl.getUniformLocation(halo, 'uRes'),
            center: gl.getUniformLocation(halo, 'uCenter'),
            size: gl.getUniformLocation(halo, 'uSize'),
            time: gl.getUniformLocation(halo, 'uTime'),
            open: gl.getUniformLocation(halo, 'uOpen'),
            age: gl.getUniformLocation(halo, 'uAge'),
            a: gl.getUniformLocation(halo, 'uA'),
            b: gl.getUniformLocation(halo, 'uB')
          };
          this.pointAttr = {
            pos: gl.getAttribLocation(points, 'aPos'),
            size: gl.getAttribLocation(points, 'aSize'),
            alpha: gl.getAttribLocation(points, 'aAlpha'),
            hue: gl.getAttribLocation(points, 'aHue')
          };
          this.pointUniform = {
            res: gl.getUniformLocation(points, 'uRes'),
            dpr: gl.getUniformLocation(points, 'uDpr'),
            a: gl.getUniformLocation(points, 'uA'),
            b: gl.getUniformLocation(points, 'uB')
          };
          this.resize();
          return true;
        }
        canvas.remove();
        canvas = this.mount();
      }

      const ctx = canvas.getContext('2d');
      if (ctx) {
        this.ctx = ctx;
        this.mode = '2d';
        this.resize();
        return true;
      }
      canvas.remove();
      this.canvas = null;
      this.mode = 'none';
      this.failed = true;
      return false;
    },

    resize() {
      if (!this.canvas) return;
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      const width = window.innerWidth;
      const height = window.innerHeight;
      this.width = width;
      this.height = height;
      this.dpr = dpr;
      this.canvas.width = Math.max(1, Math.round(width * dpr));
      this.canvas.height = Math.max(1, Math.round(height * dpr));
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
      if (this.gl) this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      if (this.ctx) this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },

    setRect(rect) {
      this.rect = rect;
    },

    openAt(rect) {
      if (!rect || !this.init()) return;
      this.rect = rect;
      const reopening = this.target > 0.5;
      this.target = 1;
      this.age = 0;
      if (!reopening) {
        this.open = Math.max(this.open, 0.01);
        this.particles.length = 0;
        this.spawn(40, true);
        this.last = 0;
      } else {
        this.spawn(8);
      }
      this.start();
    },

    close() {
      this.target = 0;
      this.start();
    },

    start() {
      if (this.raf || !this.canvas) return;
      this.raf = window.requestAnimationFrame((time) => this.frame(time));
    },

    spawn(count, burst = false) {
      const rect = this.rect;
      if (!rect) return;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      for (let i = 0; i < count; i += 1) {
        const angle = burst
          ? (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.35
          : Math.random() * Math.PI * 2;
        const life = (burst ? 700 : 1000) + Math.random() * (burst ? 800 : 1000);
        this.particles.push({
          angle,
          radiusX: rect.width / 2 + 8 + Math.random() * (burst ? 20 : 38),
          radiusY: rect.height / 2 + 7 + Math.random() * (burst ? 16 : 26),
          spin: (Math.random() < 0.5 ? -1 : 1) * (0.0006 + Math.random() * 0.0012),
          seed: Math.random() * Math.PI * 2,
          x: cx,
          y: cy,
          life,
          maxLife: life,
          size: 2.2 + Math.random() * (burst ? 3 : 2.4),
          hue: Math.random() < 0.55 ? 0 : 1,
          alpha: 0.65 + Math.random() * 0.35
        });
      }
      if (this.particles.length > 110) this.particles.splice(0, this.particles.length - 110);
    },

    update(dt) {
      const rect = this.rect;
      const cx = rect ? rect.left + rect.width / 2 : 0;
      const cy = rect ? rect.top + rect.height / 2 : 0;
      const particles = this.particles;
      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        p.angle += p.spin * dt;
        const age = p.maxLife - p.life;
        const breathe = 1 + 0.05 * Math.sin(p.seed + age * 0.004);
        p.x = cx + Math.cos(p.angle) * p.radiusX * breathe;
        p.y = cy + Math.sin(p.angle) * p.radiusY * breathe;
      }
    },

    frame(now) {
      this.raf = 0;
      if (!this.canvas || !this.rect) {
        this.clear();
        return;
      }
      if (!this.last) this.last = now;
      const dt = Math.min(48, Math.max(8, now - this.last));
      this.last = now;
      this.time += dt / 1000;
      this.age += dt / 1000;
      const ease = 1 - Math.pow(1 - (this.target ? 0.17 : 0.12), dt / 16.67);
      this.open += (this.target - this.open) * ease;
      if (!this.target && this.open < 0.012 && !this.particles.length) {
        this.open = 0;
        this.clear();
        this.last = 0;
        return;
      }
      if (this.target && this.open > 0.04) {
        this.emit += dt;
        if (this.emit > 70) {
          this.emit = 0;
          this.spawn(1);
        }
      }
      this.update(dt);
      this.draw();
      this.raf = window.requestAnimationFrame((time) => this.frame(time));
    },

    clear() {
      if (this.gl) {
        this.gl.clearColor(0, 0, 0, 0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
      } else if (this.ctx) {
        this.ctx.clearRect(0, 0, this.width, this.height);
      }
    },

    draw() {
      const rect = this.rect;
      if (!rect || !this.mode) return;
      const dark = document.documentElement.getAttribute('data-theme') === 'dark';
      const teal = dark ? [0.3, 0.82, 0.78] : [0.1, 0.48, 0.5];
      const gold = dark ? [0.95, 0.76, 0.42] : [0.72, 0.56, 0.32];
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      if (this.mode === 'webgl') {
        const gl = this.gl;
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.disable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(this.haloProgram);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
        gl.enableVertexAttribArray(this.haloAttr);
        gl.vertexAttribPointer(this.haloAttr, 2, gl.FLOAT, false, 0, 0);
        gl.uniform2f(this.haloUniform.res, this.width, this.height);
        gl.uniform2f(this.haloUniform.center, cx, this.height - cy);
        gl.uniform2f(this.haloUniform.size, rect.width, rect.height);
        gl.uniform1f(this.haloUniform.time, this.time);
        gl.uniform1f(this.haloUniform.open, this.open);
        gl.uniform1f(this.haloUniform.age, this.age);
        gl.uniform3f(this.haloUniform.a, teal[0], teal[1], teal[2]);
        gl.uniform3f(this.haloUniform.b, gold[0], gold[1], gold[2]);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        if (this.particles.length) {
          const data = new Float32Array(this.particles.length * 5);
          for (let i = 0; i < this.particles.length; i += 1) {
            const p = this.particles[i];
            const progress = 1 - p.life / p.maxLife;
            const twinkle = 0.7 + 0.3 * Math.sin(p.seed + this.time * 5);
            const alpha = Math.sin(Math.PI * progress) * p.alpha * this.open * twinkle;
            const offset = i * 5;
            data[offset] = p.x;
            data[offset + 1] = p.y;
            data[offset + 2] = p.size;
            data[offset + 3] = alpha;
            data[offset + 4] = p.hue;
          }
          gl.useProgram(this.pointProgram);
          gl.bindBuffer(gl.ARRAY_BUFFER, this.pointBuffer);
          gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
          const stride = 5 * 4;
          gl.enableVertexAttribArray(this.pointAttr.pos);
          gl.vertexAttribPointer(this.pointAttr.pos, 2, gl.FLOAT, false, stride, 0);
          gl.enableVertexAttribArray(this.pointAttr.size);
          gl.vertexAttribPointer(this.pointAttr.size, 1, gl.FLOAT, false, stride, 8);
          gl.enableVertexAttribArray(this.pointAttr.alpha);
          gl.vertexAttribPointer(this.pointAttr.alpha, 1, gl.FLOAT, false, stride, 12);
          gl.enableVertexAttribArray(this.pointAttr.hue);
          gl.vertexAttribPointer(this.pointAttr.hue, 1, gl.FLOAT, false, stride, 16);
          gl.uniform2f(this.pointUniform.res, this.width, this.height);
          gl.uniform1f(this.pointUniform.dpr, this.dpr);
          gl.uniform3f(this.pointUniform.a, teal[0], teal[1], teal[2]);
          gl.uniform3f(this.pointUniform.b, gold[0], gold[1], gold[2]);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
          gl.drawArrays(gl.POINTS, 0, this.particles.length);
        }
      } else if (this.mode === '2d') {
        this.draw2d(cx, cy, teal, gold, dark);
      }
    },

    draw2d(cx, cy, teal, gold, dark) {
      const ctx = this.ctx;
      if (!ctx) return;
      ctx.clearRect(0, 0, this.width, this.height);
      const rect = this.rect;
      if (!rect) return;
      const x = rect.left - 3;
      const y = rect.top - 3;
      const w = rect.width + 6;
      const h = rect.height + 6;
      const gradient = ctx.createLinearGradient(x, y, x + w, y + h);
      gradient.addColorStop(0, `rgba(${teal.map((v) => Math.round(v * 255)).join(',')},1)`);
      gradient.addColorStop(1, `rgba(${gold.map((v) => Math.round(v * 255)).join(',')},1)`);
      ctx.save();
      ctx.globalAlpha = this.open * (dark ? 0.55 : 0.4);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1 + 0.7 * (0.5 + 0.5 * Math.sin(this.time * 2.2));
      ctx.shadowColor = dark ? 'rgba(80, 220, 210, 0.7)' : 'rgba(26, 122, 130, 0.45)';
      ctx.shadowBlur = 24;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, 12);
      else ctx.rect(x, y, w, h);
      ctx.stroke();
      ctx.restore();
      for (const p of this.particles) {
        const progress = 1 - p.life / p.maxLife;
        const twinkle = 0.7 + 0.3 * Math.sin(p.seed + this.time * 5);
        const alpha = Math.sin(Math.PI * progress) * p.alpha * this.open * twinkle;
        if (alpha <= 0.01) continue;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.hue
          ? `rgb(${gold.map((v) => Math.round(v * 255)).join(',')})`
          : `rgb(${teal.map((v) => Math.round(v * 255)).join(',')})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  };

  const clearAnnotationClose = () => {
    if (!state.annotation.closeTimer) return;
    window.clearTimeout(state.annotation.closeTimer);
    state.annotation.closeTimer = 0;
  };

  const scheduleAnnotationClose = (delay = 280) => {
    clearAnnotationClose();
    state.annotation.closeTimer = window.setTimeout(() => {
      state.annotation.closeTimer = 0;
      closeAnnotations();
    }, delay);
  };

  const positionAnnotationCard = (annotation, tooltip) => {
    if (!annotation || !tooltip || !tooltip.isConnected) return;
    const term = annotation.getBoundingClientRect();
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const margin = 12;
    const gap = 18;
    const width = tooltip.offsetWidth;
    const height = tooltip.offsetHeight;
    if (!width || !height) return;
    let left = term.left + term.width / 2 - width / 2;
    left = Math.max(margin, Math.min(vw - margin - width, left));
    const below = vh - term.bottom;
    const above = term.top;
    let top;
    let placement;
    if (below >= height + gap + margin || below >= above) {
      top = term.bottom + gap;
      placement = 'below';
    } else {
      top = term.top - gap - height;
      placement = 'above';
    }
    top = Math.max(margin, Math.min(vh - margin - height, top));
    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
    tooltip.dataset.placement = placement;
    const arrowX = Math.max(18, Math.min(width - 18, term.left + term.width / 2 - left));
    tooltip.style.setProperty('--arrow-x', `${Math.round(arrowX)}px`);
  };

  const layoutActiveAnnotation = () => {
    const annotation = state.annotation.active;
    if (!annotation) return;
    const tooltip = annotationTooltipOf(annotation);
    if (!tooltip) return;
    positionAnnotationCard(annotation, tooltip);
    annotationFx.setRect(annotation.getBoundingClientRect());
  };

  const openAnnotation = (annotation) => {
    if (!annotation) return;
    const tooltip = annotationTooltipOf(annotation);
    if (!tooltip) return;
    if (state.annotation.active === annotation) {
      clearAnnotationClose();
      layoutActiveAnnotation();
      return;
    }
    closeAnnotations();
    state.annotation.active = annotation;
    annotation.classList.add('is-open');
    annotation.setAttribute('aria-expanded', 'true');
    tooltip.setAttribute('aria-hidden', 'false');
    tooltip.classList.remove('is-open');
    const term = tooltip.querySelector('[data-sujing-annotation-term]');
    if (term) term.textContent = annotation.querySelector('.sujing-annotation-text')?.textContent?.trim() || '';
    positionAnnotationCard(annotation, tooltip);
    window.requestAnimationFrame(() => {
      if (state.annotation.active !== annotation) return;
      positionAnnotationCard(annotation, tooltip);
      tooltip.classList.add('is-open');
      annotationFx.openAt(annotation.getBoundingClientRect());
    });
  };

  const closeAnnotation = (annotation) => {
    if (!annotation) return;
    const tooltip = annotationTooltipOf(annotation);
    annotation.classList.remove('is-open');
    annotation.setAttribute('aria-expanded', 'false');
    if (tooltip) {
      tooltip.classList.remove('is-open');
      tooltip.setAttribute('aria-hidden', 'true');
    }
    if (state.annotation.active === annotation) {
      state.annotation.active = null;
      annotationFx.close();
    }
  };

  const closeAnnotations = (except = null) => {
    document.querySelectorAll('[data-sujing-annotation].is-open').forEach((annotation) => {
      if (annotation === except) return;
      closeAnnotation(annotation);
    });
    if (!except) clearAnnotationClose();
  };

  const toggleAnnotation = (annotation, force) => {
    if (!annotation) return;
    const open = force == null ? !annotation.classList.contains('is-open') : Boolean(force);
    if (open) openAnnotation(annotation);
    else closeAnnotation(annotation);
  };

  const collectAnnotationCards = () => {
    document.querySelectorAll('body > .sujing-annotation-tooltip').forEach((tooltip) => {
      if (!annotationOwnerOf(tooltip)) tooltip.remove();
    });
    document.querySelectorAll('[data-sujing-annotation]').forEach((annotation) => {
      const tooltip = annotationTooltipOf(annotation);
      if (!tooltip) return;
      if (tooltip.parentElement !== document.body) document.body.appendChild(tooltip);
      const term = tooltip.querySelector('[data-sujing-annotation-term]');
      if (term) term.textContent = annotation.querySelector('.sujing-annotation-text')?.textContent?.trim() || '';
      tooltip.setAttribute('aria-hidden', annotation.classList.contains('is-open') ? 'false' : 'true');
    });
    if (state.annotation.active && !state.annotation.active.isConnected) {
      state.annotation.active = null;
      annotationFx.close();
    }
  };

  const installAnnotations = () => {
    collectAnnotationCards();
    if (state.annotation.bound) return;
    state.annotation.bound = true;

    document.addEventListener('pointerdown', (event) => {
      const annotation = event.target.closest?.('[data-sujing-annotation]');
      if (!annotation) return;
      state.annotation.pointerDown = annotation;
      if (state.annotation.pointerTimer) window.clearTimeout(state.annotation.pointerTimer);
      state.annotation.pointerTimer = window.setTimeout(() => {
        state.annotation.pointerDown = null;
        state.annotation.pointerTimer = 0;
      }, 600);
    }, true);

    document.addEventListener('pointerover', (event) => {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      if (!annotationHoverEnabled()) return;
      const annotation = event.target.closest?.('[data-sujing-annotation]');
      const tooltip = event.target.closest?.('.sujing-annotation-tooltip');
      const owner = annotation || annotationOwnerOf(tooltip);
      if (!owner) return;
      clearAnnotationClose();
      if (state.annotation.active !== owner) openAnnotation(owner);
    });

    document.addEventListener('pointerout', (event) => {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      if (!annotationHoverEnabled()) return;
      const from = event.target.closest?.('[data-sujing-annotation], .sujing-annotation-tooltip');
      if (!from) return;
      const to = event.relatedTarget;
      if (to && to.closest?.('[data-sujing-annotation], .sujing-annotation-tooltip')) return;
      scheduleAnnotationClose();
    });

    document.addEventListener('click', (event) => {
      if (event.target.closest?.('.sujing-annotation-tooltip')) return;
      const annotation = event.target.closest?.('[data-sujing-annotation]');
      if (annotation) {
        event.preventDefault();
        toggleAnnotation(annotation);
        return;
      }
      closeAnnotations();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        const active = state.annotation.active;
        if (!active) return;
        const tooltip = annotationTooltipOf(active);
        const focusInside = active.contains(document.activeElement) || tooltip?.contains(document.activeElement);
        closeAnnotations();
        if (focusInside) active.focus({ preventScroll: true });
        event.preventDefault();
        return;
      }
      const annotation = event.target.closest?.('[data-sujing-annotation]');
      if (!annotation || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      toggleAnnotation(annotation);
    });

    document.addEventListener('focusin', (event) => {
      if (state.annotation.pointerDown) return;
      const annotation = event.target.closest?.('[data-sujing-annotation]');
      const tooltip = event.target.closest?.('.sujing-annotation-tooltip');
      const owner = annotation || annotationOwnerOf(tooltip);
      if (!owner) return;
      clearAnnotationClose();
      openAnnotation(owner);
    });

    document.addEventListener('focusout', (event) => {
      const from = event.target.closest?.('[data-sujing-annotation], .sujing-annotation-tooltip');
      if (!from) return;
      window.setTimeout(() => {
        const active = state.annotation.active;
        if (!active) return;
        const tooltip = annotationTooltipOf(active);
        if (active.contains(document.activeElement) || tooltip?.contains(document.activeElement)) return;
        scheduleAnnotationClose(160);
      }, 0);
    });

    const onLayout = () => {
      if (state.annotation.frame) return;
      state.annotation.frame = window.requestAnimationFrame(() => {
        state.annotation.frame = 0;
        const annotation = state.annotation.active;
        if (!annotation) return;
        const rect = annotation.getBoundingClientRect();
        if (rect.bottom < -40 || rect.top > window.innerHeight + 40) {
          closeAnnotation(annotation);
          return;
        }
        layoutActiveAnnotation();
      });
    };
    window.addEventListener('scroll', onLayout, { passive: true });
    window.addEventListener('resize', () => {
      annotationFx.resize();
      onLayout();
    }, { passive: true });
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
    navigateTo(pool[Math.floor(Math.random() * pool.length)].path);
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

  const setMusicOpen = (open) => {
    const player = document.getElementById('sujing-music');
    if (!player) return;
    const toggle = player.querySelector('.sujing-music-toggle');
    player.classList.toggle('show', open);
    if (!toggle) return;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-label', open ? '关闭音乐播放器' : '打开音乐播放器');
    writeMusicState({ panelOpen: open });
  };

  const closeMusic = () => setMusicOpen(false);

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
          <div><span>快捷导航</span><h2 id="sujing-command-title">浏览站点</h2></div>
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
          <a href="/music/"><span>音乐</span><i class="fas fa-arrow-right" aria-hidden="true"></i></a>
          <a href="/categories/"><span>分类</span><i class="fas fa-arrow-right" aria-hidden="true"></i></a>
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
    closeMusic();
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
    if (current === '/columns' || current.startsWith('/columns/')) {
      document.querySelector('#nav .menus_item_child a[href^="/columns/"]')
        ?.closest('.menus_item_child')
        ?.closest('.menus_item')
        ?.querySelector(':scope > .site-page')
        ?.classList.add('is-current');
    }
  };

  const isDesktopNav = () => window.matchMedia('(min-width: 769px)').matches;

  // 下拉以「专栏」为中心展开；窄屏时把展开后的面板整体推回视口内，
  // 避免胶囊被屏幕左/右边缘裁掉。
  const placeNavDropdown = (item, submenu) => {
    submenu.style.removeProperty('--sujing-nav-dropdown-shift');
    if (!isDesktopNav()) return;
    const panel = submenu.getBoundingClientRect();
    if (!panel.width) return;
    const trigger = item.getBoundingClientRect();
    const viewport = document.documentElement.clientWidth || window.innerWidth;
    const margin = 16;
    const center = trigger.left + trigger.width / 2;
    let shift = 0;
    if (center - panel.width / 2 < margin) {
      shift = margin - (center - panel.width / 2);
    } else if (center + panel.width / 2 > viewport - margin) {
      shift = viewport - margin - (center + panel.width / 2);
    }
    if (Math.abs(shift) > 0.5) {
      submenu.style.setProperty('--sujing-nav-dropdown-shift', `${Math.round(shift)}px`);
    }
  };

  const setNavDropdownOpen = (item, open) => {
    const trigger = item?.querySelector(':scope > .site-page');
    if (!trigger) return;
    if (open) {
      const submenu = item.querySelector(':scope > .menus_item_child');
      if (submenu) placeNavDropdown(item, submenu);
    }
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
        // Desktop navigation is hover-driven: clicking the trigger must not
        // pin the submenu open after the pointer leaves it. The submenu links
        // remain ordinary anchors and handle navigation themselves.
        event.preventDefault();
        closeNavDropdowns();
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

    if (!state.navDropdownResizeBound) {
      state.navDropdownResizeBound = true;
      window.addEventListener('resize', () => {
        document.querySelectorAll('#nav .menus_item.is-open > .menus_item_child').forEach((submenu) => {
          placeNavDropdown(submenu.closest('.menus_item'), submenu);
        });
      });
    }
  };

  const starfieldPalette = () => document.documentElement.getAttribute('data-theme') === 'dark'
    ? [
        { color: '245, 250, 248', opacity: 0.95 },
        { color: '127, 214, 208', opacity: 0.9 },
        { color: '232, 168, 120', opacity: 0.72 },
        { color: '214, 120, 112', opacity: 0.68 }
      ]
    : [
        /* Ink-dust palette for paper: denser teal / seal / gold that survives multiply. */
        { color: '22, 96, 102', opacity: 0.78 },
        { color: '32, 48, 54', opacity: 0.42 },
        { color: '168, 62, 54', opacity: 0.58 },
        { color: '138, 108, 68', opacity: 0.56 }
      ];

  const spawnMeteor = (width, height, dark, { immediate = false } = {}) => {
    const speed = (dark ? 5.2 : 4.4) + Math.random() * (dark ? 3.8 : 3.2);
    const angle = (Math.PI * 0.18) + Math.random() * (Math.PI * 0.16);
    const fromLeft = Math.random() < 0.55;
    const vx = Math.cos(angle) * speed * (fromLeft ? 1 : -1);
    const vy = Math.sin(angle) * speed;
    const length = (dark ? 110 : 88) + Math.random() * (dark ? 140 : 110);
    const margin = length + 40;
    let x;
    let y;
    if (immediate) {
      x = Math.random() * width;
      y = Math.random() * height * 0.7;
    } else if (fromLeft) {
      x = -margin;
      y = Math.random() * height * 0.72;
    } else {
      x = width + margin;
      y = Math.random() * height * 0.72;
    }
    return {
      meteor: true,
      x,
      y,
      size: (dark ? 1.35 : 1.2) + Math.random() * 1.5,
      vx,
      vy,
      baseVx: vx,
      baseVy: vy,
      opacity: (dark ? 0.92 : 0.78) + Math.random() * 0.08,
      color: Math.floor(Math.random() * 4),
      streak: false,
      spark: false,
      mote: false,
      length,
      phase: Math.random() * Math.PI * 2,
      twinkle: 0.04 + Math.random() * 0.03,
      wait: immediate ? 0 : 40 + Math.floor(Math.random() * (dark ? 160 : 220)),
      active: immediate
    };
  };

  const createStarfieldParticles = () => {
    const area = window.innerWidth * window.innerHeight;
    const mobile = window.innerWidth <= 640;
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const width = window.innerWidth;
    const height = window.innerHeight;
    const count = mobile
      ? Math.min(dark ? 72 : 88, Math.max(dark ? 42 : 52, Math.round(area / (dark ? 9000 : 7600))))
      : Math.min(dark ? 168 : 196, Math.max(dark ? 110 : 132, Math.round(area / (dark ? 9800 : 8200))));
    const meteorCount = mobile ? (dark ? 3 : 2) : (dark ? 5 : 4);
    const contentWidth = Math.min(1180, Math.max(0, window.innerWidth - 32));
    const gutterWidth = Math.max(0, (window.innerWidth - contentWidth) / 2);
    const randomX = () => {
      // Keep some particles in gutters, but mostly across the full viewport so they read on content pages.
      if (mobile || gutterWidth < 72 || Math.random() >= (dark ? 0.42 : 0.35)) {
        return Math.random() * window.innerWidth;
      }
      const padding = Math.min(18, gutterWidth * 0.15);
      const gutterX = padding + Math.random() * Math.max(1, gutterWidth - padding * 2);
      return Math.random() < 0.5 ? gutterX : window.innerWidth - gutterX;
    };
    const stars = Array.from({ length: count }, () => {
      const vx = (dark ? -0.28 : -0.22) + Math.random() * (dark ? 0.72 : 0.58);
      const vy = (dark ? 0.28 : 0.2) + Math.random() * (dark ? 0.55 : 0.42);
      return {
        meteor: false,
        x: randomX(),
        y: Math.random() * height,
        size: (dark ? 1.35 : 1.45) + Math.random() * (dark ? 2.2 : 2.35),
        vx,
        vy,
        baseVx: vx,
        baseVy: vy,
        opacity: (dark ? 0.78 : 0.86) + Math.random() * 0.18,
        color: Math.floor(Math.random() * 4),
        streak: Math.random() < (dark ? 0.18 : 0.1),
        spark: Math.random() < (dark ? 0.48 : 0.42),
        mote: !dark && Math.random() < 0.16,
        length: 18 + Math.random() * 28,
        phase: Math.random() * Math.PI * 2,
        twinkle: (dark ? 0.02 : 0.014) + Math.random() * (dark ? 0.028 : 0.02),
        wait: 0,
        active: true
      };
    });
    const meteors = Array.from({ length: meteorCount }, (_, index) => (
      spawnMeteor(width, height, dark, { immediate: index === 0 })
    ));
    state.starfield.particles = stars.concat(meteors);
  };

  const isStarfieldDragTarget = (target) => {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest([
      'a',
      'button',
      'input',
      'textarea',
      'select',
      'label',
      'summary',
      '[role="button"]',
      '[contenteditable="true"]',
      '#sujing-music',
      '#sujing-command',
      '#nav',
      '#rightside',
      '.sujing-button',
      '.sujing-icon-button',
      '.menus_item_child'
    ].join(',')));
  };

  const applyStarfieldDrag = (dx, dy) => {
    const pointer = state.starfield.pointer;
    const particles = state.starfield.particles;
    if (!pointer.dragging || !particles.length) return;
    const radius = window.innerWidth <= 640 ? 150 : 210;
    const pull = 0.92;
    particles.forEach((particle) => {
      const distance = Math.hypot(particle.x - pointer.x, particle.y - pointer.y);
      if (!distance || distance >= radius) return;
      const influence = (1 - distance / radius) ** 1.35;
      particle.x += dx * influence * pull;
      particle.y += dy * influence * pull;
      particle.vx += dx * influence * 0.055;
      particle.vy += dy * influence * 0.055;
      const speed = Math.hypot(particle.vx, particle.vy);
      if (speed > 2.8) {
        particle.vx = (particle.vx / speed) * 2.8;
        particle.vy = (particle.vy / speed) * 2.8;
      }
    });
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
      if (!pointer.active || reduced || pointer.dragging) {
        return { x: particle.x, y: particle.y, boost: pointer.dragging ? 0.35 : 0 };
      }
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

    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (!reduced) {
      const maximumDistance = width <= 640 ? 88 : (dark ? 118 : 108);
      const maximumLinks = width <= 640 ? 10 : (dark ? 28 : 34);
      let links = 0;
      context.lineWidth = dark ? 0.7 : 0.85;
      for (let first = 0; first < renderPoints.length && links < maximumLinks; first += 1) {
        for (let second = first + 1; second < renderPoints.length && links < maximumLinks; second += 1) {
          if ((first * 17 + second * 31) % 7 !== 0) continue;
          const a = renderPoints[first];
          const b = renderPoints[second];
          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          if (distance > maximumDistance) continue;
          const alpha = (1 - distance / maximumDistance) * (dark ? 0.34 : 0.22);
          context.strokeStyle = dark
            ? `rgba(127, 214, 208, ${alpha})`
            : `rgba(26, 122, 130, ${alpha})`;
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
      const twinkle = (dark ? 0.76 : 0.84) + Math.sin(particle.phase) * (dark ? 0.24 : 0.16);
      const alpha = Math.min(1, swatch.opacity * particle.opacity * twinkle * (1 + point.boost * 0.45));
      const radius = particle.size * (dark ? 0.55 : 0.62);
      const speed = Math.hypot(particle.vx, particle.vy) || 1;
      const ux = particle.vx / speed;
      const uy = particle.vy / speed;

      if (particle.meteor) {
        if (particle.active && !reduced) {
          const trail = particle.length;
          const headX = point.x;
          const headY = point.y;
          const tailX = headX - ux * trail;
          const tailY = headY - uy * trail;
          const gradient = context.createLinearGradient(headX, headY, tailX, tailY);
          gradient.addColorStop(0, `rgba(${swatch.color}, ${Math.min(1, alpha)})`);
          gradient.addColorStop(0.22, `rgba(${swatch.color}, ${alpha * (dark ? 0.62 : 0.48)})`);
          gradient.addColorStop(0.7, `rgba(${swatch.color}, ${alpha * 0.12})`);
          gradient.addColorStop(1, `rgba(${swatch.color}, 0)`);
          context.strokeStyle = gradient;
          context.lineWidth = Math.max(1.1, particle.size * (dark ? 1.15 : 1));
          context.lineCap = 'round';
          context.beginPath();
          context.moveTo(headX, headY);
          context.lineTo(tailX, tailY);
          context.stroke();
          context.beginPath();
          context.fillStyle = `rgba(${swatch.color}, ${Math.min(1, alpha * 1.05)})`;
          context.arc(headX, headY, Math.max(1.1, particle.size * 0.72), 0, Math.PI * 2);
          context.fill();
          context.beginPath();
          context.fillStyle = `rgba(255, 248, 236, ${alpha * (dark ? 0.55 : 0.35)})`;
          context.arc(headX, headY, Math.max(0.7, particle.size * 0.38), 0, Math.PI * 2);
          context.fill();
        }
      } else {
        context.beginPath();
        context.fillStyle = `rgba(${swatch.color}, ${alpha})`;
        context.arc(point.x, point.y, radius, 0, Math.PI * 2);
        context.fill();
        if (particle.mote) {
          context.beginPath();
          context.fillStyle = `rgba(${swatch.color}, ${alpha * 0.18})`;
          context.arc(point.x, point.y, radius * 3.2, 0, Math.PI * 2);
          context.fill();
        }
        if (particle.spark || particle.size > 2.2) {
          context.beginPath();
          context.fillStyle = `rgba(${swatch.color}, ${alpha * (dark ? 0.22 : 0.16)})`;
          context.arc(point.x, point.y, radius * (dark ? 2.4 : 2.1), 0, Math.PI * 2);
          context.fill();
        }
        if (particle.spark) {
          context.fillStyle = `rgba(${swatch.color}, ${alpha * (dark ? 0.5 : 0.62)})`;
          const arm = particle.size * (dark ? 1.9 : 2.1);
          context.fillRect(point.x - arm, point.y - particle.size * 0.12, arm * 2, Math.max(0.55, particle.size * 0.28));
          context.fillRect(point.x - particle.size * 0.12, point.y - arm, Math.max(0.55, particle.size * 0.28), arm * 2);
        }
        if (particle.streak && !reduced) {
          const trail = particle.length;
          const gradient = context.createLinearGradient(
            point.x,
            point.y,
            point.x - ux * trail,
            point.y - uy * trail
          );
          gradient.addColorStop(0, `rgba(${swatch.color}, ${alpha * (dark ? 0.7 : 0.5)})`);
          gradient.addColorStop(1, `rgba(${swatch.color}, 0)`);
          context.strokeStyle = gradient;
          context.lineWidth = Math.max(0.65, particle.size * 0.48);
          context.lineCap = 'round';
          context.beginPath();
          context.moveTo(point.x, point.y);
          context.lineTo(point.x - ux * trail, point.y - uy * trail);
          context.stroke();
        }
      }

      if (!move) return;
      particle.phase += particle.twinkle;

      if (particle.meteor) {
        if (!particle.active) {
          particle.wait -= 1;
          if (particle.wait <= 0) {
            const next = spawnMeteor(width, height, dark);
            Object.assign(particle, next, { active: true, wait: 0 });
          }
          return;
        }
        particle.x += particle.vx;
        particle.y += particle.vy;
        const margin = particle.length + 48;
        if (
          particle.x < -margin
          || particle.x > width + margin
          || particle.y < -margin
          || particle.y > height + margin
        ) {
          particle.active = false;
          particle.wait = 50 + Math.floor(Math.random() * (dark ? 180 : 240));
        }
        return;
      }

      // While dragging, natural drift yields to the pull so the field feels attached to the cursor.
      const driftScale = pointer.dragging ? 0.22 : 1;
      particle.x += particle.vx * driftScale;
      particle.y += particle.vy * driftScale;
      if (pointer.dragging) {
        particle.vx *= 0.965;
        particle.vy *= 0.965;
      } else {
        // Ease back to base drift — never decay ambient motion to a standstill.
        particle.vx += (particle.baseVx - particle.vx) * 0.05;
        particle.vy += (particle.baseVy - particle.vy) * 0.05;
      }
      if (particle.y > height + particle.length) particle.y = -particle.length;
      if (particle.y < -particle.length) particle.y = height + particle.length;
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
      if (time - state.starfield.lastFrame >= (state.starfield.pointer.dragging ? 16 : 22)) {
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
        state.starfield.pointer.dragging = false;
        document.documentElement.classList.remove('sujing-starfield-dragging');
        drawStarfield(false);
      });
      window.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        if (!state.starfield.pointerQuery?.matches || state.starfield.motionQuery?.matches) return;
        if (isStarfieldDragTarget(event.target)) return;
        const pointer = state.starfield.pointer;
        pointer.dragging = true;
        pointer.pointerId = event.pointerId;
        pointer.x = event.clientX;
        pointer.y = event.clientY;
        pointer.lastX = event.clientX;
        pointer.lastY = event.clientY;
        pointer.vx = 0;
        pointer.vy = 0;
        pointer.active = true;
        document.documentElement.classList.add('sujing-starfield-dragging');
      }, { passive: true });
      window.addEventListener('pointermove', (event) => {
        if (!state.starfield.pointerQuery?.matches || state.starfield.motionQuery?.matches) return;
        const pointer = state.starfield.pointer;
        const prevX = pointer.x;
        const prevY = pointer.y;
        pointer.x = event.clientX;
        pointer.y = event.clientY;
        pointer.active = true;
        if (!pointer.dragging) return;
        if (pointer.pointerId !== null && event.pointerId !== pointer.pointerId) return;
        const dx = pointer.x - (Number.isFinite(prevX) ? prevX : pointer.x);
        const dy = pointer.y - (Number.isFinite(prevY) ? prevY : pointer.y);
        pointer.vx = dx;
        pointer.vy = dy;
        pointer.lastX = prevX;
        pointer.lastY = prevY;
        applyStarfieldDrag(dx, dy);
      }, { passive: true });
      const endStarfieldDrag = (event) => {
        const pointer = state.starfield.pointer;
        if (!pointer.dragging) return;
        if (event && pointer.pointerId !== null && event.pointerId !== pointer.pointerId) return;
        // Release with a short flick of inertia.
        if (Math.hypot(pointer.vx, pointer.vy) > 0.4) {
          applyStarfieldDrag(pointer.vx * 1.15, pointer.vy * 1.15);
        }
        pointer.dragging = false;
        pointer.pointerId = null;
        document.documentElement.classList.remove('sujing-starfield-dragging');
      };
      window.addEventListener('pointerup', endStarfieldDrag, { passive: true });
      window.addEventListener('pointercancel', endStarfieldDrag, { passive: true });
      window.addEventListener('pointerout', (event) => {
        if (event.relatedTarget) return;
        if (!state.starfield.pointer.dragging) state.starfield.pointer.active = false;
      }, { passive: true });
      state.starfield.themeObserver = new MutationObserver(() => {
        createStarfieldParticles();
        drawStarfield(false);
      });
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

  const parseCoverPosition = (value) => {
    const text = String(value || '').trim();
    if (!text) return null;
    const parts = text.split(/\s+/).filter(Boolean);
    if (parts.length < 2) return null;
    return { x: parts[0], y: parts[1] };
  };

  const inferCoverFocusFromRatio = (width, height) => {
    const w = Number(width) || 1;
    const h = Number(height) || 1;
    const ratio = w / h;
    // 竖图/方图：更靠上保头；标准横图略上；超宽接近居中
    if (ratio <= 0.9) return { x: '50%', y: '14%' };
    if (ratio <= 1.15) return { x: '50%', y: '18%' };
    if (ratio <= 1.55) return { x: '50%', y: '22%' };
    if (ratio <= 1.9) return { x: '50%', y: '28%' };
    return { x: '50%', y: '40%' };
  };

  const applyCoverFocus = (header, focus) => {
    if (!header || !focus) return;
    header.style.setProperty('--sujing-cover-x', focus.x);
    header.style.setProperty('--sujing-cover-y', focus.y);
    document.documentElement.style.setProperty('--sujing-cover-x', focus.x);
    document.documentElement.style.setProperty('--sujing-cover-y', focus.y);

    // PJAX 不换 head：同步 meta，避免下次软跳转读到上一篇的焦点
    let meta = document.querySelector('meta[name="sujing-cover-position"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'sujing-cover-position');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', `${focus.x} ${focus.y}`);

    let style = document.getElementById('sujing-cover-focus-vars');
    if (!style) {
      style = document.createElement('style');
      style.id = 'sujing-cover-focus-vars';
      document.head.appendChild(style);
    }
    style.textContent = `#page-header.post-bg{--sujing-cover-x:${focus.x};--sujing-cover-y:${focus.y}}`;
  };

  const clearCoverFocus = () => {
    const root = document.documentElement;
    root.style.removeProperty('--sujing-cover-x');
    root.style.removeProperty('--sujing-cover-y');
    document.querySelector('meta[name="sujing-cover-position"]')?.remove();
    document.getElementById('sujing-cover-focus-vars')?.remove();
  };

  const resolveCoverImageUrl = (header) => {
    const inline = header.style.backgroundImage || header.getAttribute('style') || '';
    const matched = inline.match(/url\((['"]?)(.*?)\1\)/i);
    if (matched?.[2]) return matched[2].replace(/^['"]|['"]$/g, '');
    const computed = window.getComputedStyle(header).backgroundImage;
    const computedMatch = computed && computed !== 'none'
      ? computed.match(/url\((['"]?)(.*?)\1\)/i)
      : null;
    return computedMatch?.[2] ? computedMatch[2].replace(/^['"]|['"]$/g, '') : '';
  };

  const resolvePostCoverFocus = async (header) => {
    // 1) 顶栏 data / 行内变量（随 PJAX body 替换，优先）
    const fromData = parseCoverPosition(header?.getAttribute('data-cover-position'));
    if (fromData) return fromData;

    // 2) 当前路径对应的 site-index（比残留 head meta 更可靠）
    try {
      const data = await loadSiteData();
      const path = window.location.pathname.replace(/index\.html$/, '');
      const normalized = path.endsWith('/') ? path : `${path}/`;
      const post = data.posts?.find((item) => {
        const itemPath = String(item.path || '');
        return itemPath === path || itemPath === normalized || `${itemPath}/` === normalized;
      });
      const fromIndex = parseCoverPosition(post?.cover_position);
      if (fromIndex) return fromIndex;
    } catch {
      // ignore
    }

    // 3) head meta（整页刷新时有；软跳转可能是上一篇残留）
    return parseCoverPosition(
      document.querySelector('meta[name="sujing-cover-position"]')?.getAttribute('content')
    );
  };

  const installPostAtmosphere = async () => {
    const root = document.documentElement;
    const header = document.querySelector('#page-header.post-bg');
    document.getElementById('sujing-post-cover-stage')?.remove();

    root.classList.remove('sujing-post-atmosphere');
    root.style.removeProperty('--sujing-post-cover');
    if (!header) {
      clearCoverFocus();
      return;
    }

    // 行内 / data 焦点立刻生效，不依赖图片 URL 与异步 JSON
    const eager = parseCoverPosition(header.getAttribute('data-cover-position'));
    if (eager) applyCoverFocus(header, eager);

    const imageUrl = resolveCoverImageUrl(header);
    if (imageUrl) {
      root.style.setProperty('--sujing-post-cover', `url("${imageUrl}")`);
      root.classList.add('sujing-post-atmosphere');
    }

    const focus = eager || await resolvePostCoverFocus(header);
    if (focus) {
      applyCoverFocus(header, focus);
      return;
    }

    if (!imageUrl) return;

    await new Promise((resolve) => {
      const probe = new Image();
      probe.onload = () => {
        applyCoverFocus(header, inferCoverFocusFromRatio(probe.naturalWidth, probe.naturalHeight));
        resolve();
      };
      probe.onerror = () => {
        applyCoverFocus(header, { x: '50%', y: '20%' });
        resolve();
      };
      probe.src = imageUrl;
    });
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

  const formatLedgerNumber = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return '—';
    return Math.floor(number).toLocaleString('zh-CN');
  };

  const formatWordCount = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return '—';
    if (number < 10000) return Math.floor(number).toLocaleString('zh-CN');
    const wan = number / 10000;
    return `${wan >= 10 ? wan.toFixed(0) : wan.toFixed(1).replace(/\.0$/, '')} 万`;
  };

  const formatRuntime = (since) => {
    const start = new Date(`${String(since || '').slice(0, 10)}T00:00:00+08:00`);
    if (Number.isNaN(start.getTime())) return '—';
    const days = Math.max(0, Math.floor((Date.now() - start.getTime()) / 86400000));
    if (days < 30) return `${days} 天`;
    if (days < 365) {
      const months = Math.floor(days / 30);
      const rest = days % 30;
      return rest ? `${months} 月 ${rest} 天` : `${months} 月`;
    }
    const years = Math.floor(days / 365);
    const restDays = days % 365;
    const months = Math.floor(restDays / 30);
    if (months) return `${years} 年 ${months} 月`;
    return `${years} 年`;
  };

  const paintHomeLedger = (data) => {
    const ledger = document.querySelector('[data-sujing-ledger]');
    if (!ledger) return;
    const stats = data.stats || {
      posts: data.posts?.length || 0,
      categories: data.categories?.length || 0,
      tags: data.tags?.length || 0,
      notes: data.notes?.length || 0,
      words: 0,
      since: '2026-07-21'
    };
    const values = {
      posts: formatLedgerNumber(stats.posts),
      categories: formatLedgerNumber(stats.categories),
      tags: formatLedgerNumber(stats.tags),
      notes: formatLedgerNumber(stats.notes),
      words: formatWordCount(stats.words),
      runtime: formatRuntime(stats.since)
    };
    Object.entries(values).forEach(([key, text]) => {
      ledger.querySelectorAll(`[data-sujing-ledger="${key}"]`).forEach((node) => {
        node.textContent = text;
      });
    });
    const sinceNode = ledger.querySelector('[data-sujing-ledger-since]');
    if (sinceNode && stats.since) {
      sinceNode.dateTime = stats.since;
      sinceNode.textContent = formatDate(stats.since);
    }
    ledger.classList.add('is-ready');
  };

  let homeIntroPlayed = false;
  let homeIntroTypingTimer = 0;

  const resetHomeSubtitle = (subtitle) => {
    const target = subtitle?.querySelector('[data-sujing-typewriter-text]');
    if (!target) return;
    target.textContent = '';
    subtitle.classList.remove('is-complete');
    subtitle.classList.add('is-typing');
  };

  const typeHomeSubtitle = (subtitle, instant = false) => {
    const target = subtitle?.querySelector('[data-sujing-typewriter-text]');
    if (!target) return;
    const full = subtitle.dataset.text || target.textContent || '';
    window.clearTimeout(homeIntroTypingTimer);
    if (instant || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      target.textContent = full;
      subtitle.classList.remove('is-typing');
      subtitle.classList.add('is-complete');
      return;
    }
    target.textContent = '';
    subtitle.classList.remove('is-complete');
    subtitle.classList.add('is-typing');
    let index = 0;
    const step = () => {
      index += 1;
      target.textContent = full.slice(0, index);
      if (index < full.length) {
        homeIntroTypingTimer = window.setTimeout(step, index < 6 ? 90 : 52);
      } else {
        subtitle.classList.remove('is-typing');
        subtitle.classList.add('is-complete');
      }
    };
    homeIntroTypingTimer = window.setTimeout(step, 180);
  };

  const installHomeIntro = () => {
    const overlay = document.querySelector('[data-sujing-intro]');
    if (!overlay) return;
    const subtitle = document.querySelector('[data-sujing-typewriter]');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (homeIntroPlayed || reduce) {
      overlay.remove();
      document.body.classList.remove('sujing-intro-lock');
      document.documentElement.classList.remove('sujing-intro-active', 'sujing-intro-revealed');
      typeHomeSubtitle(subtitle, true);
      return;
    }

    homeIntroPlayed = true;
    document.body.appendChild(overlay);
    document.body.classList.add('sujing-intro-lock');
    document.documentElement.classList.add('sujing-intro-active');
    resetHomeSubtitle(subtitle);

    const skip = overlay.querySelector('[data-sujing-intro-skip]');
    let opened = false;
    let doneTimer = 0;
    let fallbackTimer = 0;
    let cleanupTimer = 0;

    const onKey = (event) => {
      if (event.key === 'Escape') open();
    };

    const cleanup = () => {
      window.clearTimeout(doneTimer);
      window.clearTimeout(fallbackTimer);
      window.clearTimeout(cleanupTimer);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pjax:send', onPjaxSend);
      overlay.remove();
      document.body.classList.remove('sujing-intro-lock');
      document.documentElement.classList.remove('sujing-intro-active', 'sujing-intro-revealed');
    };

    const onPjaxSend = () => {
      window.clearTimeout(homeIntroTypingTimer);
      cleanup();
    };

    const open = () => {
      if (opened) return;
      opened = true;
      window.clearTimeout(fallbackTimer);
      overlay.classList.add('is-opening');
      document.body.classList.remove('sujing-intro-lock');
      document.documentElement.classList.remove('sujing-intro-active');
      document.documentElement.classList.add('sujing-intro-revealed');
      typeHomeSubtitle(subtitle, false);
      doneTimer = window.setTimeout(() => {
        overlay.classList.add('is-done');
        cleanupTimer = window.setTimeout(cleanup, 60);
      }, 450);
    };

    skip?.addEventListener('click', open);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pjax:send', onPjaxSend);
    fallbackTimer = window.setTimeout(open, 60);
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
        // Butterfly lazyload 会缓存 data-lazy-src；点击时可能把 src 打回旧占位图
        cover.classList.add('nolazyload', 'entered', 'loaded');
        cover.removeAttribute('data-lazy-src');
        cover.removeAttribute('data-src');
        cover.removeAttribute('data-original');
        cover.loading = 'eager';
        cover.src = latest.cover;
        const coverPosition = String(latest.cover_position || '').trim();
        if (coverPosition) {
          cover.style.objectPosition = coverPosition;
        } else {
          cover.style.removeProperty('object-position');
        }
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

    paintHomeLedger(data);

    const empty = home.querySelector('[data-sujing-gallery-empty]');
    const grid = home.querySelector('[data-sujing-gallery-grid]');
    const images = (data.gallery?.albums || [])
      .flatMap((album) => (album.images || []).map((image) => ({
        ...image,
        albumTitle: album.title,
        albumHref: album.href || '/gallery/'
      })))
      .slice(0, 3);

    if (empty) empty.hidden = images.length > 0;
    if (!grid) return;

    if (!images.length) {
      grid.hidden = true;
      grid.innerHTML = '';
      return;
    }

    grid.hidden = false;
    grid.innerHTML = images.map((image) => {
      const href = escapeHtml(image.href || image.src || '/gallery/');
      const src = escapeHtml(image.src || '');
      const title = escapeHtml(image.title || image.alt || image.albumTitle || '相册');
      const alt = escapeHtml(image.alt || image.title || image.albumTitle || '相册预览');
      const width = Number(image.width) || 1200;
      const height = Number(image.height) || 800;
      return `
        <a href="${href}">
          <img class="no-lightbox" src="${src}" alt="${alt}" width="${width}" height="${height}" loading="lazy">
          <span>${title}</span>
        </a>`;
    }).join('');
    installGalleryParallax();
  };

  const installArticlesIntro = () => {
    if (!/^\/articles\/?$/.test(window.location.pathname)) return;
    const recentPosts = document.getElementById('recent-posts');
    if (!recentPosts || recentPosts.querySelector('.sujing-list-intro')) return;
    const intro = document.createElement('header');
    intro.className = 'sujing-list-intro';
    intro.setAttribute('data-sujing-reveal', '');
    intro.innerHTML = `
      <div><p class="sujing-kicker">文章</p><h1>文章库</h1></div>
      <p>以游戏开发笔记为主，同时补齐计算机基础方面的知识。</p>`;
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
      : '<div class="sujing-data-empty" data-sujing-reveal><span class="sujing-empty-seal" aria-hidden="true">讯</span><h2>暂无短讯</h2><p>近况与简短想法会先出现在这里。</p></div>';
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
            <header data-sujing-reveal><p class="sujing-kicker">册 ${String(albumIndex + 1).padStart(2, '0')}</p><h2>${escapeHtml(album.title)}</h2><p>${escapeHtml(album.description || '')}</p></header>
            <div class="sujing-gallery-grid">${(album.images || []).map((image) => `
              <figure data-sujing-reveal>
                <a href="${escapeHtml(image.src)}" data-fancybox="sujing-gallery-${albumIndex}" data-caption="${escapeHtml(image.title || image.alt || album.title)}">
                  <img src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt || image.title || album.title)}" width="${Number(image.width) || 1536}" height="${Number(image.height) || 1024}" loading="lazy">
                </a>
                <figcaption><strong>${escapeHtml(image.title || album.title)}</strong>${image.description ? `<span>${escapeHtml(image.description)}</span>` : ''}</figcaption>
              </figure>`).join('')}</div>
          </section>`).join('')
      : '<div class="sujing-data-empty" data-sujing-reveal><span class="sujing-empty-seal" aria-hidden="true">待</span><h2>相册筹备中</h2><p>图片稍后补充。</p></div>';
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
    const dormant = !tracks.length;

    player = document.createElement('aside');
    player.id = 'sujing-music';
    if (dormant) player.classList.add('is-dormant');
    player.innerHTML = dormant
      ? `
      <button class="sujing-music-toggle" type="button" title="音乐" aria-label="打开音乐播放器" aria-expanded="false"><i class="fas fa-music" aria-hidden="true"></i></button>
      <section class="sujing-music-panel" aria-label="音乐播放器">
        <div class="sujing-music-dormant">
          <span class="sujing-empty-seal" aria-hidden="true">音</span>
          <strong>歌单整理中</strong>
          <p>曲目补充后即可在此播放。</p>
          <a class="sujing-button sujing-button-quiet" href="/music/">前往音乐页</a>
        </div>
      </section>`
      : `
      <button class="sujing-music-toggle" type="button" title="音乐" aria-label="打开音乐播放器" aria-expanded="false"><i class="fas fa-music" aria-hidden="true"></i></button>
      <section class="sujing-music-panel" aria-label="音乐播放器">
        <div class="sujing-music-panel-head">
          <span>正在听</span>
          <button type="button" data-music="list" title="展开或收起歌单" aria-label="展开或收起歌单" aria-expanded="true">
            <i class="fas fa-list-ul" aria-hidden="true"></i>
            <em>歌单 · ${tracks.length}</em>
          </button>
        </div>
        <img class="sujing-music-cover" alt="" src="${escapeHtml(tracks[0].cover || '/img/sujing-icon-full-512.png')}">
        <div class="sujing-music-info"><strong></strong><span></span></div>
        <div class="sujing-music-controls">
          <button type="button" data-music="prev" title="上一首" aria-label="上一首"><i class="fas fa-backward-step" aria-hidden="true"></i></button>
          <button type="button" data-music="play" title="播放" aria-label="播放"><i class="fas fa-play" aria-hidden="true"></i></button>
          <button type="button" data-music="next" title="下一首" aria-label="下一首"><i class="fas fa-forward-step" aria-hidden="true"></i></button>
        </div>
        <div class="sujing-music-progress" role="slider" aria-label="播放进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0">
          <span></span>
        </div>
        <div class="sujing-music-playlist" role="listbox" aria-label="歌单">
          ${tracks.map((track, index) => `
            <button type="button" class="sujing-music-track" role="option" data-track-index="${index}" aria-selected="false">
              <span class="sujing-music-track-index">${String(index + 1).padStart(2, '0')}</span>
              <span class="sujing-music-track-meta">
                <strong>${escapeHtml(track.title || '未命名曲目')}</strong>
                <small>${escapeHtml(track.artist || '未知作者')}</small>
              </span>
              <i class="fas fa-play" aria-hidden="true"></i>
            </button>`).join('')}
        </div>
        <audio preload="none"></audio>
      </section>`;
    document.body.appendChild(player);
    player.classList.add('list-open');

    const toggle = player.querySelector('.sujing-music-toggle');
    toggle.addEventListener('click', () => {
      setMusicOpen(!player.classList.contains('show'));
    });

    if (dormant) {
      player.sujingSelectTrack = async () => {
        setMusicOpen(true);
        toast('歌单整理中，稍后再来');
      };
      return player;
    }

    const audio = player.querySelector('audio');
    const playButton = player.querySelector('[data-music="play"]');
    const listButton = player.querySelector('[data-music="list"]');
    const progress = player.querySelector('.sujing-music-progress');
    const progressBar = progress.querySelector('span');
    const trackButtons = [...player.querySelectorAll('.sujing-music-track')];
    let pendingRestoreTime = 0;
    const persistMusicState = (extra = {}) => {
      writeMusicState({
        trackIndex: state.trackIndex,
        currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
        playing: !audio.paused,
        panelOpen: player.classList.contains('show'),
        ...extra
      });
    };
    const setProgress = (ratio) => {
      const value = Math.min(100, Math.max(0, ratio * 100));
      progressBar.style.transform = `scaleX(${value / 100})`;
      progress.setAttribute('aria-valuenow', String(Math.round(value)));
    };
    const syncPlaylistActive = () => {
      trackButtons.forEach((button) => {
        const active = Number(button.dataset.trackIndex) === state.trackIndex;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
        const icon = button.querySelector('i');
        if (icon) {
          icon.className = active && !audio.paused
            ? 'fas fa-volume-high'
            : 'fas fa-play';
        }
      });
    };
    const setListOpen = (open) => {
      player.classList.toggle('list-open', open);
      if (!listButton) return;
      listButton.setAttribute('aria-expanded', open ? 'true' : 'false');
      listButton.setAttribute('aria-label', open ? '收起歌单' : '展开歌单');
      listButton.title = open ? '收起歌单' : '展开歌单';
    };
    const setTrack = (index, { resetTime = true } = {}) => {
      state.trackIndex = (index + tracks.length) % tracks.length;
      const track = tracks[state.trackIndex];
      player.querySelector('.sujing-music-info strong').textContent = track.title || '未命名曲目';
      player.querySelector('.sujing-music-info span').textContent = track.artist || '未知作者';
      player.querySelector('.sujing-music-cover').src = track.cover || '/img/sujing-icon-full-512.png';
      if (resetTime) {
        pendingRestoreTime = 0;
        setProgress(0);
      }
      syncPlaylistActive();
      persistMusicState({ trackIndex: state.trackIndex });
    };
    const ensureAudioSource = () => {
      const track = tracks[state.trackIndex];
      if (!track?.url) return false;
      if (audio.dataset.trackIndex === String(state.trackIndex) && audio.getAttribute('src')) return true;

      const restoreTime = pendingRestoreTime;
      pendingRestoreTime = 0;
      if (restoreTime > 0) {
        audio.addEventListener('loadedmetadata', () => {
          if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
          audio.currentTime = Math.min(restoreTime, Math.max(audio.duration - 0.25, 0));
          setProgress(audio.currentTime / audio.duration);
        }, { once: true });
      }
      audio.dataset.trackIndex = String(state.trackIndex);
      audio.src = track.url;
      return true;
    };
    const safePlay = async () => {
      if (!ensureAudioSource()) {
        toast('当前曲目缺少音频地址');
        return;
      }
      try {
        await audio.play();
      } catch (error) {
        console.warn('[Sujing] audio play blocked', error);
        writeMusicState({ playing: false });
        toast('浏览器阻止了自动播放，请再点一次播放');
      }
    };
    audio.addEventListener('error', () => {
      writeMusicState({ playing: false });
      toast('音频加载失败，请检查曲目地址');
    });
    const play = async () => {
      if (audio.paused) await safePlay();
      else {
        audio.pause();
        persistMusicState({ playing: false });
      }
    };
    const seekFromEvent = (event) => {
      if (!audio.duration) return;
      const rect = progress.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      audio.currentTime = ratio * audio.duration;
      setProgress(ratio);
      persistMusicState();
    };

    const saved = readMusicState();
    const startIndex = Number.isInteger(saved?.trackIndex) ? saved.trackIndex : 0;
    pendingRestoreTime = Number.isFinite(saved?.currentTime) && saved.currentTime > 0
      ? saved.currentTime
      : 0;
    setTrack(startIndex, { resetTime: false });
    if (saved?.panelOpen) setMusicOpen(true);
    if (saved?.playing) {
      window.setTimeout(() => { safePlay(); }, 0);
    }

    playButton.addEventListener('click', play);
    listButton?.addEventListener('click', () => {
      setListOpen(!player.classList.contains('list-open'));
    });
    trackButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const index = Number(button.dataset.trackIndex);
        if (index === state.trackIndex && !audio.paused) {
          audio.pause();
          return;
        }
        if (index === state.trackIndex) {
          safePlay();
          return;
        }
        setTrack(index);
        safePlay();
      });
    });
    player.querySelector('[data-music="prev"]').addEventListener('click', () => {
      setTrack(state.trackIndex - 1);
      safePlay();
    });
    player.querySelector('[data-music="next"]').addEventListener('click', () => {
      setTrack(state.trackIndex + 1);
      safePlay();
    });
    audio.addEventListener('play', () => {
      playButton.innerHTML = '<i class="fas fa-pause" aria-hidden="true"></i>';
      player.classList.add('is-playing');
      syncPlaylistActive();
      persistMusicState({ playing: true });
    });
    audio.addEventListener('pause', () => {
      playButton.innerHTML = '<i class="fas fa-play" aria-hidden="true"></i>';
      player.classList.remove('is-playing');
      syncPlaylistActive();
      persistMusicState({ playing: false });
    });
    audio.addEventListener('ended', () => {
      setTrack(state.trackIndex + 1);
      safePlay();
    });
    audio.addEventListener('timeupdate', () => {
      setProgress(audio.duration ? audio.currentTime / audio.duration : 0);
      if (state.musicPersistTimer) return;
      state.musicPersistTimer = window.setTimeout(() => {
        state.musicPersistTimer = null;
        if (!audio.paused) persistMusicState({ playing: true });
      }, 1000);
    });
    progress.addEventListener('pointerdown', (event) => {
      progress.setPointerCapture?.(event.pointerId);
      seekFromEvent(event);
    });
    progress.addEventListener('pointermove', (event) => {
      if (event.buttons !== 1) return;
      seekFromEvent(event);
    });
    window.addEventListener('pagehide', () => {
      persistMusicState({
        playing: !audio.paused,
        panelOpen: player.classList.contains('show')
      });
    });
    player.sujingSelectTrack = async (index) => {
      setTrack(index);
      setMusicOpen(true);
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
      container.innerHTML = '<div class="sujing-data-empty" data-sujing-reveal><span class="sujing-empty-seal" aria-hidden="true">音</span><h2>歌单整理中</h2><p>将曲目放入 <code>source/media/music/</code>，并写入 <code>music.yml</code> 后即可播放。</p></div>';
      installMotion();
      return;
    }
    container.innerHTML = `<div class="sujing-track-list">${tracks.map((track, index) => `
      <button type="button" data-track-index="${index}">
        <img src="${escapeHtml(track.cover || '/img/sujing-icon-full-512.png')}" alt="" loading="lazy">
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

  const installColumnsPage = async () => {
    const root = document.querySelector('[data-sujing-columns], [data-sujing-column-page]');
    if (!root || root.dataset.ready) return;
    root.dataset.ready = 'true';

    const data = await loadSiteData();
    const columns = Array.isArray(data.columns) ? data.columns : [];
    const posts = Array.isArray(data.posts) ? data.posts : [];
    const normalize = (value) => String(value || '').trim().toLocaleLowerCase('zh-CN');
    const currentSlug = String(root.dataset.columnSlug || '').trim().toLocaleLowerCase('en-US');
    const status = root.querySelector('[data-sujing-column-status]');
    const stage = root.querySelector('[data-sujing-column-stage]');
    let qInput = root.querySelector('[data-sujing-column-q]');
    let clearBtn = root.querySelector('[data-sujing-column-clear]');

    // 兼容已经生成好的旧页面：没有检索框就补一个，不必重新生成整站
    if (!qInput && stage) {
      const toolbar = document.createElement('section');
      toolbar.className = 'sujing-column-toolbar';
      toolbar.setAttribute('data-sujing-reveal', '');
      toolbar.setAttribute('aria-label', '专栏检索');
      toolbar.innerHTML = `<label class="sujing-archive-search">
        <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
        <input type="search" name="q" data-sujing-column-q placeholder="检索本专栏的标题、摘要、分类或标签" autocomplete="off" spellcheck="false">
        <button type="button" data-sujing-column-clear hidden aria-label="清除检索">清除</button>
      </label>`;
      stage.parentNode.insertBefore(toolbar, stage);
      qInput = toolbar.querySelector('[data-sujing-column-q]');
      clearBtn = toolbar.querySelector('[data-sujing-column-clear]');
    }

    const params = new URLSearchParams(window.location.search);
    let query = params.get('q') || '';
    if (qInput) qInput.value = query;

    const matches = (post, column) => {
      const values = [...(post.categories || []), ...(post.tags || [])].map(normalize);
      return values.includes(normalize(column.name));
    };
    const matchesQuery = (post) => {
      const q = normalize(query);
      if (!q) return true;
      const haystack = normalize([
        post.title,
        post.description,
        ...(post.categories || []),
        ...(post.tags || []),
        post.date
      ].join(' '));
      return q.split(/\s+/).filter(Boolean).every((token) => haystack.includes(token));
    };

    const syncUrl = () => {
      const next = new URLSearchParams(window.location.search);
      const trimmed = query.trim();
      if (trimmed) next.set('q', trimmed);
      else next.delete('q');
      const qs = next.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    };

    const renderCards = (list) => list.map((post) => `
      <a class="sujing-column-card" href="${escapeHtml(post.path)}" data-sujing-reveal>
        <span class="sujing-column-card-media"><img src="${escapeHtml(post.cover || '/img/sujing-icon-full-512.png')}" alt="" loading="lazy" width="480" height="300"></span>
        <span class="sujing-column-card-body"><time datetime="${escapeHtml(post.date)}">${escapeHtml(formatDate(post.date))}</time><strong>${escapeHtml(post.title || '未命名')}</strong>${post.description ? `<em>${escapeHtml(post.description)}</em>` : ''}</span>
      </a>`).join('');

    if (!stage || !status) {
      const hash = window.location.hash.replace(/^#/, '').trim().toLocaleLowerCase('en-US');
      if (hash && columns.some((column) => column.slug === hash)) {
        navigateTo(`/columns/${encodeURIComponent(hash)}/`);
        return;
      }
      root.setAttribute('aria-busy', 'false');
      installMotion();
      return;
    }

    const render = () => {
      const column = columns.find((item) => item.slug === currentSlug);
      if (!column) {
        status.textContent = '暂无可用专栏';
        stage.innerHTML = '<div class="sujing-data-empty"><span class="sujing-empty-seal" aria-hidden="true">空</span><h2>专栏配置为空</h2><p>请在 source/_data/columns.yml 中配置专栏。</p></div>';
        root.setAttribute('aria-busy', 'false');
        return;
      }
      const baseList = posts.filter((post) => matches(post, column));
      const list = baseList.filter(matchesQuery);
      const trimmed = query.trim();
      status.textContent = trimmed
        ? `${column.name} · 检索 ${list.length} / ${baseList.length} 篇`
        : `${column.name} · ${list.length} 篇`;
      if (qInput) qInput.value = query;
      if (clearBtn) clearBtn.hidden = !trimmed;
      const empty = trimmed
        ? '<div class="sujing-data-empty"><span class="sujing-empty-seal" aria-hidden="true">寻</span><h2>没有匹配的文章</h2><p>换个关键词，或清空检索查看这个专栏的全部文章。</p></div>'
        : '<div class="sujing-data-empty"><span class="sujing-empty-seal" aria-hidden="true">空</span><h2>这个专栏还没有文章</h2><p>给文章添加对应的分类或标签后，它会自动出现在这里。</p></div>';
      stage.innerHTML = `<header class="sujing-column-stage-head"><div><p class="sujing-kicker">${escapeHtml(column.name)}</p><h2>文章索引</h2></div><span>${list.length} 篇</span></header>${list.length ? `<div class="sujing-columns-grid">${renderCards(list)}</div>` : empty}`;
      root.setAttribute('aria-busy', 'false');
      installMotion();
    };

    let searchTimer = 0;
    qInput?.addEventListener('input', () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => {
        query = qInput.value;
        syncUrl();
        render();
      }, 120);
    });
    qInput?.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      query = '';
      qInput.value = '';
      syncUrl();
      render();
    });
    clearBtn?.addEventListener('click', () => {
      query = '';
      if (qInput) {
        qInput.value = '';
        qInput.focus();
      }
      syncUrl();
      render();
    });

    render();
  };

  const installArchivePage = async () => {
    const root = document.querySelector('[data-sujing-archive]');
    if (!root || root.dataset.ready) return;
    root.dataset.ready = 'true';

    const stage = root.querySelector('[data-sujing-archive-stage]');
    const status = root.querySelector('[data-sujing-archive-status]');
    const totalEl = root.querySelector('[data-sujing-archive-total]');
    const qInput = root.querySelector('[data-sujing-archive-q]');
    const clearBtn = root.querySelector('[data-sujing-archive-clear]');
    const catBox = root.querySelector('[data-sujing-archive-categories]');
    const tagBox = root.querySelector('[data-sujing-archive-tags]');
    const viewButtons = [...root.querySelectorAll('[data-sujing-archive-view]')];
    if (!stage || !qInput || !catBox || !tagBox) return;

    const params = new URLSearchParams(window.location.search);
    let query = params.get('q') || '';
    let category = params.get('cat') || '';
    let tag = params.get('tag') || '';
    let view = params.get('view') === 'matrix' ? 'matrix' : 'timeline';
    let searchTimer = 0;

    const data = await loadSiteData();
    const posts = Array.isArray(data.posts) ? data.posts : [];
    const categories = Array.isArray(data.categories) ? data.categories : [];
    const tags = Array.isArray(data.tags) ? data.tags : [];

    if (totalEl) totalEl.textContent = String(posts.length);
    qInput.value = query;
    root.setAttribute('aria-busy', 'false');

    const syncUrl = () => {
      const next = new URLSearchParams();
      const trimmed = query.trim();
      if (trimmed) next.set('q', trimmed);
      if (category) next.set('cat', category);
      if (tag) next.set('tag', tag);
      if (view !== 'timeline') next.set('view', view);
      const qs = next.toString();
      const url = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash || ''}`;
      window.history.replaceState(null, '', url);
    };

    const renderChips = (box, items, selected) => {
      const chips = [
        `<button type="button" class="sujing-archive-chip${!selected ? ' is-active' : ''}" data-value="" aria-pressed="${selected ? 'false' : 'true'}">全部</button>`,
        ...items.map((item) => {
          const active = selected === item.name;
          return `<button type="button" class="sujing-archive-chip${active ? ' is-active' : ''}" data-value="${escapeHtml(item.name)}" aria-pressed="${active ? 'true' : 'false'}">${escapeHtml(item.name)}<em>${Number(item.count) || 0}</em></button>`;
        })
      ];
      box.innerHTML = chips.join('');
    };

    const postMetaLine = (post) => {
      const cats = (post.categories || []).slice(0, 2).map((name) => escapeHtml(name)).join(' · ');
      const tagsLine = (post.tags || []).slice(0, 3).map((name) => `#${escapeHtml(name)}`).join(' ');
      return [cats, tagsLine].filter(Boolean).join('  ·  ');
    };

    const coverOf = (post) => escapeHtml(post.cover || '/img/sujing-icon-full-512.png');

    const renderTimeline = (list) => {
      const groups = new Map();
      list.forEach((post) => {
        const year = String(new Date(post.date).getFullYear() || '未知');
        if (!groups.has(year)) groups.set(year, []);
        groups.get(year).push(post);
      });
      const years = [...groups.keys()].sort((a, b) => b.localeCompare(a));
      return `<div class="sujing-archive-timeline">${years.map((year) => `
        <section class="sujing-archive-year">
          <header class="sujing-archive-year-head">
            <span>${escapeHtml(year)}</span>
            <small>${groups.get(year).length} 篇</small>
          </header>
          <ol class="sujing-archive-year-list">
            ${groups.get(year).map((post) => `
              <li>
                <a class="sujing-archive-entry" href="${escapeHtml(post.path)}" data-sujing-reveal>
                  <time datetime="${escapeHtml(post.date)}">${escapeHtml(formatDate(post.date).slice(5) || formatDate(post.date))}</time>
                  <span class="sujing-archive-entry-body">
                    <strong>${escapeHtml(post.title || '未命名')}</strong>
                    ${post.description ? `<em>${escapeHtml(post.description)}</em>` : ''}
                    ${postMetaLine(post) ? `<small>${postMetaLine(post)}</small>` : ''}
                  </span>
                  <span class="sujing-archive-entry-cover" aria-hidden="true">
                    <img src="${coverOf(post)}" alt="" loading="lazy" width="96" height="64">
                  </span>
                </a>
              </li>`).join('')}
          </ol>
        </section>`).join('')}</div>`;
    };

    const renderMatrix = (list) => `<div class="sujing-archive-matrix">${list.map((post) => `
      <a class="sujing-archive-card" href="${escapeHtml(post.path)}" data-sujing-reveal>
        <span class="sujing-archive-card-media" aria-hidden="true">
          <img src="${coverOf(post)}" alt="" loading="lazy" width="480" height="300">
        </span>
        <span class="sujing-archive-card-body">
          <time datetime="${escapeHtml(post.date)}">${escapeHtml(formatDate(post.date))}</time>
          <strong>${escapeHtml(post.title || '未命名')}</strong>
          ${post.description ? `<em>${escapeHtml(post.description)}</em>` : ''}
          ${postMetaLine(post) ? `<small>${postMetaLine(post)}</small>` : ''}
        </span>
      </a>`).join('')}</div>`;

    const matches = (post) => {
      if (category && !(post.categories || []).includes(category)) return false;
      if (tag && !(post.tags || []).includes(tag)) return false;
      const q = query.trim().toLowerCase();
      if (!q) return true;
      const hay = [
        post.title,
        post.description,
        ...(post.categories || []),
        ...(post.tags || [])
      ].join(' ').toLowerCase();
      return hay.includes(q);
    };

    const render = () => {
      const list = posts.filter(matches);
      const parts = [];
      if (query.trim()) parts.push(`「${query.trim()}」`);
      if (category) parts.push(`分类 ${category}`);
      if (tag) parts.push(`标签 ${tag}`);
      const filterText = parts.length ? parts.join(' · ') : '全部文章';
      if (status) {
        status.textContent = list.length
          ? `${filterText} · 共 ${list.length} 篇 · ${view === 'matrix' ? '矩阵' : '时间轴'}`
          : `${filterText} · 无匹配结果`;
      }
      if (clearBtn) clearBtn.hidden = !query.trim();
      viewButtons.forEach((button) => {
        const active = button.dataset.sujingArchiveView === view;
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
        button.classList.toggle('is-active', active);
      });
      root.dataset.view = view;
      renderChips(catBox, categories, category);
      renderChips(tagBox, tags, tag);
      stage.innerHTML = list.length
        ? (view === 'matrix' ? renderMatrix(list) : renderTimeline(list))
        : '<div class="sujing-data-empty" data-sujing-reveal><span class="sujing-empty-seal" aria-hidden="true">卷</span><h2>卷宗未命中</h2><p>换个关键词，或清除分类与标签后再试。</p></div>';
      syncUrl();
      installMotion();
    };

    qInput.addEventListener('input', () => {
      query = qInput.value;
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(render, 160);
    });
    clearBtn?.addEventListener('click', () => {
      query = '';
      qInput.value = '';
      qInput.focus();
      render();
    });
    catBox.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-value]');
      if (!button) return;
      category = button.dataset.value || '';
      render();
    });
    tagBox.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-value]');
      if (!button) return;
      tag = button.dataset.value || '';
      render();
    });
    viewButtons.forEach((button) => {
      button.addEventListener('click', () => {
        view = button.dataset.sujingArchiveView === 'matrix' ? 'matrix' : 'timeline';
        render();
      });
    });

    render();
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
      document.documentElement.classList.remove('sujing-motion');
      targets.forEach((target) => target.classList.add('is-visible'));
    } else {
      try {
        if (!state.revealObserver) {
          state.revealObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
              if (!entry.isIntersecting) return;
              entry.target.classList.add('is-visible');
              state.revealObserver.unobserve(entry.target);
            });
          }, { threshold: 0.12, rootMargin: '0px 0px 120px' });
        }
        document.documentElement.classList.add('sujing-motion');
        targets.forEach((target) => state.revealObserver.observe(target));
      } catch {
        document.documentElement.classList.remove('sujing-motion');
        targets.forEach((target) => target.classList.add('is-visible'));
      }
    }

    if (reduced || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    document.querySelectorAll('[data-sujing-tilt]:not([data-sujing-tilt-ready])').forEach((element) => {
      element.dataset.sujingTiltReady = 'true';
      element.addEventListener('pointermove', (event) => {
        const rect = element.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        element.style.setProperty('--sujing-tilt-x', `${((0.5 - y) * 2.4).toFixed(2)}deg`);
        element.style.setProperty('--sujing-tilt-y', `${((x - 0.5) * 2.4).toFixed(2)}deg`);
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

  const installHeroVideo = () => {
    const hero = document.querySelector('.sujing-bento-hero');
    const video = hero?.querySelector('[data-sujing-hero-video]');
    if (!hero || !video) return;
    if (video.dataset.sujingVideoReady === 'true') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.matchMedia('(max-width: 768px), (hover: none)').matches) return;

    video.dataset.sujingVideoReady = 'true';
    video.muted = true;
    video.preload = 'auto';

    const markReady = () => {
      video.classList.add('is-ready');
    };
    const play = () => {
      const attempt = video.play();
      if (attempt && typeof attempt.catch === 'function') attempt.catch(() => {});
    };

    video.addEventListener('canplay', markReady, { once: true });
    video.addEventListener('loadeddata', markReady, { once: true });
    if (video.readyState >= 2) markReady();
    play();

    let observer = null;
    let visible = true;
    const onVisibility = () => {
      if (document.hidden) video.pause();
      else if (visible) play();
    };

    observer = ('IntersectionObserver' in window)
      ? new IntersectionObserver((entries) => {
        visible = Boolean(entries[0]?.isIntersecting);
        if (visible) play();
        else video.pause();
      }, { threshold: 0.01 })
      : null;
    observer?.observe(hero);
    document.addEventListener('visibilitychange', onVisibility);

    const cleanup = () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('pjax:send', cleanup);
      video.pause();
      video.classList.remove('is-ready');
      video.dataset.sujingVideoReady = '';
    };
    document.addEventListener('pjax:send', cleanup, { once: true });
  };

  const installHeroParallax = () => {
    const hero = document.querySelector('.sujing-bento-hero');
    const image = hero?.querySelector('img');
    if (!hero || !image || hero.dataset.sujingParallaxReady) return;
    hero.dataset.sujingParallaxReady = 'true';
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // 手机端不做视差，避免主图被额外位移/裁切
    if (window.matchMedia('(max-width: 768px), (hover: none)').matches) return;

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

  const installAmbientInk = () => {
    if (document.documentElement.dataset.sujingAmbient) return;
    document.documentElement.dataset.sujingAmbient = 'true';
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    const root = document.getElementById('web_bg') || document.documentElement;
    let frame = null;
    let nextX = 50;
    let nextY = 28;
    const paint = () => {
      frame = null;
      root.style.setProperty('--sujing-ambient-x', `${nextX.toFixed(1)}%`);
      root.style.setProperty('--sujing-ambient-y', `${nextY.toFixed(1)}%`);
    };
    window.addEventListener('pointermove', (event) => {
      nextX = (event.clientX / Math.max(window.innerWidth, 1)) * 100;
      nextY = (event.clientY / Math.max(window.innerHeight, 1)) * 100;
      if (frame !== null) return;
      frame = window.requestAnimationFrame(paint);
    }, { passive: true });
  };

  const installScrollAtmosphere = () => {
    if (document.documentElement.dataset.sujingScrollAtm) return;
    document.documentElement.dataset.sujingScrollAtm = 'true';
    const root = document.getElementById('web_bg') || document.documentElement;
    let frame = null;
    const update = () => {
      frame = null;
      const max = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      const progress = Math.min(1, Math.max(0, window.scrollY / max));
      root.style.setProperty('--sujing-scroll-shift', `${(progress * 48).toFixed(1)}px`);
    };
    window.addEventListener('scroll', () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(update);
    }, { passive: true });
    update();
  };

  const sealChars = ['溯', '境', '墨', '卷', '录'];
  let sealIndex = 0;

  const spawnSealStamp = (x, y, char) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const stamp = document.createElement('span');
    stamp.className = 'sujing-seal-stamp';
    stamp.setAttribute('aria-hidden', 'true');
    stamp.textContent = char || sealChars[sealIndex % sealChars.length];
    sealIndex += 1;
    stamp.style.left = `${x}px`;
    stamp.style.top = `${y}px`;
    stamp.addEventListener('animationend', () => stamp.remove(), { once: true });
    document.body.appendChild(stamp);
  };

  const createSealStamp = (event) => {
    if (event.button !== 0) return;
    const target = event.target.closest?.(
      '.sujing-button-primary, a.sujing-bento-latest, .sujing-bento-destinations > a, .sujing-now-strip, #nav .nav-site-title'
    );
    if (!target) return;
    const char = target.matches('#nav .nav-site-title') ? '溯' : undefined;
    spawnSealStamp(event.clientX, event.clientY, char);
  };

  const installGalleryParallax = () => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    document.querySelectorAll('.sujing-bento-gallery-grid > a:not([data-sujing-img-parallax])').forEach((link) => {
      link.dataset.sujingImgParallax = 'true';
      link.addEventListener('pointermove', (event) => {
        const rect = link.getBoundingClientRect();
        const y = (event.clientY - rect.top) / Math.max(rect.height, 1);
        link.style.setProperty('--sujing-img-shift', `${((0.5 - y) * 6).toFixed(2)}%`);
      });
      link.addEventListener('pointerleave', () => {
        link.style.removeProperty('--sujing-img-shift');
      });
    });
  };

  const installPageLeaveInk = () => {
    if (document.documentElement.dataset.sujingLeaveInk) return;
    document.documentElement.dataset.sujingLeaveInk = 'true';

    document.addEventListener('pjax:send', () => {
      document.body.classList.add('sujing-leaving');
      closeAnnotations();
    });
    document.addEventListener('pjax:complete', () => {
      document.body.classList.remove('sujing-leaving');
    });

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    document.addEventListener('click', (event) => {
      // Soft nav (pjax) keeps the music player alive — do not force a full reload.
      if (window.pjax) return;
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target.closest?.('a[href]');
      if (!link) return;
      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return;
      if (link.target === '_blank' || link.hasAttribute('download')) return;
      if (link.closest('#sujing-command')) return;
      if (link.closest('#sujing-music')) return;

      let url;
      try { url = new URL(link.href, window.location.href); } catch { return; }
      if (url.origin !== window.location.origin) return;
      if (`${url.pathname}${url.search}${url.hash}` === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;

      event.preventDefault();
      document.body.classList.add('sujing-leaving');
      window.setTimeout(() => { window.location.href = url.href; }, 180);
    });
  };

  const rippleSelector = [
    '#nav .site-page',
    '.sujing-button',
    '.sujing-now-strip',
    'a.sujing-bento-card',
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

    document.addEventListener('pointerdown', createInteractionRipple, { passive: true });
    document.addEventListener('pointerdown', createSealStamp, { passive: true });

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

      const music = document.getElementById('sujing-music');
      if (music?.classList.contains('show') && !event.target.closest('#sujing-music')) {
        closeMusic();
      }
    });

    document.addEventListener('keydown', (event) => {
      const target = event.target;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
      const command = document.getElementById('sujing-command');
      const commandOpen = command?.classList.contains('show');
      const dropdownOpen = document.querySelector('#nav .menus_item.is-open');
      const musicOpen = document.getElementById('sujing-music')?.classList.contains('show');

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
      if (event.key === 'Escape' && musicOpen) {
        event.preventDefault();
        closeMusic();
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

  const STATS_ENDPOINT = 'https://stats.sujing.dev/v1/hit';
  // 阅读人数先累计，达到阈值后再显示，避免新统计刚上线时出现“43 次 · 1 人”的误导
  const PAGE_UV_DISPLAY_MIN = 10;

  const formatStatNumber = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return '—';
    return Math.floor(number).toLocaleString('zh-CN');
  };

  const normalizeStatsPath = (pathname = window.location.pathname) => {
    let path = String(pathname || '/').split('?')[0].split('#')[0];
    // 与 Worker 对齐：最多两轮百分号解码，避免双重编码路径分裂计数
    for (let i = 0; i < 2; i += 1) {
      if (!path.includes('%')) break;
      try {
        const decoded = decodeURIComponent(path);
        if (decoded === path) break;
        path = decoded;
      } catch {
        break;
      }
    }
    if (!path.startsWith('/')) path = `/${path}`;
    path = path.replace(/\/{2,}/g, '/');
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    return path || '/';
  };

  const isLocalPreviewHost = () => (
    location.hostname === '127.0.0.1' || location.hostname === 'localhost'
  );

  const ensurePostStatsMount = () => {
    const meta = document.querySelector('#post-info #post-meta');
    if (!meta) return null;
    let mount = meta.querySelector('[data-sujing-post-stats]');
    if (mount) return mount;
    const host = meta.querySelector('.meta-secondline') || meta;
    mount = document.createElement('span');
    mount.className = 'sujing-post-stats';
    mount.dataset.sujingPostStats = 'true';
    mount.setAttribute('aria-label', '本文阅读次数');
    mount.innerHTML = '<i class="sujing-stat-mark" aria-hidden="true"></i><em>阅读</em><strong data-sujing-stat="pagePv">—</strong><span class="sujing-stat-unit">次</span><span class="sujing-stat-uv" data-sujing-stat-uv hidden><span class="sujing-stat-divider" aria-hidden="true">·</span><strong data-sujing-stat="pageUv">—</strong><span class="sujing-stat-unit">人</span></span>';
    if (host.classList?.contains('meta-secondline') && host.childNodes.length) {
      const sep = document.createElement('span');
      sep.className = 'post-meta-separator';
      sep.textContent = '|';
      host.appendChild(sep);
    }
    host.appendChild(mount);
    return mount;
  };

  const paintStats = (data) => {
    document.querySelectorAll('[data-sujing-stat="siteUv"]').forEach((node) => {
      node.textContent = formatStatNumber(data.siteUv);
    });
    document.querySelectorAll('[data-sujing-stat="sitePv"]').forEach((node) => {
      node.textContent = formatStatNumber(data.sitePv);
    });
    document.querySelectorAll('[data-sujing-stat="pagePv"]').forEach((node) => {
      node.textContent = formatStatNumber(data.pagePv);
    });
    document.querySelectorAll('[data-sujing-stat="pageUv"]').forEach((node) => {
      node.textContent = formatStatNumber(data.pageUv);
    });
    const pageUv = Number(data.pageUv);
    document.querySelectorAll('[data-sujing-stat-uv]').forEach((node) => {
      node.hidden = !Number.isFinite(pageUv) || pageUv < PAGE_UV_DISPLAY_MIN;
    });
    document.querySelectorAll('[data-sujing-site-stats], [data-sujing-post-stats]').forEach((node) => {
      node.classList.add('is-ready');
    });
  };

  const installSiteStats = async () => {
    ensurePostStatsMount();
    // 本机预览不计线上访问量，避免开发刷脏数据
    if (isLocalPreviewHost()) {
      document.querySelectorAll('[data-sujing-site-stats], [data-sujing-post-stats]').forEach((node) => {
        node.classList.add('is-local');
        node.setAttribute('title', '本机预览不计入线上统计');
      });
      return;
    }
    const path = normalizeStatsPath();
    if (state.statsPath === path && state.statsPending) return;
    state.statsPath = path;
    state.statsPending = true;
    try {
      const response = await fetch(STATS_ENDPOINT, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      });
      if (!response.ok) throw new Error(`stats ${response.status}`);
      const data = await response.json();
      paintStats(data);
      document.querySelectorAll('[data-sujing-site-stats], [data-sujing-post-stats]').forEach((node) => {
        node.classList.remove('is-error');
      });
    } catch (error) {
      console.warn('[Sujing] site stats unavailable', error);
      document.querySelectorAll('[data-sujing-site-stats], [data-sujing-post-stats]').forEach((node) => {
        node.classList.add('is-error');
      });
    } finally {
      state.statsPending = false;
    }
  };

  const COMMENTS_ENDPOINT = 'https://comments.sujing.dev/v1/comments';
  const COMMENT_PROFILE_KEY = 'sujing-comment-profile';
  const COMMENT_MAX = 800;
  const COMMENT_MAX_REPLY_DEPTH = 2;

  const readCommentProfile = () => {
    try {
      const raw = window.localStorage.getItem(COMMENT_PROFILE_KEY)
        || window.sessionStorage.getItem(COMMENT_PROFILE_KEY)
        || '{}';
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  };

  const writeCommentProfile = (profile) => {
    try {
      window.localStorage.setItem(COMMENT_PROFILE_KEY, JSON.stringify(profile));
      window.sessionStorage.removeItem(COMMENT_PROFILE_KEY);
    } catch {
      // ignore
    }
  };

  const isValidCommentEmail = (value) => {
    if (!value) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  };

  const setCommentFormError = (form, message) => {
    const box = form?.querySelector('[data-sujing-comment-error]');
    if (!box) return;
    if (!message) {
      box.hidden = true;
      box.textContent = '';
      return;
    }
    box.hidden = false;
    box.textContent = message;
  };

  const formatCommentTime = (stamp) => {
    const date = new Date(Number(stamp));
    if (Number.isNaN(date.getTime())) return '';
    const diff = Date.now() - date.getTime();
    if (diff < 60_000) return '刚刚';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
    if (diff < 86_400_000 * 7) return `${Math.floor(diff / 86_400_000)} 天前`;
    return formatDate(date.toISOString());
  };

  // 有图后往 /img/avatars/ 放文件，并在 index.json 里写路径；非空则按昵称稳定随机取一张
  let commentAvatarLibrary = null;
  const loadCommentAvatarLibrary = async () => {
    if (commentAvatarLibrary) return commentAvatarLibrary;
    try {
      const response = await fetch(`/img/avatars/index.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('no avatar library');
      const data = await response.json();
      commentAvatarLibrary = Array.isArray(data)
        ? data.map((item) => String(item || '').trim()).filter(Boolean)
        : [];
    } catch {
      commentAvatarLibrary = [];
    }
    return commentAvatarLibrary;
  };

  const nicknameInitial = (nickname) => {
    const text = String(nickname || '溯').trim();
    if (!text) return '溯';
    return [...text][0] || '溯';
  };

  const hashSeed = (value) => {
    let hash = 2166136261;
    const input = String(value || '');
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  };

  const pickLibraryAvatar = (library, seed) => {
    if (!library?.length) return '';
    return library[hashSeed(seed) % library.length];
  };

  const renderCommentAvatar = (comment, library) => {
    const seed = `${comment.nickname || ''}|${comment.id || ''}`;
    const fromLib = pickLibraryAvatar(library, seed);
    if (fromLib) {
      return `<img class="sujing-comment-avatar no-lightbox nolazyload" src="${escapeHtml(fromLib)}" alt="" width="48" height="48" loading="lazy">`;
    }
    const initial = nicknameInitial(comment.nickname);
    const tone = hashSeed(seed) % 3;
    return `<span class="sujing-comment-avatar is-initial tone-${tone}" aria-hidden="true">${escapeHtml(initial)}</span>`;
  };

  const commentsAnchor = () => {
    if (document.querySelector('.post #article-container')) {
      return document.querySelector('.post-copyright')
        || document.querySelector('#post-comment')
        || document.querySelector('.post #article-container');
    }
    if (document.querySelector('.sujing-about')) {
      return document.querySelector('.sujing-about');
    }
    return null;
  };

  const buildCommentTree = (comments) => {
    const nodes = new Map();
    const roots = [];
    comments.forEach((comment) => {
      nodes.set(comment.id, { ...comment, children: [] });
    });
    nodes.forEach((node) => {
      if (node.parentId && nodes.has(node.parentId)) nodes.get(node.parentId).children.push(node);
      else roots.push(node);
    });
    return roots;
  };

  const renderCommentItem = (comment, depth = 0, library = []) => {
    const website = comment.website
      ? `<a class="sujing-comment-site" href="${escapeHtml(comment.website)}" target="_blank" rel="noopener noreferrer nofollow">主页</a>`
      : '';
    const children = (comment.children || []).map((child) => renderCommentItem(child, depth + 1, library)).join('');
    const canReply = depth < COMMENT_MAX_REPLY_DEPTH;
    const replyBtn = canReply
      ? `<button type="button" class="sujing-comment-reply" data-comment-reply="${escapeHtml(comment.id)}" data-comment-name="${escapeHtml(comment.nickname)}">回复</button>`
      : '';
    return `
      <article class="sujing-comment-item" data-comment-id="${escapeHtml(comment.id)}" data-depth="${depth}" data-sujing-reveal>
        ${renderCommentAvatar(comment, library)}
        <div class="sujing-comment-body">
          <header>
            <strong>${escapeHtml(comment.nickname)}</strong>
            ${website}
            <time datetime="${new Date(comment.createdAt).toISOString()}">${escapeHtml(formatCommentTime(comment.createdAt))}</time>
          </header>
          <p class="sujing-comment-text">${escapeHtml(comment.content)}</p>
          ${replyBtn}
          ${children ? `<div class="sujing-comment-children">${children}</div>` : ''}
        </div>
      </article>`;
  };

  const renderCommentsList = async (root, comments) => {
    const list = root.querySelector('[data-sujing-comments-list]');
    const empty = root.querySelector('[data-sujing-comments-empty]');
    const count = root.querySelector('[data-sujing-comments-count]');
    if (count) count.textContent = String(comments.length);
    if (!comments.length) {
      if (list) list.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    if (list) {
      const library = await loadCommentAvatarLibrary();
      list.innerHTML = buildCommentTree(comments).map((item) => renderCommentItem(item, 0, library)).join('');
      installMotion();
    }
  };

  const bindCommentForm = (root, { path, onSubmit }) => {
    const form = root.querySelector('[data-sujing-comment-form]');
    if (!form || form.dataset.bound) return;
    form.dataset.bound = 'true';
    const profile = readCommentProfile();
    const nickname = form.querySelector('[name="nickname"]');
    const email = form.querySelector('[name="email"]');
    const website = form.querySelector('[name="website"]');
    const content = form.querySelector('[name="content"]');
    const counter = form.querySelector('[data-sujing-comment-count]');
    const parentInput = form.querySelector('[name="parentId"]');
    const replyHint = form.querySelector('[data-sujing-reply-hint]');
    const cancelReply = form.querySelector('[data-sujing-reply-cancel]');
    const submit = form.querySelector('[type="submit"]');

    if (nickname && profile.nickname) nickname.value = profile.nickname;
    if (email && profile.email) email.value = profile.email;
    if (website && profile.website) {
      website.value = String(profile.website).replace(/^https?:\/\//i, '');
    }

    const syncCounter = () => {
      if (!content || !counter) return;
      const length = content.value.length;
      counter.textContent = `${length} / ${COMMENT_MAX}`;
      counter.dataset.tone = length > COMMENT_MAX - 40 ? 'warn' : 'ok';
    };
    content?.addEventListener('input', () => {
      setCommentFormError(form, '');
      syncCounter();
    });
    [nickname, email, website].forEach((input) => {
      input?.addEventListener('input', () => setCommentFormError(form, ''));
    });
    syncCounter();

    const clearReply = () => {
      if (parentInput) parentInput.value = '';
      if (replyHint) {
        replyHint.hidden = true;
        replyHint.querySelector('strong').textContent = '';
      }
      form.classList.remove('is-replying');
    };

    cancelReply?.addEventListener('click', clearReply);

    root.addEventListener('click', (event) => {
      const button = event.target.closest?.('[data-comment-reply]');
      if (!button || !root.contains(button)) return;
      if (form.dataset.disabled === 'true') return;
      if (parentInput) parentInput.value = button.dataset.commentReply || '';
      if (replyHint) {
        replyHint.hidden = false;
        replyHint.querySelector('strong').textContent = button.dataset.commentName || '';
      }
      form.classList.add('is-replying');
      content?.focus();
      form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (submit?.disabled || form.dataset.disabled === 'true') return;
      setCommentFormError(form, '');
      const rawWebsite = website?.value.trim() || '';
      const payload = {
        path,
        nickname: nickname?.value.trim() || '',
        email: email?.value.trim() || '',
        website: rawWebsite && !/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(rawWebsite)
          ? `https://${rawWebsite}`
          : rawWebsite,
        content: content?.value.replace(/\s+$/g, '').replace(/^\s+/g, '') || '',
        parentId: parentInput?.value || '',
        company: form.querySelector('[name="company"]')?.value || ''
      };
      if (payload.nickname.length < 1) {
        setCommentFormError(form, '请填写昵称');
        nickname?.focus();
        return;
      }
      if (payload.content.length < 1) {
        setCommentFormError(form, '请写一点想说的话');
        content?.focus();
        return;
      }
      if (!isValidCommentEmail(payload.email)) {
        setCommentFormError(form, '邮箱格式不太对');
        email?.focus();
        return;
      }
      submit.disabled = true;
      submit.classList.add('is-loading');
      try {
        await onSubmit(payload);
        writeCommentProfile({
          nickname: payload.nickname,
          email: payload.email,
          website: payload.website
        });
        if (content) content.value = '';
        clearReply();
        syncCounter();
        toast('留言已送出');
      } catch (error) {
        const code = error?.message || '';
        const message = ({
          rate_limited: '发送太频繁，稍后再试',
          invalid_website: '主页地址不太对，可填域名或完整链接',
          invalid_email: '邮箱格式不太对',
          invalid_nickname: '请填写昵称',
          invalid_content: '请写一点想说的话',
          invalid_path: '当前页面无法留言',
          invalid_parent: '回复目标已失效，请取消回复后重试',
          spam_links: '链接有点多，精简后再发',
          reply_too_deep: '回复层级已到上限',
          ignored: '发送未完成，请重试'
        })[code] || '留言发送失败，请稍后再试';
        setCommentFormError(form, message);
      } finally {
        submit.disabled = false;
        submit.classList.remove('is-loading');
      }
    });
  };

  const installComments = async () => {
    const anchor = commentsAnchor();
    if (!anchor) return;
    // 本机预览不读写线上留言，避免开发环境污染 / CORS 半通状态
    if (isLocalPreviewHost()) {
      const root = document.createElement('section');
      root.className = 'sujing-comments is-local';
      root.dataset.sujingComments = 'true';
      root.innerHTML = `
        <header class="sujing-comments-head" data-sujing-reveal>
          <div>
            <p class="sujing-kicker">留言</p>
            <h2 id="sujing-comments-title">写在文后</h2>
          </div>
        </header>
        <div class="sujing-comments-empty" data-sujing-comments-empty>
          <span class="sujing-empty-seal" aria-hidden="true">言</span>
          <strong>本机预览不加载留言</strong>
          <p>留言接口只在线上域名可用；本地写作与预览不受影响。</p>
        </div>`;
      document.querySelectorAll('[data-sujing-comments]').forEach((node) => node.remove());
      anchor.insertAdjacentElement('afterend', root);
      installMotion();
      return;
    }
    const path = normalizeStatsPath();
    const existing = document.querySelector('[data-sujing-comments]');
    if (existing?.dataset.path === path && existing.isConnected) return;
    document.querySelectorAll('[data-sujing-comments]').forEach((node) => node.remove());

    const root = document.createElement('section');
    root.className = 'sujing-comments';
    root.dataset.sujingComments = 'true';
    root.dataset.path = path;
    root.setAttribute('aria-labelledby', 'sujing-comments-title');
    anchor.insertAdjacentElement('afterend', root);
    root.innerHTML = `
      <header class="sujing-comments-head" data-sujing-reveal>
        <div>
          <p class="sujing-kicker">留言</p>
          <h2 id="sujing-comments-title">写在文后</h2>
        </div>
        <p class="sujing-comments-meta">共 <strong data-sujing-comments-count>0</strong> 条</p>
      </header>
      <form class="sujing-comment-form" data-sujing-comment-form data-sujing-reveal novalidate>
        <div class="sujing-comment-reply-hint" data-sujing-reply-hint hidden>
          正在回复 <strong></strong>
          <button type="button" data-sujing-reply-cancel>取消</button>
        </div>
        <div class="sujing-comment-fields">
          <label><span>昵称</span><input name="nickname" type="text" maxlength="24" autocomplete="nickname" required placeholder="怎么称呼你"></label>
          <label><span>邮箱</span><input name="email" type="email" maxlength="80" autocomplete="email" placeholder="可选，用于头像"></label>
          <label><span>主页</span><input name="website" type="text" maxlength="120" autocomplete="url" inputmode="url" placeholder="可选"></label>
        </div>
        <label class="sujing-comment-content">
          <span>内容</span>
          <textarea name="content" rows="4" maxlength="${COMMENT_MAX}" required placeholder="欢迎留下想法、补充或疑问。"></textarea>
        </label>
        <input name="parentId" type="hidden" value="">
        <input name="company" type="text" tabindex="-1" autocomplete="off" aria-hidden="true" class="sujing-comment-honeypot" value="">
        <p class="sujing-comment-error" data-sujing-comment-error hidden></p>
        <div class="sujing-comment-actions">
          <span data-sujing-comment-count>0 / ${COMMENT_MAX}</span>
          <button class="sujing-button sujing-button-primary" type="submit"><span>送出留言</span><i class="fas fa-feather-pointed" aria-hidden="true"></i></button>
        </div>
      </form>
      <div class="sujing-comments-empty" data-sujing-comments-empty hidden>
        <span class="sujing-empty-seal" aria-hidden="true">言</span>
        <strong>还没有留言</strong>
        <p>你也可以成为第一条。短一点也很好。</p>
      </div>
      <div class="sujing-comments-list" data-sujing-comments-list></div>`;

    const form = root.querySelector('[data-sujing-comment-form]');
    const setFormDisabled = (disabled, reason) => {
      if (!form) return;
      form.dataset.disabled = disabled ? 'true' : 'false';
      form.querySelectorAll('input, textarea, button').forEach((node) => {
        if (node.classList.contains('sujing-comment-honeypot')) return;
        node.disabled = disabled;
      });
      if (disabled) {
        form.classList.add('is-disabled');
        setCommentFormError(form, reason || '');
      } else {
        form.classList.remove('is-disabled');
        setCommentFormError(form, '');
      }
    };

    const load = async () => {
      const response = await fetch(`${COMMENTS_ENDPOINT}?path=${encodeURIComponent(path)}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error(`comments ${response.status}`);
      const data = await response.json();
      await renderCommentsList(root, Array.isArray(data.comments) ? data.comments : []);
    };

    bindCommentForm(root, {
      path,
      onSubmit: async (payload) => {
        const response = await fetch(COMMENTS_ENDPOINT, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await response.json().catch(() => ({}));
        if (data.ignored || data.ok === false) throw new Error('ignored');
        if (!response.ok) throw new Error(data.error || 'failed');
        await load();
      }
    });

    try {
      await load();
    } catch (error) {
      console.warn('[Sujing] comments unavailable', error);
      const empty = root.querySelector('[data-sujing-comments-empty]');
      if (empty) {
        empty.hidden = false;
        const local = location.hostname === '127.0.0.1' || location.hostname === 'localhost';
        empty.querySelector('strong').textContent = local ? '本机预览不加载留言' : '留言暂不可用';
        empty.querySelector('p').textContent = local
          ? '留言接口只在线上域名可用；本地写作与预览不受影响。'
          : '接口稍后恢复，先把想说的记下来也好。';
      }
      const local = location.hostname === '127.0.0.1' || location.hostname === 'localhost';
      setFormDisabled(true, local ? '本机预览不可发送留言' : '留言接口暂不可用，稍后再试');
    }
    installMotion();
  };

  const init = () => {
    installBindings();
    closeCommand(false);
    installNavCommand();
    installCurrentNavigation();
    installNavDropdowns();
    installStarfield();
    installHomeIntro();
    installHomeContent();
    installArticlesIntro();
    installPostAtmosphere();
    installPostTools();
    installNotesPage();
    installGalleryPage();
    installMusicPage();
    installColumnsPage();
    installArchivePage();
    installAnnotations();
    ensureMusicPlayer();
    installReadingProgress();
    installMotion();
    installHeroParallax();
    installHeroVideo();
    installMagneticButtons();
    installAmbientInk();
    installScrollAtmosphere();
    installGalleryParallax();
    installPageLeaveInk();
    installSiteStats();
    installComments();
    updateReadingProgress();
  };

  document.addEventListener('DOMContentLoaded', init);
  document.addEventListener('pjax:complete', init);
})();
