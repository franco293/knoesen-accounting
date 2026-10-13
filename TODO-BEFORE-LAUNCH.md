# Owner checks and operational follow-up

The website is already live. This is a current owner checklist, not a claim that the practice has failed the checks below. Use [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md) for release validation and [SEO-PLAYBOOK.md](SEO-PLAYBOOK.md) for the no-cost growth plan.

## Confirmed scope and preferences

- Serve South African SMEs, including remote engagements. Prioritise recurring bookkeeping, payroll and tax clients.
- Provide **compiled annual financial statements only**, quoted individually. Do not advertise audits or independent reviews.
- Visits in Walmer Heights, Gqeberha / Port Elizabeth are by appointment. The owner confirmed the published hours: Monday–Thursday 09:00–17:30; Friday 09:00–17:00; weekends closed.
- The existing Google Business Profile was recovered and updated by the owner. Do not create a duplicate.
- The owner does not want professional registration identifiers or a house number published. Do not invent them or treat their public omission as a technical defect.
- Obtain real client feedback later; do not add fictional testimonials, client counts or outcomes.
- Keep spending at zero, with approximately one hour a day available for growth work.
- The older `knoesenacc.co.za` domain remains an undecided business choice. Email administration was deferred and is not part of routine website fixes.

## 1. Review factual and operational claims

Have a competent practitioner review corrected CIPC and employer-registration guidance, including conditions, visible FAQs, source links and structured data. A successful build cannot approve professional advice. Date only the content actually reviewed.

Confirm that published business statements reflect actual practice: experience, qualifications, services, remote delivery, record handover and any security or response promises. Keep only supportable claims. Public registration numbers remain the owner's choice; a prospect can be given an appropriate verification route privately when needed.

Review the tax calendar and homepage notice after 23 October 2026. At the next Budget, check official figures, eligibility rules, examples and narrative wording together. Interest changes can occur between Budgets and need a separate check.

## 2. Check privacy and client-document practice

The privacy notice, disclaimer and technical consent controls are present. Their presence does not establish compliance with every legal or operational duty.

The owner or adviser should confirm applicable POPIA/PAIA responsibilities, Information Officer requirements, operator arrangements, retention/deletion rules, access procedures and incident response. Match the notice to actual operations and use an approved manual or exemption where applicable. Do not invent registration references or assert that duties were completed without evidence. Begin with the [Information Regulator's official guidance](https://inforegulator.org.za/document/).

Agree a suitable process for exchanging client records privately. Do not ask prospects to post identity documents, tax numbers, bank statements or passwords into public marketing tools. Legal/professional review is an owner task; account settings were not changed as part of this checklist.

## 3. Verify access and recovery privately

Check who owns the hosting, GitHub and registrar accounts, who can publish, whether multi-factor authentication and recovery contacts work, and whether a usable source/release copy can be restored. Check actual bills and free-plan limits before buying an upgrade.

These controls were not fully accessible during the audit. Missing audit access is an evidence gap, not proof of missing backups or insecure accounts. Keep secrets and recovery codes out of this repository and screenshots.

## 4. Preserve the supported contact and analytics setup

Direct call, email and WhatsApp links are the supported enquiry path. The website form is intentionally disabled while its provider key is blank. The existing form code does not prove delivery or effective provider-side spam controls.

Enable a form only after a deliberate business decision and checks for delivery, privacy wording, provider access, spam controls, failure recovery and sensitive-data handling. Do not activate it merely to clear a checklist item. Disabled calculators similarly need full practitioner validation of calculations and boundary cases before activation.

Google Analytics is configured and consent-gated. Cloudflare Web Analytics is separately disclosed and may load without a cookie choice. Preserve accept, reject and withdrawal behavior. Verify current event receipt and settings privately; existing call/email/WhatsApp key events measure contact intent rather than delivered or qualified enquiries.

Track anonymised enquiries, quoted work and won recurring clients in a private ledger. Do not place enquiry text, email addresses or other client identifiers into analytics or the public repository.

## 5. Finish useful search and profile work

Search Console accepted the sitemap. On 13 October, the financial-statements page was still reported as not indexed despite a working live response, canonical and sitemap entry. A request was recorded on 7 October. After meaningful improvements, inspect once and monitor weekly; Google decides whether and when to index it.

Check existing business profiles for accurate facts and the intended website link. Useful no-cost options include [Bing Places](https://www.bing.com/forbusiness/) and [Apple Business](https://business.apple.com/), subject to verification and current South African feature eligibility. Detailed official sources and the current Apple platform name are in SEO-PLAYBOOK.md. Professional membership/profile opportunities need an eligibility check; a free backlink is not promised.

Account access and business verification may require the owner. No new listings, external messages, review requests or submissions have been sent. Use only genuine client reviews, without incentives or invented ratings.

## 6. Keep the domain decision separate

The primary website's HTTPS and www-to-apex redirects were verified in the October audit, including path and query-string preservation. Preserve them and recheck after routing changes. Worker assets accept relative `_redirects` entries; the cross-host www rule belongs in the existing Cloudflare routing configuration.

Before deciding whether the older site should coexist or redirect, inspect its actual traffic, links, ownership and intended role. If it stays, check its contact links and current business information. If consolidation is chosen later, prepare URL-specific redirects and verify results. Preserve the old domain's email service and registration. Deferred email configuration should stay deferred unless the owner reopens it.

## 7. Publish a reviewed release

Run `python publish.py`, preview the resulting `dist/`, and follow RELEASE-CHECKLIST.md. Publish only the allowlisted output, preserve a rollback version and compare live files to the release manifest. Never publish the repository root, audit evidence, account metadata or private client records.

Keep source files, regenerated output and factual review records together in the approved repository. GitHub and production can differ, so a successful push is not proof of a successful deployment. Confirm the actual release and its live behavior.
