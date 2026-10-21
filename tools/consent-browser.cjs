/* Focused consent acceptance checks against source scripts and real page DOM.
   No build or vendor request is sent. Run: node tools/consent-browser.cjs
   CONSENT_BROWSER optionally selects chromium (default), firefox or webkit. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const browsers = require('playwright');

const root = path.resolve(__dirname, '..');
const gaId = JSON.parse(fs.readFileSync(path.join(root, 'site.json'), 'utf8')).analytics.ga4_measurement_id;
const checks = [];
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (!['index.html', 'contact', 'contact.html', 'js/consent.js', 'js/tags.js', 'js/main.js'].includes(relative) &&
      !relative.startsWith('assets/') && !relative.startsWith('css/')) {
    response.writeHead(404).end(); return;
  }
  let file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep)) { response.writeHead(404).end(); return; }
  if (!path.extname(file)) file += '.html';
  try {
    const content = fs.readFileSync(file);
    const ext = path.extname(file);
    response.writeHead(200, { 'Content-Type': ext === '.js' ? 'text/javascript' :
      ext === '.css' ? 'text/css' : ext === '.html' ? 'text/html' : 'application/octet-stream' });
    response.end(content);
  } catch { response.writeHead(404).end(); }
});

async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const engine = process.env.CONSENT_BROWSER || 'chromium';
  assert(['chromium', 'firefox', 'webkit'].includes(engine), 'Unsupported consent test browser');
  const browser = await browsers[engine].launch({ headless: true });
  try {
    async function makeContext(init, argument) {
      const context = await browser.newContext();
      const vendors = [];
      await context.route('**/*', route => {
        if (new URL(route.request().url()).origin === base) return route.continue();
        vendors.push(route.request().url());
        return route.abort();
      });
      if (init) await context.addInitScript(init, argument);
      return { context, vendors };
    }
    const count = page => page.evaluate(() => (window.dataLayer || [])
      .filter(entry => entry[0] === 'event' && entry[1] === 'contact_call').length);
    const contact = page => page.evaluate(() => {
      const link = document.querySelector('a[href^="tel:"]');
      link.addEventListener('click', event => event.preventDefault(), { once: true });
      link.click();
    });
    const choose = async (page, action) => {
      await page.evaluate(() => window.KAConsent.open());
      await page.locator('[data-consent-action="' + action + '"]').click();
    };
    const disabled = page => page.evaluate(id => window['ga-disable-' + id], gaId);
    const trackingRequests = vendors => vendors.filter(url => url.includes('googletagmanager.com/gtag/js')).length;
    const errors = [];
    const initial = await makeContext();
    const a = await initial.context.newPage();
    a.on('pageerror', error => errors.push(error.message));
    await a.goto(base + '/contact', { waitUntil: 'networkidle' });
    assert.equal(await disabled(a), true, 'Initial denied state disables Google measurement');
    await contact(a);
    assert.equal(await count(a), 0);
    assert.equal(trackingRequests(initial.vendors), 0);
    checks.push('No event or Google script before a valid choice');

    await choose(a, 'accept');
    await a.waitForFunction(id => window['ga-disable-' + id] === false, gaId);
    const b = await initial.context.newPage();
    b.on('pageerror', error => errors.push(error.message));
    await b.goto(base + '/contact', { waitUntil: 'networkidle' });
    await contact(b);
    assert.equal(await count(b), 1);
    assert.equal(trackingRequests(initial.vendors), 2, 'One script per granted document');
    const expiry = (await initial.context.cookies()).find(cookie => cookie.name === 'ka_consent').expires;
    await b.evaluate(() => { window.KAConsent.get('analytics'); window.dispatchEvent(new Event('focus')); });
    assert.equal((await initial.context.cookies()).find(cookie => cookie.name === 'ka_consent').expires, expiry,
      'Permission reads must not extend the six-month cookie lifetime');
    await b.evaluate(() => { document.cookie = '_ga=example; Path=/'; document.cookie = '_ga_TEST=example; Path=/'; });
    await choose(a, 'reject');
    // Read the vendor flag directly: this wait must not itself call get()/refresh().
    await b.waitForFunction(id => window['ga-disable-' + id] === true, gaId);
    assert(!((await initial.context.cookies()).some(cookie => cookie.name.startsWith('_ga'))));
    await contact(b);
    assert.equal(await count(b), 1, 'A withdrawal in tab A blocks tab B without reload');
    checks.push('Cross-tab withdrawal promptly disables the vendor, cleans cookies and blocks contact events');
    await choose(a, 'accept');
    await b.waitForFunction(id => window['ga-disable-' + id] === false, gaId);
    await contact(b);
    assert.equal(await count(b), 2);
    assert.equal(trackingRequests(initial.vendors), 2, 'Re-grant does not install duplicate vendor scripts');
    checks.push('Explicit re-grant resumes events without a second vendor installation');

    await initial.context.clearCookies();
    await contact(b);
    assert.equal(await count(b), 2, 'Expired/deleted permission is checked at the exact event boundary');
    assert.equal(await disabled(b), true);
    assert(await b.locator('#consent').isVisible());
    checks.push('Expiry/deletion revokes consent at the tracking boundary and returns the banner');

    for (const lifecycle of ['focus', 'pageshow', 'visibilitychange']) {
      await choose(b, 'accept');
      await initial.context.clearCookies();
      await b.evaluate(type => {
        if (type === 'visibilitychange') {
          Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
          document.dispatchEvent(new Event(type));
        } else window.dispatchEvent(new Event(type));
      }, lifecycle);
      assert.equal(await disabled(b), true, lifecycle + ' must apply denial without a contact event');
    }
    checks.push('Focus, restored-page and visible-document lifecycle checks revoke stale grants');

    await choose(b, 'accept');
    await initial.context.addCookies([{ name: 'ka_consent', value: 'v1:analytics=1,analytics=0', url: base }]);
    await contact(b);
    assert.equal(await disabled(b), true);
    assert.equal(await count(b), 2);
    await choose(b, 'accept');
    await b.evaluate(() => Object.defineProperty(document, 'cookie', {
      configurable: true, get() { throw new Error('Cookie storage unavailable'); }, set() { throw new Error('Cookie storage unavailable'); }
    }));
    await contact(b);
    assert.equal(await disabled(b), true);
    assert.equal(await count(b), 2);
    checks.push('Malformed or unreadable cookies fail closed after an earlier grant');
    await initial.context.close();

    for (const throwing of [false, true]) {
      const blocked = await makeContext(({ throwing }) => {
        Object.defineProperty(document, 'cookie', {
          configurable: true, get() { return ''; },
          set() { if (throwing) throw new Error('Cookies blocked'); }
        });
        Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage blocked'); } });
      }, { throwing });
      const page = await blocked.context.newPage();
      await page.goto(base + '/contact', { waitUntil: 'networkidle' });
      await choose(page, 'accept');
      await contact(page);
      assert.equal(await count(page), 0);
      assert.equal(await disabled(page), true);
      assert.equal(trackingRequests(blocked.vendors), 0);
      await page.locator('[data-consent-action="open"]').click();
      await page.keyboard.press('Escape');
      assert(await page.locator('[data-consent-action="open"]').evaluate(element => document.activeElement === element));
      await blocked.context.close();
    }
    checks.push('Silently blocked and throwing writes never grant; settings and Escape focus recovery remain usable');

    const fallback = await makeContext(() => {
      Object.defineProperty(window, 'BroadcastChannel', { value: undefined });
      Object.defineProperty(window, 'cookieStore', { value: undefined });
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage blocked'); } });
    });
    const first = await fallback.context.newPage();
    await first.goto(base + '/contact', { waitUntil: 'networkidle' });
    await choose(first, 'accept');
    const second = await fallback.context.newPage();
    await second.goto(base + '/contact', { waitUntil: 'networkidle' });
    await choose(first, 'reject');
    await contact(second);
    assert.equal(await count(second), 0);
    assert.equal(await disabled(second), true);
    await fallback.context.close();
    checks.push('Tracking-time checks remain effective when optional cross-tab APIs and localStorage are unavailable');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ engine, browser: browser.version(), checks, externalRequestsSent: 0 }, null, 2));
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
