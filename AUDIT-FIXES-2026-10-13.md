# October audit fixes

Prepared from the full website audit dated13October2026. IDs below refer to that audit, not the older September release checklist. Source changes and tests are recorded here; a GitHub push or prepared release does not itself prove production deployment.

## Implemented changes

| Finding | Change |
|---|---|
| F01 | CIPC company/CC deadline shared between body, FAQ and calendar via data/editorial-facts.json; late-filing penalties and reinstatement wording corrected against current CIPC guidance |
| F02 | Startup employer guidance separates PAYE, SDL and UIF, including PAYE registration exception and SDL threshold exemption |
| F03 | Existing crawlable AFS URL/canonical/sitemap preserved; added a relevant contextual link from the small-business guide; Google indexing remains outside website control |
| F04 | Fixed-weight font instances reduced layout work in matched local mobile tests, preserving character coverage and sampled geometry; original licence notices bundled and IBM derivatives renamed as required |
| F05 | Bookkeeping title/H1/breadcrumb/lead, homepage service emphasis and contact quote preparation aligned with recurring SME support; AFS remains separately quoted compilation only |
| F06 | Accurate reference-source/last-updated labels; specific source-check dates; interest source changed to effective-dated SARS Table1 rather than annual Budget attribution |
| F07 | Removed unverified experience totals and softened absolute handover, recourse, client-prevalence, software and compliance claims |
| F08 | Added explicit consent-gated Facebook contact-intent event; measurement guidance distinguishes taps, received enquiries, quotes and actual accepted clients |
| F09 | Replaced stale growth instructions with current no-cost profile/link work and the owner's recovered Google profile; no artificial links or external submissions |
| F11 | Embedded map state describes request/slow/failure honestly and keeps the existing directions alternative |

Two independent CIPC regression checks and an SDL boundary wording check prevent the observed drift; the existing four release tests remain. An additional safety check prevents replacement of an unreadable previous release directory. A separate three-case arithmetic fixture verified the disabled employer calculator below, at and above the R500,000 SDL exemption threshold. A pinned, read-only GitHub workflow builds the allowlisted release and runs the eight Python tests without deploying.

## Performance acceptance

Three alternating local baseline/candidate runs per page (24runs overall), 390×844 emulation, requested4×CPU and throttled network, showed median LCP improvements from3.09to2.60s homepage,3.10to2.76s accounting,3.15to3.02s tax rates, and3.00to2.50s contact. Layout duration decreased23–39%; load-window long-task totals decreased76–89%; median CLS was zero. Several pages fetch more font files and transfer more bytes, so this is a measured rendering/network tradeoff. Field Core Web Vitals, INP and physical-device improvement are not claimed. These local medians are not directly comparable with the earlier live audit.

Preserve the new filenames when updating fonts. The optional maintenance tool reproduces the used weights and derivative names while keeping glyph coverage, copyright and licence metadata. Publication now includes only active CSS/preload font files and the explicit original licence notices; unreferenced maintenance inputs stay in the source repository.

## Remaining external decisions and evidence

- F03: inspect the live AFS URL after publication and monitor weekly. Google decides indexing; this file does not claim it is indexed.
- F08/G02: verify actual GA4 receipt/settings with account access and keep a private record of qualified enquiries, quotes and accepted clients. No client figures are invented.
- F09: eligible business/profile verification and genuine relationship links require business access/participation. No messages, reviews or listings were submitted by these code changes.
- F10/G06: the older domain's malformed email anchor requires access to that site's owner. Its coexistence/consolidation remains an undecided business choice. Email administration stays deferred.
- G01/G04: account recovery, MFA, bills, privacy operations and professional legal duties require private owner/adviser evidence. Public source checks do not constitute legal or practitioner certification.
- G03: automated geometry/accessibility and browser emulation do not establish physical-device, native Safari/iOS/Android or complete assistive-technology coverage.
- G05: form and calculators remain deliberately disabled until delivery, spam/privacy handling and financial-rule acceptance are verified.

The owner's choices about public registration IDs, house number and later genuine client testimonials are preserved. No paid tools, subscriptions, new backend or wholesale design replacement were introduced.

## Release procedure

Follow RELEASE-CHECKLIST.md. Build and validate in a disposable copy, inspect its dist output, preserve a prior production version, publish only the allowlisted release and compare live assets with the manifest. Keep private audit evidence outside this repository and production assets. LEAD-MEASUREMENT.md and SEO-PLAYBOOK.md describe the ongoing owner work.
