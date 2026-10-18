async (page) => {
  const origin = await page.evaluate(() => location.origin);
  const failures = [];
  const errors = [];
  const check = (ok, message) => { if (!ok) failures.push(message); };
  page.on('pageerror', error => errors.push(String(error)));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin);
  await page.waitForTimeout(1500);
  const article = await page.locator('[data-sujing-latest-card]').getAttribute('href');
  const navigate = async path => page.evaluate(path => new Promise(resolve => {
    document.addEventListener('pjax:complete', () => setTimeout(resolve, 300), { once: true });
    window.pjax.loadUrl(path);
  }), path);
  const baseline = await page.evaluate(() => {
    window.__originalMusic = document.querySelector('#sujing-music');
    window.__originalCanvas = document.querySelector('#sujing-starfield');
    return [...document.images].filter(i => i.getBoundingClientRect().top < innerHeight && i.getBoundingClientRect().bottom > 0).map(i => ({ src: i.currentSrc, width: i.naturalWidth, complete: i.complete }));
  });
  await page.mouse.move(600, 650);
  await page.waitForTimeout(100);
  check(await page.locator('[data-sujing-tilt]').first().evaluate(e => !!e.style.getPropertyValue('--sujing-tilt-x')), 'Card tilt did not update');
  await page.mouse.move(25, 250);
  await page.mouse.down();
  await page.mouse.move(110, 330, { steps: 8 });
  check(await page.evaluate(() => document.documentElement.classList.contains('sujing-starfield-dragging')), 'Star drag did not start');
  await page.mouse.up();
  check(await page.evaluate(() => !document.documentElement.classList.contains('sujing-starfield-dragging')), 'Star drag did not release');
  await page.locator('.sujing-music-toggle').click();
  const play = page.locator('[data-music="play"]');
  if (await play.count()) await play.click();
  await page.waitForTimeout(600);
  const playing = await page.evaluate(() => !document.querySelector('#sujing-music audio')?.paused);
  await navigate('/archives/');
  const query = page.locator('[data-sujing-archive-q]');
  await query.fill('LeetCode');
  await page.waitForTimeout(300);
  check((await page.locator('[data-sujing-archive-stage]').innerText()).includes('LeetCode'), 'Archive search failed');
  await navigate(article);
  check(await page.evaluate(() => window.__originalMusic === document.querySelector('#sujing-music') && window.__originalCanvas === document.querySelector('#sujing-starfield')), 'Persistent music/canvas replaced');
  if (playing) check(await page.evaluate(() => !document.querySelector('#sujing-music audio').paused), 'Music stopped during PJAX');
  await page.evaluate(() => document.querySelector('#sujing-music audio')?.pause());
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(500);
  check(await page.locator('#sujing-reading-progress span').evaluate(e => e.style.transform !== 'scaleX(0)'), 'Reading progress did not advance');
  await page.screenshot({ path: 'output/playwright/article-desktop.png' });
  await page.keyboard.press('/');
  const search = page.locator('.local-search-input input');
  if (await search.count()) {
    await search.fill('数组');
    await page.waitForTimeout(700);
    check((await page.locator('#local-search-results').innerText()).length > 0, 'Local search empty');
  } else failures.push('Search input missing');
  await page.keyboard.press('Escape');
  await navigate('/about/');
  check(await page.locator('[data-sujing-comments]').count() === 1, 'Local comment placeholder missing');
  await page.screenshot({ path: 'output/playwright/about-desktop.png' });
  await navigate('/');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'output/playwright/final-desktop.png' });
  const cdp = await page.context().newCDPSession(page);
  const events = [];
  cdp.on('Tracing.dataCollected', data => events.push(...data.value));
  await cdp.send('Tracing.start', { categories: 'devtools.timeline', transferMode: 'ReportEvents' });
  for (let i = 0; i < 8; i++) {
    await page.mouse.move(400 + i * 30, 650 + i * 5);
    await page.mouse.wheel(0, i < 4 ? 100 : -100);
    await page.waitForTimeout(100);
  }
  const finished = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
  await cdp.send('Tracing.end');
  await finished;
  const trace = {};
  for (const event of events) if (['Paint', 'Layout', 'UpdateLayoutTree', 'CompositeLayers', 'FunctionCall'].includes(event.name) && event.dur) {
    trace[event.name] ||= { count: 0, totalMs: 0, maxMs: 0 };
    trace[event.name].count++;
    trace[event.name].totalMs += event.dur / 1000;
    trace[event.name].maxMs = Math.max(trace[event.name].maxMs, event.dur / 1000);
  }
  const desktopPage = page;
  const mobileContext = await page.context().browser().newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  page = await mobileContext.newPage();
  for (const path of ['/', '/articles/', article, '/archives/', '/gallery/', '/music/', '/about/']) {
    await page.goto(origin + path);
    await page.waitForTimeout(1200);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Mobile overflow: ${path}`);
  }
  await page.goto(origin);
  await page.waitForTimeout(1300);
  await page.screenshot({ path: 'output/playwright/final-mobile-dpr3.png' });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'output/playwright/final-mobile-dark.png' });
  const pixels = await page.evaluate(() => {
    const canvas = document.querySelector('#sujing-starfield');
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let nonblank = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i]) nonblank++;
    return nonblank;
  });
  check(pixels > 100, 'Canvas blank on high-DPR mobile');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(200);
  check(await page.evaluate(() => [...document.querySelectorAll('[data-sujing-reveal]')].every(e => getComputedStyle(e).opacity === '1')), 'Reduced-motion content hidden');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const mobileViewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
  await mobileContext.close();
  page = desktopPage;
  await cdp.detach();
  return { failures, errors, baseline, musicPlayed: playing, canvasNonblankPixels: pixels, mobileViewport, trace };
}
