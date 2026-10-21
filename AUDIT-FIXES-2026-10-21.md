# Board corrections — 21 October 2026

These are the source corrections following the full audit issued on 16 October, with measurements from 15 October. Finding IDs refer to that audit. A source change or successful build does not establish publication; the dated release evidence remains outside this public repository.

| Finding | Correction | Acceptance |
|---|---|---|
| F20 | Refresh the shared consent cookie before permission checks, synchronise open tabs, and refresh on focus, visibility and restored pages. Deny on missing, invalid, expired or unavailable persistence; retain vendor opt-out and cookie cleanup. | Multi-tab grant/withdrawal, expiry, malformed cookie, storage failure and restoration checks with all vendor requests blocked. |
| F10 | Explain submitted-return retention from submission, outstanding returns and other tax-record categories, with longer lawful holds. Update the notice date for the actual edit. | Compare the wording with SARS record keeping and table 3 of its Short Guide to the Tax Administration Act. The private operating schedule still requires confirmation. |
| F11 | Replace the startup guide's universal VAT price/no-benefit claim with conditional pricing, margin, eligible input-tax and compulsory-registration guidance. | Read the short summary together with the linked VAT guide and current SARS explanation. |
| F12 | Derive the HTML author from the same organisation/person choice used by Article metadata. | The practice-authored checklist must name the practice in both locations, without inventing an individual review. |
| F02 | Generate immutable cache rules for exact released CSS/JS files instead of broad code-directory wildcards. | Compare the generated paths with the publication allowlist; verify missing code paths return 404 without one-year immutable caching after publication. |
| F01 | Update the optional font-maintenance instruction to the advisory's patched FontTools 4.60.2 baseline. | Review the upstream advisory and instruction. This is not a production dependency or a claim that every optional package has been audited. Fonts are not regenerated. |
| F03 | Reject trailing junk, malformed grouping, nonfinite inputs and amounts that cannot annualise with safe integer cents. | Focused numeric boundaries plus an independent historical tax fixture and representative gross/net round trips. Calculators remain disabled pending a separate full activation review. |
| F21 | Show an ordinary Menu link to footer navigation until the interactive menu handlers are ready. | Abort the main script, activate Menu by keyboard and verify the footer receives focus and its links remain available. Keep normal desktop/mobile and no-JavaScript navigation working. |

The Python release checks, browser smoke checks, focused consent checks and numeric checks are part of the documented validation procedure. CI runs the same checks in Chromium; additional local engine coverage is recorded in the private release evidence. Emulated browser checks do not certify physical iOS/Android, native screen readers or legal compliance.

## Official references

- [SARS record keeping](https://www.sars.gov.za/client-segments/record-keeping/) and [Short Guide to the Tax Administration Act, table 3](https://www.sars.gov.za/wp-content/uploads/Ops/Guides/LAPD-TAdm-G01-Short-Guide-to-the-Tax-Administration-Act-2011.pdf).
- [SARS VAT explanation](https://www.sars.gov.za/types-of-tax/value-added-tax/).
- [POPIA section 14](https://www.gov.za/sites/default/files/gcis_document/201409/3706726-11act4of2013popi.pdf).
- [FontTools project advisory GHSA-768j-98cg-p3fv](https://github.com/fonttools/fonttools/security/advisories/GHSA-768j-98cg-p3fv).

## Work that remains evidence-dependent

- **R06:** Grow relevant recurring-SME discovery through the existing service pages and legitimate profiles. Compare complete, equal Search Console periods and actual qualified enquiries; code cannot guarantee traffic or clients.
- **R07:** Keep performance under review using comparable conditions. No field Core Web Vitals or INP pass is claimed by this release.
- **R13/R14:** Obtain genuine references and permissioned client evidence when the owner is ready. No fabricated reviews, purchased links, public registration numbers or house number are required by these corrections.
- **R16:** Read a fresh URL Inspection for the financial-statements page before diagnosing a current indexing problem. A dated discovery report does not establish a crawl block.
- Confirm the private retention/disposal schedule, provider contracts, account recovery and billing where access exists. The public wording is not proof of those controls.
- Use [LEAD-MEASUREMENT.md](LEAD-MEASUREMENT.md) for private, deduplicated received enquiry → qualified SME → quote → new client totals. Keep customer information out of analytics and the public repository.

Keep the current static design and source-controlled release process. Continue the no-cost, one-hour daily approach in [SEO-PLAYBOOK.md](SEO-PLAYBOOK.md). The older domain and email administration remain deferred owner choices. No new form, backend, calculator activation, paid subscription, profile submission or external message is part of this release.
