# Measuring enquiries and clients

Website events describe **contact intent**. `contact_call`, `contact_email`, `contact_whatsapp` and `contact_facebook` mean someone activated a link after analytics consent. They do not establish that a message was received, that the visitor is unique, or that a client accepted a quote. Do not add the event counts together and label the result clients or qualified leads.

## Weekly owner record

Keep a private record outside the public repository. Record only what is useful for marketing and follow-up: received date, prospect-reported source, service needed, qualified yes/no, quote date, accepted/lost/pending and recurring/once-off. A private reference can connect it to normal business records. Avoid tax IDs, employee details, bank information and document attachments in this marketing record.

| Week | Received enquiries | Qualified SME enquiries | Quotes issued | New recurring clients | New once-off clients | Source notes |
|---|---:|---:|---:|---:|---:|---|
| Add your actual week | | | | | | |

Use actual counts; a blank is unknown, not zero. Agree what qualifies an enquiry: a real SME needing an offered service, with a workable scope and fee. The owner decides fit; clicks cannot make that decision.

## Monthly comparison

1. Search Console: Web search, South Africa, last28days compared with previous28days. Export Queries and Pages with clicks, impressions, CTR and average position. Separate brand searches from service questions; page averages are not rankings for a particular query.
2. GA4: same dates, Organic Search landing pages, sessions and the four contact-intent events. Check each event's actual receipt before relying on it. Analytics opt-outs and blocked scripts mean the figures are incomplete.
3. Compare the private qualified-enquiry, quote and accepted-client counts. One person may use several channels; count the person/engagement once in the business record.

If an intent event is marked as a GA4 key event, keep its name and interpretation as intent. An accepted client should be counted separately only from actual business evidence. No accepted-client event or revenue has been invented here. Do not put personal information in page URLs, analytics parameters or campaign tags.

## Consent acceptance check

Use a local or preview test with third-party requests intercepted where possible. Before analytics consent, clicking a channel must not queue an event. After consent, a channel activation should queue only its event name, placement and page path. After withdrawal, no further intent event should queue. These checks verify the website queue; GA4 report receipt is a separate owner/account check. Do not send a test enquiry or place a call just to count a click.
