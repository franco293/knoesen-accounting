/* Development-only acceptance checks. All vendor requests are intercepted. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const site = JSON.parse(fs.readFileSync(path.join(root, 'site.json'), 'utf8'));
const pages = JSON.parse(fs.readFileSync(path.join(root, 'content/pages.json'), 'utf8'))
  .filter(page => !page.feature || site.features[page.feature] !== false);
const results = { pages: 0, layouts: 0, externalRequestsSent: 0, checks: [] };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function availablePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function main() {
  assert(fs.existsSync(path.join(root, 'dist/index.html')), 'Build with python publish.py first');
  const port = await availablePort();
  const base = 'http://127.0.0.1:' + port;
  const preview = spawn(process.env.PYTHON || 'python', ['-X', 'utf8', 'preview.py', '--port', String(port)], {
    cwd: root, stdio: 'ignore', windowsHide: true
  });
  let browser;
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      if (preview.exitCode !== null) throw new Error('Preview exited before serving the release');
      try { if ((await fetch(base)).ok) { ready = true; break; } } catch {}
      await sleep(100);
    }
    assert(ready, 'Preview did not become ready');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const vendors = [];
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === base) return route.continue();
      vendors.push(route.request().url());
      return route.abort();
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));

    for (const item of pages) {
      const response = await page.goto(base + '/' + item.slug, { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200, item.slug);
      assert.equal(await page.locator('h1').count(), 1, item.slug + ': one heading');
      if (await page.locator('#consent').isVisible()) await page.locator('[data-consent-action="reject"]').click();
      for (const width of [320, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          item.slug + ': horizontal overflow at ' + width);
        results.layouts++;
      }
      results.pages++;
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + '/services/accounting');
    await page.locator('.nav-toggle').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.nav-toggle').getAttribute('aria-expanded'), 'true');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.nav-toggle').getAttribute('aria-expanded'), 'false');
    assert(await page.locator('.nav-toggle').evaluate(element => document.activeElement === element));
    results.checks.push('keyboard menu and focus recovery');

    await page.goto(base);
    const eventCount = () => page.evaluate(() => (window.dataLayer || [])
      .filter(entry => entry[0] === 'event' && /^contact_/.test(entry[1])).length);
    const contact = () => page.evaluate(() => {
      const link = document.querySelector('a[href^="tel:"]');
      link.addEventListener('click', event => event.preventDefault(), { once: true });
      link.click();
    });
    vendors.length = 0;
    const before = await eventCount();
    await contact();
    assert.equal(await eventCount(), before, 'Denied contact intent must not emit');
    assert(!vendors.some(url => url.includes('googletagmanager.com')));
    await page.evaluate(() => window.KAConsent.open());
    await page.locator('[data-consent-action="accept"]').click();
    await contact();
    assert.equal(await eventCount(), before + 1, 'Granted contact intent must emit once');
    assert(vendors.some(url => url.includes('googletagmanager.com')));
    await page.evaluate(() => window.KAConsent.open());
    await page.locator('[data-consent-action="reject"]').click();
    await contact();
    assert.equal(await eventCount(), before + 1, 'Withdrawal must stop new contact events');
    results.checks.push('denial, grant and withdrawal without contacting vendors');

    await page.goto(base + '/areas-we-serve');
    assert.equal(await page.locator('iframe[src*="google.com/maps"]').count(), 0);
    await page.locator('#map-load-btn').click();
    await page.waitForFunction(() => document.querySelector('#map-frame').getAttribute('aria-busy') === 'false');
    assert.match(await page.locator('#map-status').innerText(), /blank|unavailable|could not|directions/i);
    assert((await page.locator('a[href*="google.com/maps"]').count()) > 0);
    results.checks.push('failed map retains directions and honest status');

    const missing = await page.goto(base + '/acceptance/nonexistent-page');
    assert.equal(missing.status(), 404);
    assert((await page.locator('main a[href="/"]').count()) > 0, 'Missing page has recovery link');
    const privatePath = await page.goto(base + '/site.json');
    assert.equal(privatePath.status(), 404);
    assert.equal(await page.locator('h1').count(), 1);
    const retired = await context.request.get(base + '/tools/income-tax-calculator', { maxRedirects: 0 });
    assert.equal(retired.status(), 301);
    assert.equal(retired.headers().location, '/resources');
    results.checks.push('preview 404 recovery, source exclusions and retired tools');

    await page.goto(base + '/contact');
    assert.equal(await page.locator('#contact-form').count(), 0, 'Form activation needs its separate acceptance gate');
    assert((await page.locator('a[href^="mailto:"]').count()) > 0);
    assert.equal(errors.length, 0, errors.join('\n'));
    await context.close();

    const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    await noJs.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    const plain = await noJs.newPage();
    for (const slug of ['services/accounting', 'resources/month-end-bookkeeping-checklist', 'contact']) {
      await plain.goto(base + '/' + slug);
      assert(await plain.locator('main').isVisible());
      assert((await plain.locator('main').innerText()).length > 300);
      assert((await plain.locator('main a').count()) > 0);
    }
    await noJs.close();
    results.checks.push('readable no-JavaScript service, checklist and contact');
    console.log(JSON.stringify(results, null, 2));
  } finally {
    if (browser) await browser.close();
    preview.kill();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
