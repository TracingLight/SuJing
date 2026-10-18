async (page) => {
  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 900 } });
  page = await context.newPage();
  const origin = 'http://127.0.0.1:4002';
  const failures = [];
  const interactions = [];
  await page.addInitScript(() => {
    window.__events = [];
    new PerformanceObserver(list => list.getEntries().forEach(e => {
      if (e.interactionId) window.__events.push(e.duration);
    })).observe({ type: 'event', buffered: true, durationThreshold: 16 });
  });
  await page.goto(origin + '/2026/09/03/' + encodeURIComponent('学习笔记-c-面向对象-本文介绍c-模板机制-讲解类模板') + '/');
  await page.waitForTimeout(1200);
  const height = await page.locator('#article-container').evaluate(e => e.offsetHeight);
  for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 650); await page.waitForTimeout(100); }
  await page.waitForTimeout(300);
  const progress = await page.locator('#sujing-reading-progress span').evaluate(e => e.style.transform);
  if (progress === 'scaleX(0)') failures.push('Long article progress stayed at zero');
  await page.screenshot({ path: 'output/playwright/long-article.png' });
  await page.goto(origin + '/');
  await page.waitForTimeout(1200);
  await page.locator('[data-sujing-command-trigger]').first().count().then(async count => {
    if (count) await page.locator('[data-sujing-command-trigger]').first().click();
  });
  await page.keyboard.press('Escape');
  await page.mouse.move(500, 680);
  await page.waitForTimeout(100);
  const simulateFailure = await page.evaluate(() => {
    document.dispatchEvent(new Event('pjax:send'));
    const event = new Event('pjax:error');
    event.request = { status: 500 };
    document.dispatchEvent(event);
    return !document.body.classList.contains('sujing-leaving');
  });
  if (!simulateFailure) failures.push('Failed navigation left body disabled');
  await page.mouse.move(510, 690);
  await page.waitForTimeout(150);
  if (!(await page.locator('[data-sujing-tilt]').first().evaluate(e => e.style.getPropertyValue('--sujing-tilt-x')))) failures.push('Tilt not restored after navigation failure');
  interactions.push(...await page.evaluate(() => window.__events));
  await page.goto(origin + '/archives/');
  await page.locator('[data-sujing-archive-q]').fill('数组');
  await page.waitForTimeout(300);
  interactions.push(...await page.evaluate(() => window.__events));
  const cdp = await page.context().newCDPSession(page);
  const snapshot = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    return cdp.send('Memory.getDOMCounters');
  };
  await page.keyboard.press('Escape');
  await page.goto(origin + '/');
  await page.waitForTimeout(1000);
  const before = await snapshot();
  for (let i = 0; i < 20; i++) for (const path of ['/archives/', '/']) {
    await page.evaluate(path => new Promise(resolve => {
      document.addEventListener('pjax:complete', () => setTimeout(resolve, 50), { once: true });
      window.pjax.loadUrl(path);
    }), path);
  }
  await page.waitForTimeout(1500);
  const after = await snapshot();
  await cdp.detach();
  await context.close();
  return { failures, longArticleHeight: height, progress, eventDurations: interactions, domCounters: { before, after } };
}
