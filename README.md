# Knoesen Accounting, Tax & Payroll — website

Static site for a SAIPA-registered accounting practice in Gqeberha (Port
Elizabeth). No framework, no dependencies, no build step required to deploy.

**Live:** https://knoesen-accounting.co.za

- **[TODO-BEFORE-LAUNCH.md](TODO-BEFORE-LAUNCH.md)** — the things only you can
  finish: POPIA registration, the contact form key, and the facts I could not
  verify. Read this first.
- **[SEO-PLAYBOOK.md](SEO-PLAYBOOK.md)** — Google Business Profile setup,
  reviews, citations and links. The work that happens off the site.

---

## How it works

The site is ~20 pages that share a header, footer, navigation, breadcrumbs and
structured data. Rather than maintain that by hand across 20 files — which is
how a phone number ends up correct in four places and wrong in a fifth — a
small Python script assembles them from one config and one fragment per page.

```
site.json              Every repeated fact: domain, name, phone, email,
                       address, credentials, navigation, tax year. Change it
                       here and all 20 pages update.

content/
  pages.json           Page manifest: slug, title, meta description, H1,
                       breadcrumb trail, schema type, FAQs, sitemap priority.
  *.html               Body fragment for each page. No <head>, no header,
                       no footer — just the content.

build.py               Stitches the above into static HTML, and writes
                       sitemap.xml and robots.txt.

index.html             ← generated. Do not edit these directly;
about.html                your changes will be overwritten on the next build.
services/*.html
resources/*.html
...

css/styles.css         Hand-maintained. "The Ledger" design system, and the
                       @font-face block for the self-hosted fonts.
js/main.js             Hand-maintained. Mobile nav, map consent gate,
                       contact form. Loaded on every page.
js/*-calculator.js     Per-page only. Listed in pages.json under `scripts`,
                       so the 22 pages without a calculator never fetch them.
assets/                Icons and the Open Graph image.
assets/fonts/          Self-hosted woff2. See the note at the top of
                       styles.css before replacing any of them.
```

**The generated HTML is what ships.** Cloudflare runs no build command, and
nothing in this repo executes in production. If `build.py` disappeared, the
site would keep working exactly as it does now.

### Building

```bash
python build.py           # rebuild everything
python build.py --check   # rebuild, then fail on broken internal links
```

**Always rebuild after editing `css/styles.css` or `js/main.js`.** `_headers`
serves those with `max-age=31536000, immutable`, so browsers are told never to
revalidate them for a year. `build.py` therefore stamps a content hash onto the
URLs (`/css/styles.css?v=e65d0c17`) so the URL changes whenever the bytes do.
Edit the CSS without rebuilding and the HTML keeps pointing at the old hash,
and returning visitors keep the stale file.

This is not hypothetical: the single-page-to-multi-page rebuild changed the CSS
structure without changing the URL, so anyone who had visited before got new
HTML with a year-old stylesheet — the nav dropdowns lost their positioning
rules and stacked down the page over the hero.

Python 3.8+, standard library only. `build.py` prints a list of everything it
omitted for lack of a verified value, so you always know what is outstanding.

### Previewing

```bash
python -m http.server 8000
```

Then open http://localhost:8000. Note that a plain file server serves
`/about.html`, whereas Cloudflare also serves it at `/about` — the site links
to the clean URLs, so a few links will 404 locally but work in production.

---

## Editing content

**To change words on a page:** edit the matching file in `content/`, then run
`python build.py`.

**To change a phone number, email or address:** edit `site.json` only. Prose in
`content/*.html` uses tokens (`{{phone}}`, `{{email}}`, `{{city}}`,
`{{principal}}` and so on) precisely so contact details exist in exactly one
place. The full list is in `build.py` under `TOKENS`.

**To add a page:**

1. Write the body fragment in `content/your-page.html`
2. Add an entry to `content/pages.json`
3. Add it to `site.json` → `nav` if it belongs in the menu
4. `python build.py --check`

The sitemap, breadcrumbs, JSON-LD and internal link check all follow
automatically.

**To change colours or type:** everything is a CSS custom property at the top
of `css/styles.css` under `:root`.

---

## What was done in the latest pass

### Calculators

Two free tools, at `/tools/income-tax-calculator` and `/tools/vat-calculator`,
built on the same verified figures as the rate tables. They are plain
dependency-free JavaScript, they run entirely in the visitor's browser, and
they ask for nothing — no email, no sign-up. Every bracket, rebate, threshold
and credit was re-checked against the Budget 2026 Tax Guide PDF, and each
cumulative bracket amount reconciles exactly against the bracket below it.

The income tax calculator was verified against seven worked cases spanning the
threshold boundary, each age band, the R430 000 retirement cap and the top
bracket. The bracket-by-bracket breakdown it renders sums exactly to the tax
before rebates, which is the property that catches a transcription error in any
of the seven `base` amounts.

**If a Budget changes the rates, `js/income-tax-calculator.js` and
`content/guide-rates.html` must both be updated.** They hold the same numbers
in two places by design — the calculator needs them as data, the guide needs
them as a readable table — but nothing enforces agreement between them.

### Fonts are now self-hosted

The site loaded three font families from `fonts.googleapis.com` on every page,
which sat badly beside the Google Maps consent gate: the map is held back
specifically so a visitor's IP is not sent to Google unasked, and then the
fonts sent it anyway. They now come from `/assets/fonts` — no third-party
request is made by any page, and `style-src`/`font-src` in the CSP are back to
`'self'`. The privacy policy no longer lists Google Fonts as a recipient,
because it no longer is one.

Fraunces and IBM Plex Sans are variable fonts, so one file per style covers
every weight; that plus preloading the three `latin` faces removes two DNS/TLS
handshakes from the critical path.

### New guide

`/resources/independent-contractor-or-employee` — the statutory and common-law
tests from SARS Interpretation Note 17, read directly rather than summarised
from elsewhere. Worth noting because the widely-repeated version of these tests
is wrong: the "paid at regular intervals" rule is a common-law *indicator*, not
a statutory test, and the first statutory test needs *both* the premises limb
and the control limb before it bites.

---

## What was done in the first rebuild pass

### Fixed: the site could not rank

The live site set `<link rel="canonical" href="https://www.knoesenacc.co.za/">`
— it was telling Google that the authoritative version of every page was on a
*different domain*. The same was true of `og:url`, `sitemap.xml`, `robots.txt`,
`CNAME` and all the JSON-LD. Every one of those now points at
`knoesen-accounting.co.za`, and each page is self-canonical.

### Architecture: 1 page → 20

One page can rank for roughly one intent. The single-page site with anchor
navigation has become dedicated, indexable pages: four service pages, an about
page, a local page, a contact page, and a resource library of seven guides.
Old anchor URLs 301-redirect to their new homes via `_redirects`.

### Content: verified, sourced, dated

Seven guides covering the South African tax deadline calendar, Filing Season
2026, the full 2026/27 rate tables, the VAT registration threshold, small
business tax, payroll compliance and business registration.

Every figure was taken from **National Treasury's Budget 2026 Tax Guide** (the
PDF, read directly) and **sars.gov.za** — not from secondary summaries. This
matters: the widely-syndicated version of the turnover tax table has an error
in the third bracket, and a great deal of South African tax content online still
quotes the R1 million VAT threshold that changed on 1 April 2026. Each guide
shows the date it was last reviewed and links its sources.

### Structured data

A single `@graph` per page with `AccountingService`/`LocalBusiness`,
`Person` (Lourens, with credentials), `WebSite`, `BreadcrumbList`, plus
`Service` on service pages, `Article` on guides and `FAQPage` where FAQs are
visible on the page. Unverified values are omitted from the markup entirely
rather than guessed.

### Conversion & UX

Sticky call/WhatsApp/enquire bar on mobile. Dropdown navigation that works by
keyboard with no JavaScript. Breadcrumbs on every inner page. A contact form
with a topic selector, a honeypot, and graceful failure when unconfigured.
Cross-links between related services and guides throughout.

### Correctness

- All 20 pages verified for: exactly one `<h1>`, valid parseable JSON-LD,
  self-referential canonical, no unreplaced build tokens, no `<img>` without
  `alt`, no skipped heading levels, and title/description within SERP limits.
- No horizontal overflow at 375px or 1265px. Wide rate tables scroll inside
  their own containers rather than pushing the page sideways.
- `.reveal` animations opt out under `@media (scripting: none)`, so the content
  is never invisible if JavaScript does not run.

### Security & privacy (carried forward and extended)

CSP with no `unsafe-inline`, HSTS, COOP/CORP, and a tightened
`Permissions-Policy`. The Google Maps embed stays behind a click-to-load gate
so visitors' IP addresses are not handed to Google unprompted. No analytics, no
tracking, no cookie banner needed. POPIA privacy notice linked from every page,
now joined by a disclaimer page — necessary once a site publishes tax figures.

### Deliberately not done

- **No invented facts.** No SAIPA number, tax practitioner number, street
  address, trading hours, response-time promise, client count or testimonial
  appears anywhere, because none of them could be verified. See
  TODO-BEFORE-LAUNCH.md.
- **No thin location pages.** Building `/accountant-walmer`,
  `/accountant-newton-park` and so on out of the same paragraph with the suburb
  swapped is a doorway-page pattern Google actively penalises. There is one
  substantial `/areas-we-serve` page with genuine local content instead.
- **No design overhaul.** The existing "Ledger" visual language was good and
  original. Everything new extends it.

---

## Deploy

Already connected to Cloudflare via `wrangler.toml`, serving the repository
root as static assets. Push to the repo and it redeploys.

```bash
git add .
git commit -m "Rebuild site: multi-page architecture, verified tax content, canonical fix"
git push
```

`_headers` (security headers, caching) and `_redirects` (legacy URLs) are
Cloudflare features and do not apply on GitHub Pages. `.assetsignore` keeps
build inputs — `build.py`, `site.json`, `content/` — out of the deployed output.

**This deploys as a Worker, not as Pages.** That distinction matters for
`_redirects`: Workers Assets accepts only *relative* URLs there. Absolute
cross-host rules are valid Pages syntax but fail the entire deploy with
`Invalid _redirects configuration ... [code: 100324]` — and they fail at the
API after the assets have already uploaded, so the build log looks like a
success right up until the last line. `python build.py --check` validates
`_redirects` for exactly this and will fail locally first.

Because of that, the `www` → apex redirect cannot live in this repo. Either
don't attach `www` to the Worker as a custom domain, or add a Cloudflare
Redirect Rule (Rules → Redirect Rules); both are covered in
[TODO-BEFORE-LAUNCH.md](TODO-BEFORE-LAUNCH.md).

## Licence / content

Site content is the property of Knoesen Accounting, Tax & Payroll. Tax figures
reproduced from SARS and National Treasury publications remain theirs and are
attributed on the pages where they appear.
