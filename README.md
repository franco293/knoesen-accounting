# Knoesen Accounting, Tax & Payroll — Website

Plain HTML/CSS/JS, no build step, no framework, no dependencies to install.
Push it to GitHub, connect Cloudflare Pages, done.

```
knoesen-accounting/
├── index.html            # the whole site (single page, anchor navigation)
├── privacy-policy.html   # POPIA-compliant privacy notice
├── 404.html               # branded not-found page
├── css/styles.css
├── js/main.js              # mobile nav, scroll-reveal, map consent, contact form
├── assets/                  # favicon, touch icons, manifest icons, OG image
├── manifest.json            # web app manifest
├── robots.txt
├── sitemap.xml
├── _headers                  # Cloudflare Pages: security + cache headers
├── _redirects                 # Cloudflare Pages: apex → www redirect
└── CNAME                       # only used by GitHub Pages custom domains
```

## ⚠️ Before you publish — 4 things only you can finish

Everything below is scaffolded and ready, but needs a decision or a login
from you before it's fully live:

1. **Register your Information Officer.** POPIA requires this. Lourens is
   the default Information Officer as head of the practice — confirm that's
   correct, then register (free, ~10 minutes) at
   [inforegulator.org.za](https://inforegulator.org.za/). Once you have a
   registration reference, you can add it to `privacy-policy.html` (search
   for "Before this site goes live").
2. **Activate the contact form (optional).** It's built and styled, but
   points at a placeholder key so it fails safely instead of silently
   dropping messages. Get a free access key at
   [web3forms.com](https://web3forms.com), then in `index.html` search for
   `REPLACE_WITH_YOUR_WEB3FORMS_ACCESS_KEY` and paste your key over it.
   Don't want a form at all? Delete the `.contact-form-card` block in
   `index.html` (it's clearly commented) — direct call/WhatsApp/email still
   works either way.
3. **Read `privacy-policy.html` end to end.** I wrote it to be accurate for
   a solo/small SAIPA accounting practice based on what's on the live site,
   but you know your engagement terms, retention practices and software
   providers better than I do — treat it as a strong first draft, not a
   final legal document, and have it checked if you want certainty.
4. **HSTS `preload`** was deliberately left out of `_headers`. It's a
   one-way door (once a browser has it, you can't easily undo it), so only
   add `preload` to the `Strict-Transport-Security` line once you're
   certain every subdomain you'll ever use is HTTPS-only.

## What changed in this pass, and why

### Security (`_headers`)
- Added a real **Content-Security-Policy** — previously there wasn't one.
  It's locked down to `'self'` plus the exact third parties the site
  actually talks to (Google Fonts, the Google Maps embed, Web3Forms), with
  no `unsafe-inline` needed anywhere, because every inline `style="..."`
  attribute in the old footer was moved into `css/styles.css` first.
- Added `Strict-Transport-Security`, `Cross-Origin-Opener-Policy`,
  `Cross-Origin-Resource-Policy`, and `X-Permitted-Cross-Domain-Policies`.
- Widened `Permissions-Policy` to also block payment, USB and the
  ad-tracking "Topics"/FLoC APIs the site never needed.
- The Google Maps embed no longer loads automatically — it's gated behind
  a "Load Map" click, so the site doesn't hand every visitor's IP address
  to Google before they've asked for a map (`js/main.js` +
  `.map-consent` in `css/styles.css`).
- The new contact form has a honeypot field for spam bots and detects the
  placeholder access key so it degrades gracefully instead of failing
  silently (see item 2 above).

### POPIA / privacy
- New `privacy-policy.html`: responsible party and Information Officer
  details, what's collected (website vs. client engagements, kept clearly
  separate), lawful grounds for processing, every third party the site
  actually shares data with, retention, security safeguards, data subject
  rights, and verified current contact details for the Information
  Regulator (checked live, not from memory, since getting a regulator's
  contact details wrong in a legal notice is worse than not having one).
- Linked from the footer of every page and from the contact form's consent
  checkbox.
- The contact form asks people *not* to submit ID numbers, tax numbers or
  banking details — those belong in a proper client-onboarding channel,
  not a public web form. This is a deliberate data-minimisation choice.

### SEO
- Added `FAQPage` structured data that mirrors the visible FAQ section
  word-for-word, so it's eligible for rich results without claiming
  anything not already on the page.
- Added a service catalog (`hasOfferCatalog`) to the existing
  `AccountingService` structured data, listing the four service groups
  already on the page.
- Added `privacy-policy.html` to `sitemap.xml` with a `lastmod` date.

### Accessibility (WCAG AA)
- Several text/icon colour pairs were below the 4.5:1 contrast minimum for
  small text — most visibly, the brass "eyebrow" labels used throughout
  the page sat at ~2.8:1 against the paper background. Added a darker
  `--brass-text` token used specifically for text/icons on light
  backgrounds, while keeping the original lighter brass for its existing
  job on dark backgrounds (header, hero, dark sections), where it already
  passed comfortably.
- Fixed the "At A Glance" ledger card's row labels (was 3.4:1, now 6.8:1).
- Made the global focus-visible outline colour context-aware so it stays
  legible against both light and dark sections — important for anyone
  navigating by keyboard.

### UX / conversion
- Added an optional contact form alongside the existing call/WhatsApp/email
  options, for people who'd rather type than call.
- Footer restructured into three columns (Sitemap / Contact / Legal &
  Privacy) so the privacy notice is one click away from anywhere on the
  site, and the decorative-but-inline-styled column labels became a real,
  semantic `<h3 class="footer-label">` — cleaner markup, and it's what let
  the CSP above drop `unsafe-inline` entirely.

### Code quality
- Ran the new markup through `tidy` and a tag-balance check; the only
  warnings left are either inherited from the original file (literal `&`
  in third-party URLs, which every browser handles fine) or `tidy`
  flagging a `<dl>` grouping pattern that's actually valid, current HTML5
  — not real issues.
- Removed a small piece of dead CSS (`.footer-col h5`, which nothing used)
  by turning it into the `.footer-label` class described above.

## What I deliberately *didn't* touch

- **No invented facts.** I didn't add a SAIPA membership number, VAT
  number, street address, or business hours anywhere, because I don't have
  them and guessing would be worse than leaving them out. Add these
  yourself wherever you'd like the extra trust signal.
- **No design overhaul.** The "ledger" visual language, layout, and content
  were already good — original, on-brand, and not generic template
  filler. I extended the existing design system rather than replacing it.
- **No analytics or ad tracking added.** The site still doesn't track
  visitors. If you add Google Analytics or Meta Pixel later, update
  `privacy-policy.html` and `_headers`' CSP `connect-src`/`script-src` to
  match.

## Preview it locally

Any static file server works. From inside the project folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

or, if you have Node installed:

```bash
npx serve .
```

## Deploy: GitHub + Cloudflare Pages (recommended)

1. **Push to GitHub.**
   ```bash
   git init
   git add .
   git commit -m "Initial site"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```

2. **Connect Cloudflare Pages to the repo.**
   - Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** →
     **Connect to Git** → pick the repository.
   - Build settings: **no build command**, output directory `/` (this is a
     static site, nothing to build).
   - Click **Save and Deploy**. You'll get a `*.pages.dev` URL immediately.

3. **Point your domain at it.**
   - In the Pages project → **Custom domains** → add `www.knoesenacc.co.za`
     (and `knoesenacc.co.za` if you want the apex to work too).
   - If your domain's DNS is already on Cloudflare, this is a one-click
     step. If not, Cloudflare will give you the DNS records to add wherever
     the domain is currently managed.
   - The included `_redirects` file sends the apex domain to `www` so you
     don't end up with duplicate-content issues. If you'd rather make the
     apex domain canonical instead, delete `_redirects` and swap the `www.`
     URLs in `index.html`, `privacy-policy.html` and `sitemap.xml` for the
     apex domain.

Every future `git push` to `main` redeploys automatically.

## Deploy: GitHub Pages (alternative)

1. Push the repo to GitHub (see above).
2. Repo → **Settings** → **Pages** → **Deploy from branch** → `main` /
   `/(root)`.
3. The included `CNAME` file already points at `www.knoesenacc.co.za` — add
   that as a `CNAME` DNS record pointing to `<your-username>.github.io`, or
   delete the `CNAME` file to use the default `github.io` URL instead.

Note: GitHub Pages doesn't support the `_headers` file, so the security
headers described above only apply on Cloudflare Pages. If you go with
GitHub Pages, consider fronting it with Cloudflare (free tier, "orange
cloud" proxy) so you can still set them.

## Editing content

Everything lives in `index.html` and `privacy-policy.html` — there's no CMS
or templating. To:

- **Change text:** edit the relevant section directly; each section in
  `index.html` is commented (`<!-- ==== ABOUT ==== -->` etc.).
- **Add a real photo of Lourens:** drop the image in `assets/`, then in the
  `#owner` section replace the `.owner-frame` SVG with an `<img>` tag.
- **Update contact details:** phone/WhatsApp/email appear in the header,
  hero, contact section, footer, and the JSON-LD block in `<head>` of both
  HTML files — search for the phone number or email to catch every
  instance.
- **Colours & type:** all defined once as CSS custom properties at the top
  of `css/styles.css` under `:root`.

## Optional next steps

- Consider a Google Business Profile listing linking back to this site —
  it does more for local search rankings than anything on the page itself.
- If you'd like a second opinion on the privacy notice from an admitted
  attorney, the Law Society of South Africa's "find a lawyer" tool is a
  reasonable starting point.
