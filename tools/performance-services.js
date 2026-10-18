async (page) => {
  const context = await page.context().browser().newContext({ viewport: { width: 1280, height: 800 } });
  const testPage = await context.newPage();
  const failures = [];
  const hits = [];
  let submissions = 0;
  let comments = [];
  await context.route('**/*', async route => {
    const url = route.request().url();
    if (url.startsWith('https://stats.sujing.dev/')) {
      hits.push(route.request().postDataJSON().path);
      return route.fulfill({ json: { siteUv: 100, sitePv: 200, pagePv: 10 } });
    }
    if (url.startsWith('https://comments.sujing.dev/')) {
      if (route.request().method() === 'POST') {
        submissions++;
        comments = [{ id: 'test-1', nickname: 'Performance test', content: 'Local mocked comment', createdAt: '2026-09-09T00:00:00Z' }];
        return route.fulfill({ json: { ok: true } });
      }
      return route.fulfill({ json: { comments } });
    }
    if (url.startsWith('http://sujing.test/')) {
      const response = await route.fetch({ url: url.replace('http://sujing.test', 'http://127.0.0.1:4002') });
      return route.fulfill({ response });
    }
    return route.abort();
  });
  await testPage.goto('http://sujing.test/about/');
  await testPage.locator('[data-sujing-comment-form]').waitFor();
  await testPage.locator('input[name=nickname]').fill('Performance test');
  await testPage.locator('textarea[name=content]').fill('Local mocked comment');
  await testPage.locator('[data-sujing-comment-form] button[type=submit]').click();
  await testPage.waitForTimeout(600);
  if (submissions !== 1) failures.push('Mocked comment submitted more/less than once');
  if (!(await testPage.locator('[data-sujing-comments-list]').innerText()).includes('Local mocked comment')) failures.push('Mocked comment not rendered');
  if (hits.length !== 1) failures.push('Initial visit counted more/less than once');
  await testPage.evaluate(() => new Promise(resolve => {
    document.addEventListener('pjax:complete', () => setTimeout(resolve, 1000), { once: true });
    window.pjax.loadUrl('/archives/');
  }));
  if (hits.length !== 2) failures.push('PJAX visit counted more/less than once');
  await context.close();
  return { failures, hits, submissions, network: 'All service requests intercepted; no live writes.' };
}
