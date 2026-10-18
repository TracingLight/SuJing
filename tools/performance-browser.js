async (page) => {
  const { origin, label } = await page.evaluate(() => ({ origin: location.origin, label: new URL(location.href).searchParams.get('perf') || 'baseline' }));
  await page.goto('about:blank');
  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 900 } });
  page = await context.newPage();
  const output = 'output/playwright';
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    window.__perf = { lcp: 0, cls: 0, longTasks: [], interactions: [] };
    for (const type of ['largest-contentful-paint', 'layout-shift', 'longtask', 'event']) {
      try {
        new PerformanceObserver(list => list.getEntries().forEach(e => {
          if (type === 'largest-contentful-paint') window.__perf.lcp = e.startTime;
          if (type === 'layout-shift' && !e.hadRecentInput) window.__perf.cls += e.value;
          if (type === 'longtask') window.__perf.longTasks.push(e.duration);
          if (type === 'event' && e.interactionId) window.__perf.interactions.push(e.duration);
        })).observe({ type, buffered: true, durationThreshold: 16 });
      } catch {}
    }
  });
  const cdp = await page.context().newCDPSession(page);
  const sample = async () => page.evaluate(async () => {
    const canvas = document.querySelector('#sujing-starfield');
    const ctx = canvas?.getContext('2d');
    const original = ctx?.clearRect;
    const draws = [];
    if (ctx) ctx.clearRect = function (...args) { draws.push(performance.now()); return original.apply(this, args); };
    const frames = [];
    let last;
    await new Promise(resolve => {
      const start = performance.now();
      const tick = t => {
        if (last) frames.push(t - last);
        last = t;
        if (t - start < 1200) requestAnimationFrame(tick); else resolve();
      };
      requestAnimationFrame(tick);
    });
    if (ctx) ctx.clearRect = original;
    const intervals = draws.slice(1).map((t, i) => t - draws[i]);
    frames.sort((a, b) => a - b);
    return { ...window.__perf, drawFps: draws.length / 1.2, frameP95: frames[Math.floor(frames.length * .95)], drawOver33: intervals.filter(t => t > 33).length / Math.max(1, intervals.length), resources: performance.getEntriesByType('resource').map(r => ({ url: r.name, bytes: r.transferSize, duration: r.duration })), canvas: ctx?.getContextAttributes() };
  });
  await page.goto(origin);
  const article = await page.locator('[data-sujing-latest-card]').getAttribute('href');
  const results = [];
  for (const path of ['/', '/articles/', article, '/archives/', '/gallery/', '/music/', '/about/']) {
    for (let run = 0; run < 3; run++) {
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: run === 0 });
      await page.goto(origin + path, { waitUntil: 'networkidle' });
      await page.mouse.move(720, 350);
      await page.mouse.wheel(0, 500);
      results.push({ path, run, ...await sample() });
    }
  }
  await page.goto(origin);
  await page.waitForTimeout(1000);
  const listeners = async () => {
    const obj = await cdp.send('Runtime.evaluate', { expression: 'window' });
    const result = await cdp.send('DOMDebugger.getEventListeners', { objectId: obj.result.objectId });
    return result.listeners.filter(l => l.type === 'scroll').length;
  };
  const before = await listeners();
  for (let i = 0; i < 20; i++) {
    for (const path of ['/archives/', '/']) {
      await page.evaluate(path => new Promise(resolve => {
        document.addEventListener('pjax:complete', () => setTimeout(resolve, 30), { once: true });
        window.pjax.loadUrl(path);
      }), path);
    }
  }
  const after = await listeners();
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${output}/${label}-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${output}/${label}-mobile.png` });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${output}/${label}-dark.png` });
  const report = { label, origin, browser: page.context().browser().version(), results, scrollListeners: { before, after } };
  await cdp.detach();
  await context.close();
  return report;
}
