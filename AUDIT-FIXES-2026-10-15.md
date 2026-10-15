# October follow-up repairs

These changes implement the actionable source findings from the post-release audit. This record describes the change and acceptance method; a commit or passing local preview alone is not proof of production publication.

## Correctness and helpful content

- Employee-loan official interest is 8.25% from 1 October 2026. The June–September 8.00% and earlier 7.75% periods remain explicit. SARS Tables 1–3 were checked on 15 October; annual Budget figures were not re-dated.
- Provisional-tax exemptions distinguish the no-business condition, relevant taxable income and alternative tax-threshold test. Service, filing guidance and matching FAQ data agree.
- Payroll benefit wording includes applicable exemptions/valuation, including mainly-business telephone use.
- VAT deregistration explains eligible input-tax deductions, avoids a universal 15% fuel-cost claim and says existing vendors must continue their obligations until cancellation is effective.
- CIPC reinstatement explains the 30-business-day completion requirement, current practice note and evidence retention. Court-order wording distinguishes the mandate from subsequent filing compliance.
- Article edit dates, scoped source checks and practitioner review are described separately.
- A practical month-end records checklist supports existing monthly bookkeeping services. Organisation attribution and explicitly illustrative examples avoid an invented personal review or client case study.
- Filing-season cards use dated deadlines instead of an indefinitely stale “open” claim.

## Delivery, performance and regression controls

- Workers assets use the prepared 404 page while retaining HTTP 404. Verify status and recovery content on the provider after publication.
- A measured mobile candidate defers offscreen content sections and discovers the stylesheet before font preloads. Fonts, licence notices, layout and direct contact choices are retained. Print and no-JavaScript use ordinary full layout.
- Printed pages omit the site navigation footer, preserving article content and avoiding unnecessary navigation sheets.
- The existing Python checks remain; Chromium acceptance now covers rendered page geometry, keyboard menu/focus, consent grant/withdrawal, map fallback, source exclusions, disabled tools and readable no-JavaScript content.
- Browser tooling is development-only, version-pinned and locked. Vendor requests are intercepted; no automated enquiry is sent.
- The post-release checker compares prepared HTML/assets and tests actual missing-page recovery, private-path exclusions and redirects. Preview routing alone does not establish Workers routing.

Run the build and browser commands in README.md. Publish only dist, preserve a provider rollback version, then run npm run verify:live and inspect representative live pages. Keep audit evidence, account information and client outcomes outside this public repository.

## Boundaries that remain

No invented testimonials, professional identifiers, house number, fees or response guarantees were added. Forms and calculators stay disabled until their complete acceptance gates are met; the old calculator interest snapshot is explicitly historical, not the active current-rate authority.

Search indexing, real customer outcomes, independent references, physical devices, assistive technology and private legal/account controls require their own evidence. Laboratory results are not field Core Web Vitals or measured INP. No domain/mail change, paid service, external message or monitoring subscription is part of this source release.
