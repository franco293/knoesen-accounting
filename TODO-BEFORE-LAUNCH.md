# Before this goes live

Everything on this list needs a decision, a login, or a fact I could not
verify. I deliberately left unverified details **out** of the site rather than
guessing — a fabricated SAIPA number or street address is worse than a missing
one, both for trust and because invented details in structured data are exactly
what Google penalises.

Each item below tells you where to put the value. All of them live in
`site.json`; edit it, run `python build.py`, and every one of the 20 pages
updates at once.

---

## 1. The two-domain problem — read this first

You now have the same practice on two domains:

| | |
|---|---|
| `knoesenacc.co.za` | the original site |
| `knoesen-accounting.co.za` | this one |

**Google will see near-duplicate businesses.** Same name, same phone, same
address, same services. When two sites compete for the same query, Google
usually picks one and suppresses the other — and it normally picks the older,
more-linked domain. That is the one thing that could stop this site ranking no
matter how good it is.

What I have already done about it:

- Every canonical, `og:url`, sitemap entry and JSON-LD URL now points at
  `knoesen-accounting.co.za`. **This was broken** — the live site was telling
  Google "the real version of this page is on knoesenacc.co.za", which alone
  would have prevented it from ever ranking.
- The content is now substantially different and roughly 8× larger, so the two
  sites are no longer near-duplicates of each other. That is the honest way to
  win this: not a prettier copy, a genuinely better resource.

What is still worth deciding:

- **If you control both domains and the goal is one winning site**, 301-redirect
  the old one here once you are happy. That moves its accumulated authority
  across and removes the competition entirely. This is by far the strongest move.
- **If the old site must stay up** (it is your boss's call), accept that you are
  competing with it and lean on the difference: the resource guides, the service
  pages and the local page have no equivalent over there. Those are what you
  will rank for first.
- Either way, **do not copy text between the two sites** from here on.

---

## 2. Register your Information Officer (POPIA — legally required)

Every responsible party in South Africa must register an Information Officer
with the Information Regulator. Lourens is the default as head of the practice.

- Free, about 10 minutes, at [inforegulator.org.za](https://inforegulator.org.za/)
- Once you have a registration reference, add it to
  `content/privacy-policy.html` (search for "Before this site goes live")

## 3. Turn the contact form on

The form is built, styled and spam-protected but has no backend key, so it
currently shows a friendly "please call or email" notice instead of silently
losing enquiries.

1. Get a free access key at [web3forms.com](https://web3forms.com)
2. Put it in `site.json` → `forms.web3forms_key`
3. `python build.py`

Until then, every enquiry has to come by phone, WhatsApp or email.

## 4. The facts I could not verify

Add whichever of these you can confirm. Each is in `site.json`, and each is
currently omitted from both the page and the structured data.

| What | Where in `site.json` | Why it matters |
|---|---|---|
| SARS tax practitioner (PR) number | `credentials.tax_practitioner_number` | The strongest credibility signal an SA accounting site can carry. Renders in the footer and as a verifiable credential in `Person` schema. |
| SAIPA membership number | `credentials.saipa_number` | Same, and lets prospects verify Lourens with SAIPA directly. |
| Full street address | `location.street`, `location.postal_code` | Required for a complete `PostalAddress`. Local ranking depends heavily on address consistency between your site and Google Business Profile. |
| Latitude / longitude | `location.latitude`, `location.longitude` | Adds `GeoCoordinates`. Right-click your building in Google Maps to copy them. |
| Trading hours | `hours.spec`, then set `hours.confirmed: true` | Adds `openingHoursSpecification`. Google shows opening hours in local results; a business with none looks less established. |
| Company registration number | `credentials.company_reg_number` | Optional, but a real trust signal for larger clients and tenders. |

If Lourens is not a registered tax practitioner, leave that row blank and remove
any wording that implies it — **do not put a number there that is not his.**

## 5. Two things that will move the needle more than anything on the page

1. **Create the Google Business Profile.** You said there isn't one for this
   site yet. For "accountant near me" in Gqeberha, this matters more than
   everything in this repository combined. Step-by-step instructions, including
   exact category and description text, are in `SEO-PLAYBOOK.md`.
2. **Get a photograph of Lourens.** The About page currently shows an "LK"
   monogram. A real face on an owner-operated professional services site
   consistently outperforms a placeholder. Drop the image in `assets/` and
   follow the comment at the top of `content/about.html`.

## 6. Content that will go stale

Two things are time-sensitive and will actively hurt you if left to rot:

- **The orange banner on the home page** counts down Filing Season 2026
  (closes 23 October 2026). After that date it is wrong. Edit or delete the
  `<!-- TIMELY NOTICE -->` block in `content/home.html`.
- **All tax figures are for the 2026/27 tax year.** After the next Budget,
  recheck every number against National Treasury's new Tax Guide and update
  `site.json` → `tax_year` plus the tables in `content/guide-rates.html`.
  The review date shown on each guide is a promise to your readers — keep it
  honest.

## 7. Optional: HSTS preload

`_headers` deliberately omits `preload` from the `Strict-Transport-Security`
line. It is a one-way door — once browsers have it, it is very hard to undo.
Only add it when you are certain every subdomain you will ever use is
HTTPS-only.

---

## Quick reference

```bash
python build.py           # rebuild all pages, sitemap.xml and robots.txt
python build.py --check   # rebuild, then fail on any broken internal link
python -m http.server 8000  # preview at http://localhost:8000
```

`build.py` prints a list of everything it omitted for lack of verification, so
you can see at a glance what is still outstanding.
