# Knoesen Accounting, Tax & Payroll — website

Static website for SME bookkeeping, payroll, tax and compiled annual financial statements. Based in Gqeberha (Port Elizabeth), with remote service across South Africa. Audits and independent reviews are not offered.

Live site: https://knoesen-accounting.co.za

## Current instructions

- [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md): release procedure and dated September history.
- [AUDIT-FIXES-2026-10-13.md](AUDIT-FIXES-2026-10-13.md): October corrections, tests and external follow-up.
- [TODO-BEFORE-LAUNCH.md](TODO-BEFORE-LAUNCH.md): current owner decisions and private access/legal checks.
- [SEO-PLAYBOOK.md](SEO-PLAYBOOK.md): no-cost growth using useful content and legitimate profiles/links.
- [LEAD-MEASUREMENT.md](LEAD-MEASUREMENT.md): contact intent versus actual enquiries, quotes and clients.

## Build and preview

Requires Python 3.9+ and its standard library; no framework or production package dependencies. The optional font maintenance script has separate development dependencies.

```text
python -X utf8 publish.py
python preview.py --port 8000
```

Open http://127.0.0.1:8000. The preview supports clean URLs and actual 404 responses. `publish.py` regenerates output, runs link/configuration checks and unit tests, then selects the public files into `dist/`. Use a disposable copy when validation should leave the original generated output untouched.

Wrangler's configured build also runs `python publish.py` and publishes only `dist/`. The generator does not run on production page requests. Preserve a previous provider version for rollback and verify live files after deployment. A prepared release or GitHub push does not prove deployment.

GitHub's read-only validation workflow builds and tests on main pushes and pull requests. It does not deploy or certify every tax/legal statement.

## Sources and generated output

| Source | Purpose |
|---|---|
| site.json | Repeated business/contact details, feature flags and analytics configuration |
| content/pages.json | URLs, metadata, structured FAQs, article sources and actual update dates |
| content/*.html | Page body fragments |
| data/tax-rates.json | Annual figures and historical tax years |
| data/interest-rates.json | Effective-dated SARS interest and source checks |
| data/editorial-facts.json | Consequential shared guidance, including the CIPC deadline |
| build.py | Generates pages, sitemap, robots, tracking configuration and headers |
| publish.py | Public release allowlist and reproducible hash manifest |
| css/styles.css, js/main.js | Hand-maintained design and interactions |

Generated HTML, js/tags.js, js/tax-rates.js and _headers should not be edited directly. Rebuild after changing content, CSS or scripts: content-hashed CSS/JS URLs ensure returning visitors receive the new assets. Keep content/lastmod.json in the repository so sitemap dates reflect actual content changes.

Article last-updated dates describe edits. Specific source-check dates describe the facts checked; neither automatically establishes a practitioner review. Correct consequential facts in visible copy and structured FAQ data together. Existing build arithmetic checks establish consistency, not authoritative tax accuracy.

## Fonts

Self-hosted Fraunces, modified Sans instances named Knoesen Sans, and original IBM Plex Mono preserve the site's type design. Active fonts and the original SIL Open Font License notices are included in the release; original/legacy maintenance files remain in the source repository. The optional tools/optimize_fonts.py reproduces used weight instances, character coverage and derivative naming. Current source fonts have only a weight axis.

Give replacement fonts new filenames because their URLs are cached immutable. Update both CSS and build.py preload references. Do not remove copyright/licence metadata or the bundled notices.

## Consent and contact measurement

GA4 is configured; Google Ads and Meta Pixel are not. The generated tag loader waits for analytics consent and respects withdrawal. Cloudflare Web Analytics is separately disclosed and cookieless; do not claim that no measurement runs before a cookie choice.

js/main.js checks current analytics consent for contact_call, contact_email, contact_whatsapp and contact_facebook. Parameters contain placement and page path, not contact details. A contact activation is intent; form-provider acceptance is not proof of receipt, qualification or a paying client. Verify actual GA4 receipt/settings privately and use the outcome record described in LEAD-MEASUREMENT.md.

The user-triggered map keeps a directions alternative and does not infer successful Google Maps rendering from a cross-origin load event.

## Disabled features and owner choices

Calculators remain disabled in site.json, excluded from sitemap/release output, and redirected to resources. The form remains disabled while its provider key is blank; direct phone, email and WhatsApp remain available. Before activation, validate complete calculator rules and boundaries, or form delivery/privacy/spam/failure handling. Changing a flag is not the complete activation process.

The recovered Google Business Profile, appointment-only visits and confirmed hours are preserved. Public registration IDs and a house number are the owner's choice. Real testimonials can wait for client permission. The older domain's coexistence/consolidation remains undecided, and email administration is deferred.

## Release boundaries

Never publish the repository root, private audit evidence, account data or client records. The explicit release allowlist is the main boundary; .assetsignore provides additional exclusions. Keep private records outside the public repository. Missing private account or legal evidence is an item to verify, not proof of failure.

Site content belongs to Knoesen Accounting, Tax & Payroll. Official tax figures and font notices remain attributed to their sources.
