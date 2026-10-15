/* Low-volume post-release checks. Never submits enquiries or loads vendor scripts. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const site = JSON.parse(fs.readFileSync(path.join(root, 'site.json'), 'utf8'));
const base = new URL(site.domain).origin;
const args = process.argv.slice(2);
assert(args.length === 0, 'Use the configured public domain; arbitrary targets are not supported');
const results = { at: new Date().toISOString(), base, pages: [], assets: [], boundaries: [] };
const normalize = body => body.replace(/<script[^>]*src=["']https:\/\/static\.cloudflareinsights\.com\/[\s\S]*?<\/script>/gi, '')
  .replace(/\s+/g, ' ').trim();
const hash = body => crypto.createHash('sha256').update(body).digest('hex');
async function get(url) {
  return fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(25000) });
}
(async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'release-manifest.json'), 'utf8'));
  results.release = manifest.release;
  const pages = JSON.parse(fs.readFileSync(path.join(root, 'content/pages.json'), 'utf8'))
    .filter(page => !page.feature || site.features[page.feature] !== false);
  for (const page of pages) {
    const response = await get(base + '/' + page.slug);
    const body = await response.text();
    const expected = fs.readFileSync(path.join(root, 'dist', (page.slug || 'index') + '.html'), 'utf8');
    assert.equal(response.status, 200, page.slug);
    assert.equal(normalize(body), normalize(expected), 'Live page differs from prepared release: ' + page.slug);
    results.pages.push({ path: '/' + page.slug, status: response.status, matches: true });
  }
  for (const name of ['css/styles.css', 'js/main.js', 'js/consent.js', 'js/tags.js', 'robots.txt', 'sitemap.xml']) {
    if (!manifest.files[name]) continue;
    const response = await get(base + '/' + name);
    const body = Buffer.from(await response.arrayBuffer());
    assert.equal(response.status, 200, name);
    assert.equal(hash(body), manifest.files[name], name);
    results.assets.push({ path: name, matches: true });
  }
  for (const route of ['/release-check/nonexistent-page', '/site.json', '/.git/config', '/js/not-a-real-asset.js']) {
    const response = await get(base + route);
    const body = await response.text();
    assert.equal(response.status, 404, route);
    assert(body.includes('href="/"') && /<main\b/.test(body), route + ': custom recovery body missing');
    results.boundaries.push({ route, status: response.status, recovery: true });
  }
  for (const [url, location] of [
    [base + '/tools/income-tax-calculator', '/resources'],
    [base.replace('https://', 'https://www.') + '/services/payroll?source=release-check', base + '/services/payroll?source=release-check']
  ]) {
    const response = await get(url);
    assert.equal(response.status, 301, url);
    assert.equal(response.headers.get('location'), location, url);
    results.boundaries.push({ url, status: response.status, location });
  }
  console.log(JSON.stringify(results, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
