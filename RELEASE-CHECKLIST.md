# Audit repair release

Prepared locally following the September 2026 audit. This file records code changes and outstanding operational work; it is not proof that production was deployed.

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
| F05, F06 | Contact intent events require current analytics permission; vendor consent updates precede loading; Google opt-out flag changes on withdrawal/regrant. Private GA reporting still needs verification. |
| F07 | Cookie reads/decoding/writes/deletion cannot prevent the current in-memory consent choice. If persistence is blocked, the browser may not retain that choice across visits. |
| F08, F09, F18, F19 | Short-screen settings scroll, focus returns to opener, larger checkbox, verified narrow menu, readable 404 heading and no-script navigation. |
| F13 | Corrected 2025/26 brackets; independent fixtures and worked-result browser test. Calculators remain disabled. |
| F16 | Removed categorical reliance on old CC deadline and linked newer CIPC guidance; practitioner must resolve entity-specific applicability. |
| F20 | Existing external map fallback retained with explicit failed-map/directions guidance. Embedded map success cannot reliably be inferred across origins. |
| F21 | Future configured form has field bounds, in-flight guard, HTTP-status handling and 15-second abort/recovery. Provider delivery/spam controls remain unverified. |
| F22 | Malformed calculator year queries fall back safely. |
| F23 | Standard-library preview and corrected release documentation. |

## Hosting, DNS and owner actions still required

- **F03 — HTTPS:** in the Cloudflare zone enable Always Use HTTPS (or an equivalent edge redirect). Verify HTTP home and deep paths redirect to matching HTTPS URLs with query strings preserved. The existing static `_redirects` file cannot enforce this host/scheme rule. HSTS is already present; it does not replace the redirect.
- **F17 — www:** if this entry point is supported, add the hostname, valid certificate and one canonical redirect to the apex preserving paths/query. Do not change the older business domain as part of this routine fix.
- **F11 — mail:** inventory legitimate senders for `knoesenacc.co.za`, verify SPF/DKIM alignment, then introduce monitored DMARC before enforcement. Do not publish a reject policy without that inventory. Preserve MX and domain registration.
- **F15/F24 — professional/legal facts:** obtain the applicable approved PAIA manual, confirm Information Officer obligations, and supply verifiable registration identifiers or permissioned testimonials. No identifiers, registration status, testimonials or legal documents have been invented.
- **F26 — domains:** owner decides consolidation versus differentiated coexistence after reviewing Search Console/history. No automatic migration is included.
- Verify hosting permissions/MFA, rollback retention and account ownership privately. None were accessible in the audit.
- F12 performance: use the retained matched experiment and field data where available; no field Core Web Vitals improvement is claimed from a code change alone.
- F25 CRO: agree realistic service scope/response expectations before promising a turnaround or price. Measure qualified enquiries separately from taps; do not send personal data into analytics.

## Ongoing tax review

`data/interest-rates.json` is independent of annual Budget data. Review SARS Tables 1–3 monthly and after announced rate changes; record effective dates, source and reviewer. The first schedule was verified against SARS on 21 September 2026. Preserve previous periods. Update the independent fixtures only after comparing authoritative sources, never merely to make a failing test pass.

Annual brackets/rebates remain in `data/tax-rates.json`. Review all hard-coded narrative examples when rolling years forward. Build consistency is not factual validation. Do not enable calculators until a practitioner approves the complete calculation rules and boundary cases, including historical dates.
