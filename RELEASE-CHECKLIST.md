# Audit repair release

Prepared locally following the September 2026 audit. This file records code changes and outstanding operational work; it is not proof that production was deployed.

## Verified follow-up — 22 September 2026

- The audit repair release was pushed as `722a219` and subsequently verified on the live site: direct-contact fallback, consent handling, mobile menu, updated interest guidance and source-file exclusions.
- **F03:** HTTP redirects to HTTPS; tested homepage and deep paths with query preservation.
- **F17:** www redirects to the apex with paths and query strings preserved. The older business/email domain remains unchanged.
- **F05/F06:** Google Analytics Realtime received `contact_call`, `contact_email` and `contact_whatsapp` during owner-operated tests. All three are now key events, counted per event without a default monetary value. These are contact-intent clicks, not delivered or qualified enquiries. Facebook was confirmed as an outbound `click` with `link_domain=facebook.com`.
- Search Console accepted `/sitemap.xml` with **Success**, last read 22 September, 21 discovered pages. The indexing report (updated 18 September) showed 22 indexed URLs and six exclusions: four disabled tool redirects, one old bonus-calculator duplicate and the sitemap itself. Google reported no manual actions or security issues. Field Core Web Vitals data was unavailable.
- **F12 remains open:** font update `ea2aa34` reduces the homepage's preloaded font payload from 142,696 to 125,916 bytes while preserving character coverage and layout. All 22 enabled pages passed geometry/overflow checks at 320, 390 and 1440px. Repeated throttled timing results were mixed, so no reliable LCP improvement is claimed. Deployed and verified on 22 September 2026: Cloudflare version `a4785bbf-e432-4d14-a9c2-81a3b7ca198d`, release `7dd6691a0603a766`. All six font hashes match production; contact, mobile menu, consent withdrawal and script/style checks passed. Previous rollback version: `f6aa7046-6fde-4d55-b393-6e127bff6ac8`.

- **F12 follow-up:** cookie-banner rendering fix `a0f5656` deployed on 22 September 2026 as release `3a763e37bf88c289`, Cloudflare version `8631b888-a403-43c1-8491-f1ef845cefb8`. The initial banner no longer forces synchronous page layout through an unnecessary scroll reset. Three-run paired local mobile-emulation medians improved on home, accounting and contact; these are laboratory results, not field Core Web Vitals. Live Chromium checks passed normal, blocked and malformed cookie storage, short-screen settings, reopen scroll/focus, acceptance and withdrawal, mobile navigation and source matching. Previous rollback version: `a4785bbf-e432-4d14-a9c2-81a3b7ca198d`.
- **Production consent evidence qualification:** Cloudflare injects `static.cloudflareinsights.com/beacon.min.js` before consent. The live test recorded and blocked this request separately; it does not establish zero third-party requests before consent. No Google tracking requests occurred before consent. Hosting analytics configuration/privacy treatment remains a separate follow-up; no hosting analytics settings were changed with this release.

The items above supersede the original audit's outstanding-status descriptions. They record point-in-time verification, not continuous monitoring.

## Prepare and verify

1. Run `python publish.py`. It regenerates pages, checks links/configuration, runs independent factual and publication tests, and builds `dist/` from an explicit allowlist. Python 3.9+ is required. There are no production package dependencies.
2. Run `python preview.py` and inspect the preview at `http://127.0.0.1:8081`. It serves only the release output, including clean URLs. `npm start` uses the same preview; no floating download is needed.
3. Verify direct contact, consent acceptance/rejection/withdrawal, short-screen preferences, mobile menu, tax-source dates and error recovery. Do not send a real enquiry as an automated check.
4. Preserve the previous deployed artefact through the hosting provider's version/rollback workflow. `publish.py` replaces the local generated `dist/`; it is not a production backup system.
5. Deploy the reviewed release using the existing Cloudflare account. Wrangler now builds with `python publish.py` and publishes only `dist/`. Confirm Python is available in the hosting build environment. Never override the assets directory with the repository root.
6. Compare live pages and content-hashed scripts/styles with `release-manifest.json`. Cloudflare may inject its beacon into HTML, so account for that when comparing bodies. Repeat contact/consent/menu smoke checks on production. Save the deployed version beside the release ID.

The release manifest is intentionally outside `dist/`. Development metadata, tests, source data and disabled calculator scripts are not included. The original root `.assetsignore` also excludes development files as defence in depth. Do not publish the audit evidence folder.

## Local fixes mapped to findings

| Findings | Prepared change |
|---|---|
| F01 | Existing direct email/phone/WhatsApp fallback retained and tested; no inactive form is emitted. |
| F02, F14 | Effective-dated interest data, source links, previous periods and shared rendered tokens; independent source fixtures. This does not replace practitioner review of every narrative example. |
| F04, F10 | Allowlisted release folder, explicit build command, reproducible manifest and output-only preview. |
| F05, F06 | Contact intent events require current analytics permission; vendor consent updates precede loading; Google opt-out flag changes on withdrawal/regrant. Owner-operated GA receipt and key-event configuration verified above. |
| F07 | Cookie reads/decoding/writes/deletion cannot prevent the current in-memory consent choice. If persistence is blocked, the browser may not retain that choice across visits. |
| F08, F09, F18, F19 | Short-screen settings scroll, focus returns to opener, larger checkbox, verified narrow menu, readable 404 heading and no-script navigation. |
| F13 | Corrected 2025/26 brackets; independent fixtures and worked-result browser test. Calculators remain disabled. |
| F16 | Removed categorical reliance on old CC deadline and linked newer CIPC guidance; practitioner must resolve entity-specific applicability. |
| F20 | Existing external map fallback retained with explicit failed-map/directions guidance. Embedded map success cannot reliably be inferred across origins. |
| F21 | Future configured form has field bounds, in-flight guard, HTTP-status handling and 15-second abort/recovery. Provider delivery/spam controls remain unverified. |
| F22 | Malformed calculator year queries fall back safely. |
| F23 | Standard-library preview and corrected release documentation. |

## Hosting, DNS and owner actions still required

- **F03/F17 — preserve verified redirects:** retain the Cloudflare HTTPS and www-to-apex rules. Recheck home and deep paths with query strings after routing changes. Do not change the older business/email domain as part of this routine work.
- **F11 — mail:** inventory legitimate senders for `knoesenacc.co.za`, verify SPF/DKIM alignment, then introduce monitored DMARC before enforcement. Do not publish a reject policy without that inventory. Preserve MX and domain registration.
- **F15/F24 — professional/legal facts:** obtain the applicable approved PAIA manual, confirm Information Officer obligations, and supply verifiable registration identifiers or permissioned testimonials. No identifiers, registration status, testimonials or legal documents have been invented.
- **F26 — domains:** owner decides consolidation versus differentiated coexistence after reviewing Search Console/history. No automatic migration is included.
- Verify hosting permissions/MFA, rollback retention and account ownership privately. None were accessible in the audit.
- F12 performance: use the retained matched experiment and field data where available; no field Core Web Vitals improvement is claimed from a code change alone.
- F25 CRO: agree realistic service scope/response expectations before promising a turnaround or price. Measure qualified enquiries separately from taps; do not send personal data into analytics.

## Ongoing tax review

`data/interest-rates.json` is independent of annual Budget data. Review SARS Tables 1–3 monthly and after announced rate changes; record effective dates, source and reviewer. The first schedule was verified against SARS on 21 September 2026. Preserve previous periods. Update the independent fixtures only after comparing authoritative sources, never merely to make a failing test pass.

Annual brackets/rebates remain in `data/tax-rates.json`. Review all hard-coded narrative examples when rolling years forward. Build consistency is not factual validation. Do not enable calculators until a practitioner approves the complete calculation rules and boundary cases, including historical dates.
