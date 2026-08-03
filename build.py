#!/usr/bin/env python3
"""
Static site generator for Knoesen Accounting, Tax & Payroll.

Why this exists
---------------
The site grew from one page to ~20. Hand-maintaining the header, footer,
navigation, breadcrumbs, structured data and NAP details across 20 files is how
sites drift: a phone number gets updated in four places and missed in a fifth,
and Google starts seeing inconsistent business details. So: one config
(site.json), one manifest (content/pages.json), one body fragment per page
(content/*.html), and this script stitches them together.

The OUTPUT is plain, dependency-free static HTML committed to the repo.
Cloudflare needs no build command and nothing here runs in production. If this
script vanished tomorrow the site would keep working exactly as-is.

Usage
-----
    python build.py           # write all pages + sitemap.xml + robots.txt
    python build.py --check   # build, then fail loudly on broken internal links

Requires Python 3.8+. No third-party packages.
"""

from __future__ import annotations

import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONTENT = ROOT / "content"

SITE = json.loads((ROOT / "site.json").read_text(encoding="utf-8"))
PAGES = json.loads((CONTENT / "pages.json").read_text(encoding="utf-8"))

DOMAIN = SITE["domain"].rstrip("/")
BRAND = SITE["brand"]
PRINCIPAL = SITE["principal"]
CONTACT = SITE["contact"]
LOCATION = SITE["location"]
CREDS = SITE["credentials"]
TAXYEAR = SITE["tax_year"]

BUILD_DATE = date.today().isoformat()


def asset_version(relative_path: str) -> str:
    """Short content hash used to cache-bust /css and /js.

    `_headers` serves these with `max-age=31536000, immutable`, which tells the
    browser never to revalidate for a year. At a filename that never changes,
    that is a trap: the HTML is served `max-age=0` and so is always fresh, but
    a returning visitor keeps the stylesheet they cached on a previous visit.
    New HTML plus an old stylesheet renders as an unstyled mess — the nav
    dropdowns lose their positioning rules and stack down the page over the
    hero. That is exactly what happened after the single-page-to-multi-page
    rebuild changed the CSS structure.

    Appending a content hash makes the URL change whenever the bytes change,
    so `immutable` becomes correct instead of dangerous: old visitors request
    a URL they have never cached and get the matching file immediately.
    """
    path = ROOT / relative_path
    if not path.exists():
        return BUILD_DATE
    import hashlib

    return hashlib.sha256(path.read_bytes()).hexdigest()[:10]


CSS_VERSION = asset_version("css/styles.css")
JS_VERSION = asset_version("js/main.js")


# --------------------------------------------------------------------------
# Small helpers
# --------------------------------------------------------------------------

def esc(text: str) -> str:
    """Escape for use inside an HTML attribute or text node."""
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def url_for(slug: str) -> str:
    """Absolute canonical URL for a slug. '' is the home page."""
    return DOMAIN + "/" if slug == "" else f"{DOMAIN}/{slug}"


def path_for(slug: str) -> str:
    """Site-root-relative href. Cloudflare serves foo.html at /foo."""
    return "/" if slug == "" else f"/{slug}"


def outfile_for(slug: str) -> Path:
    return ROOT / ("index.html" if slug == "" else f"{slug}.html")


def has(*keys: str) -> bool:
    """True only when every referenced config value is present and non-empty.

    Used to gate anything we haven't been able to verify. An unverified SAIPA
    number or street address is worse than none at all — it is both a trust
    problem and, for structured data, something Google can penalise.
    """
    lookup = {
        "street": LOCATION["street"],
        "postal_code": LOCATION["postal_code"],
        "lat": LOCATION["latitude"],
        "lng": LOCATION["longitude"],
        "saipa": CREDS["saipa_number"],
        "practitioner": CREDS["tax_practitioner_number"],
        "company_reg": CREDS["company_reg_number"],
        "vat": CREDS["vat_number"],
        "hours": SITE["hours"]["confirmed"],
        "web3forms": SITE["forms"]["web3forms_key"],
    }
    return all(bool(lookup[k]) for k in keys)


# Tokens usable inside content/*.html so contact details are never hard-coded
# in prose. Add to this map rather than typing a phone number into a fragment.
TOKENS = {
    "{{brand}}": BRAND["name"],
    "{{brand_short}}": BRAND["short_name"],
    "{{principal}}": PRINCIPAL["name"],
    "{{principal_first}}": PRINCIPAL["name"].split()[0],
    "{{role}}": PRINCIPAL["role"],
    "{{body}}": PRINCIPAL["body"],
    "{{body_full}}": PRINCIPAL["body_full"],
    "{{phone}}": CONTACT["phone_display"],
    "{{phone_link}}": f'<a href="tel:{CONTACT["phone_e164"]}">{CONTACT["phone_display"]}</a>',
    "{{tel}}": CONTACT["phone_e164"],
    "{{whatsapp}}": CONTACT["whatsapp_url"],
    "{{email}}": CONTACT["email"],
    "{{email_link}}": f'<a href="mailto:{CONTACT["email"]}">{CONTACT["email"]}</a>',
    "{{city}}": LOCATION["city"],
    "{{city_alt}}": LOCATION["city_alt"],
    "{{suburb}}": LOCATION["suburb"],
    "{{region}}": LOCATION["region"],
    "{{founded}}": BRAND["founded_label"],
    "{{tax_year}}": TAXYEAR["label"],
    "{{tax_period}}": TAXYEAR["period"],
    "{{verified_on}}": TAXYEAR["verified_on"],
    # main.js checks for this exact sentinel and, when it finds it, disables
    # the form and shows the phone/email instead of posting into the void.
    "{{WEB3FORMS_KEY}}": SITE["forms"]["web3forms_key"] or "UNCONFIGURED",
}


def detokenise(markup: str) -> str:
    for token, value in TOKENS.items():
        markup = markup.replace(token, value)
    return markup


# --------------------------------------------------------------------------
# Structured data
# --------------------------------------------------------------------------

def org_node() -> dict:
    """The practice itself. Every other node points back at this @id."""
    address = {
        "@type": "PostalAddress",
        "addressLocality": LOCATION["city"],
        "addressRegion": LOCATION["region"],
        "addressCountry": LOCATION["country"],
    }
    if has("street"):
        address["streetAddress"] = LOCATION["street"]
    if has("postal_code"):
        address["postalCode"] = LOCATION["postal_code"]

    node = {
        "@type": ["AccountingService", "ProfessionalService", "LocalBusiness"],
        "@id": f"{DOMAIN}/#organization",
        "name": BRAND["name"],
        "alternateName": BRAND["short_name"],
        "url": DOMAIN + "/",
        "logo": f"{DOMAIN}/assets/icon-512.png",
        "image": f"{DOMAIN}/assets/og-image.png",
        "telephone": CONTACT["phone_e164"],
        "email": CONTACT["email"],
        "address": address,
        "foundingDate": BRAND["founded"],
        "founder": {"@id": f"{DOMAIN}/#lourens-knoesen"},
        "employee": {"@id": f"{DOMAIN}/#lourens-knoesen"},
        "currenciesAccepted": "ZAR",
        "knowsLanguage": ["en-ZA", "af-ZA"],
        "sameAs": [CONTACT["facebook"]],
        "description": (
            f"{PRINCIPAL['body']}-registered accounting, tax and payroll practice serving "
            f"small and medium-sized businesses in {LOCATION['city']} "
            f"({LOCATION['city_alt']}) and across the Nelson Mandela Bay Metro."
        ),
        "areaServed": [
            {"@type": "City", "name": "Gqeberha"},
            {"@type": "City", "name": "Kariega"},
            {"@type": "AdministrativeArea", "name": "Nelson Mandela Bay Metropolitan Municipality"},
            {"@type": "AdministrativeArea", "name": "Eastern Cape"},
        ],
        "hasOfferCatalog": {
            "@type": "OfferCatalog",
            "name": "Accounting, tax and payroll services",
            "itemListElement": [
                {
                    "@type": "Offer",
                    "itemOffered": {
                        "@type": "Service",
                        "name": "Accounting & Financial Statements",
                        "url": f"{DOMAIN}/services/accounting",
                        "description": "Annual financial statements, monthly bookkeeping and management accounts.",
                    },
                },
                {
                    "@type": "Offer",
                    "itemOffered": {
                        "@type": "Service",
                        "name": "Tax & SARS Services",
                        "url": f"{DOMAIN}/services/tax",
                        "description": "Income tax, provisional tax, VAT and other SARS declarations.",
                    },
                },
                {
                    "@type": "Offer",
                    "itemOffered": {
                        "@type": "Service",
                        "name": "Payroll Services",
                        "url": f"{DOMAIN}/services/payroll",
                        "description": "Payslips, EMP201 and EMP501 submissions, UIF and SDL compliance.",
                    },
                },
                {
                    "@type": "Offer",
                    "itemOffered": {
                        "@type": "Service",
                        "name": "Company Secretarial & CIPC",
                        "url": f"{DOMAIN}/services/company-secretarial",
                        "description": "CIPC annual returns, beneficial ownership filings, registrations and deregistrations.",
                    },
                },
            ],
        },
    }

    if has("lat", "lng"):
        node["geo"] = {
            "@type": "GeoCoordinates",
            "latitude": LOCATION["latitude"],
            "longitude": LOCATION["longitude"],
        }
    if has("company_reg"):
        node["identifier"] = CREDS["company_reg_number"]
    if has("vat"):
        node["vatID"] = CREDS["vat_number"]
    if has("hours"):
        node["openingHoursSpecification"] = [
            {
                "@type": "OpeningHoursSpecification",
                "dayOfWeek": block["days"],
                "opens": block["opens"],
                "closes": block["closes"],
            }
            for block in SITE["hours"]["spec"]
        ]
    return node


def person_node() -> dict:
    node = {
        "@type": "Person",
        "@id": f"{DOMAIN}/#lourens-knoesen",
        "name": PRINCIPAL["name"],
        "givenName": PRINCIPAL["name"].split()[0],
        "familyName": PRINCIPAL["name"].split()[-1],
        "jobTitle": PRINCIPAL["role"],
        "url": f"{DOMAIN}/about",
        "worksFor": {"@id": f"{DOMAIN}/#organization"},
        "memberOf": {
            "@type": "Organization",
            "name": PRINCIPAL["body_full"],
            "alternateName": PRINCIPAL["body"],
            "url": PRINCIPAL["body_url"],
        },
        "knowsAbout": [
            "South African taxation",
            "SARS compliance",
            "Payroll administration",
            "Financial statement compilation",
            "VAT",
            "CIPC statutory filings",
            "Small business accounting",
        ],
    }
    creds = []
    if has("saipa"):
        creds.append({
            "@type": "EducationalOccupationalCredential",
            "credentialCategory": "Professional membership",
            "name": f"{PRINCIPAL['body']} member {CREDS['saipa_number']}",
            "recognizedBy": {"@type": "Organization", "name": PRINCIPAL["body_full"]},
        })
    if has("practitioner"):
        creds.append({
            "@type": "EducationalOccupationalCredential",
            "credentialCategory": "Registration",
            "name": f"SARS registered tax practitioner {CREDS['tax_practitioner_number']}",
            "recognizedBy": {"@type": "GovernmentOrganization", "name": "South African Revenue Service"},
        })
    if creds:
        node["hasCredential"] = creds
    return node


def website_node() -> dict:
    return {
        "@type": "WebSite",
        "@id": f"{DOMAIN}/#website",
        "url": DOMAIN + "/",
        "name": BRAND["name"],
        "inLanguage": SITE["locale"],
        "publisher": {"@id": f"{DOMAIN}/#organization"},
    }


def breadcrumb_node(page: dict) -> dict | None:
    trail = page.get("breadcrumbs") or []
    if not trail:
        return None
    items = [{"name": "Home", "slug": ""}] + trail + [{"name": page["breadcrumb"], "slug": page["slug"]}]
    return {
        "@type": "BreadcrumbList",
        "@id": url_for(page["slug"]) + "#breadcrumb",
        "itemListElement": [
            {
                "@type": "ListItem",
                "position": i + 1,
                "name": item["name"],
                "item": url_for(item["slug"]),
            }
            for i, item in enumerate(items)
        ],
    }


def faq_node(page: dict) -> dict | None:
    faqs = page.get("faq") or []
    if not faqs:
        return None
    return {
        "@type": "FAQPage",
        "@id": url_for(page["slug"]) + "#faq",
        "mainEntity": [
            {
                "@type": "Question",
                "name": detokenise(item["q"]),
                "acceptedAnswer": {"@type": "Answer", "text": detokenise(item["a"])},
            }
            for item in faqs
        ],
    }


def page_node(page: dict) -> dict:
    """WebPage / Service / Article depending on what the page actually is."""
    kind = page.get("type", "page")
    url = url_for(page["slug"])
    updated = page.get("updated", BUILD_DATE)

    if kind == "service":
        return {
            "@type": "Service",
            "@id": url + "#service",
            "name": page["h1"],
            "url": url,
            "description": page["description"],
            "serviceType": page.get("service_type", page["h1"]),
            "provider": {"@id": f"{DOMAIN}/#organization"},
            "areaServed": [
                {"@type": "City", "name": "Gqeberha"},
                {"@type": "AdministrativeArea", "name": "Nelson Mandela Bay Metropolitan Municipality"},
            ],
            "audience": {"@type": "BusinessAudience", "name": "Small and medium-sized businesses"},
        }

    if kind == "article":
        return {
            "@type": "Article",
            "@id": url + "#article",
            "headline": page["h1"],
            "description": page["description"],
            "url": url,
            "inLanguage": SITE["locale"],
            "datePublished": page.get("published", updated),
            "dateModified": updated,
            "author": {"@id": f"{DOMAIN}/#lourens-knoesen"},
            "publisher": {"@id": f"{DOMAIN}/#organization"},
            "isAccessibleForFree": True,
            "mainEntityOfPage": {"@type": "WebPage", "@id": url},
        }

    return {
        "@type": "WebPage",
        "@id": url + "#webpage",
        "url": url,
        "name": page["title"],
        "description": page["description"],
        "isPartOf": {"@id": f"{DOMAIN}/#website"},
        "about": {"@id": f"{DOMAIN}/#organization"},
        "inLanguage": SITE["locale"],
        "dateModified": updated,
    }


def jsonld_for(page: dict) -> str:
    graph = [org_node(), person_node(), website_node(), page_node(page)]
    for extra in (breadcrumb_node(page), faq_node(page)):
        if extra:
            graph.append(extra)
    payload = {"@context": "https://schema.org", "@graph": graph}
    body = json.dumps(payload, indent=2, ensure_ascii=False)
    return f'<script type="application/ld+json">\n{body}\n    </script>'


# --------------------------------------------------------------------------
# Chrome: head, header, footer
# --------------------------------------------------------------------------

def head_for(page: dict) -> str:
    url = url_for(page["slug"])
    title = esc(page["title"])
    desc = esc(page["description"])
    robots = page.get("robots", "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1")
    og_type = "article" if page.get("type") == "article" else "website"

    return f"""<meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{title}</title>
    <meta name="description" content="{desc}" />
    <meta name="robots" content="{robots}" />
    <link rel="canonical" href="{url}" />
    <meta name="theme-color" content="#1E3B2F" />
    <meta name="color-scheme" content="light" />
    <meta name="author" content="{esc(PRINCIPAL['name'])}" />
    <meta name="geo.region" content="ZA-EC" />
    <meta name="geo.placename" content="{esc(LOCATION['city'])}" />

    <meta property="og:type" content="{og_type}" />
    <meta property="og:site_name" content="{esc(BRAND['name'])}" />
    <meta property="og:title" content="{title}" />
    <meta property="og:description" content="{desc}" />
    <meta property="og:url" content="{url}" />
    <meta property="og:image" content="{DOMAIN}/assets/og-image.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="{esc(BRAND['name'])} — {esc(LOCATION['city'])}" />
    <meta property="og:locale" content="{SITE['og_locale']}" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="{title}" />
    <meta name="twitter:description" content="{desc}" />
    <meta name="twitter:image" content="{DOMAIN}/assets/og-image.png" />

    <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg" />
    <link rel="icon" type="image/x-icon" href="/assets/favicon.ico" />
    <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png" />
    <link rel="manifest" href="/manifest.json" />

    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,300;0,600;0,700;1,300;1,500&family=IBM+Plex+Mono:wght@400;500;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="/css/styles.css?v={CSS_VERSION}" />

    {jsonld_for(page)}"""


def nav_markup(current: str) -> str:
    """Desktop navigation. Dropdowns open on hover AND focus-within, so they
    are reachable by keyboard without any JavaScript."""
    out = []
    for item in SITE["nav"]:
        active = ' aria-current="page"' if item["href"] == path_for(current) else ""
        if item.get("children"):
            kids = "".join(
                f'<li><a href="{kid["href"]}">{esc(kid["label"])}</a></li>'
                for kid in item["children"]
            )
            out.append(
                f'<li class="has-submenu"><a href="{item["href"]}"{active}>{esc(item["label"])}'
                f'<span class="caret" aria-hidden="true">&#9662;</span></a>'
                f'<ul class="submenu">{kids}</ul></li>'
            )
        else:
            out.append(f'<li><a href="{item["href"]}"{active}>{esc(item["label"])}</a></li>')
    return "".join(out)


def mobile_nav_markup() -> str:
    out = []
    for item in SITE["nav"]:
        out.append(f'<li><a href="{item["href"]}">{esc(item["label"])}</a></li>')
        for kid in item.get("children", []):
            out.append(f'<li class="mobile-sub"><a href="{kid["href"]}">{esc(kid["label"])}</a></li>')
    return "".join(out)


BRAND_MARK = """<svg class="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
            <rect width="64" height="64" rx="14" fill="#1E3B2F" />
            <rect x="5" y="5" width="54" height="54" rx="9" fill="none" stroke="#B08A46" stroke-width="1.6" />
            <text x="32" y="45" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="34" fill="#D9B979">K</text>
          </svg>"""


def header_for(page: dict) -> str:
    return f"""<header class="site-header">
      <div class="container">
        <a class="brand" href="/" aria-label="{esc(BRAND['name'])} — home">
          {BRAND_MARK}
          <span class="brand-word">Knoesen Accounting<small>Tax &amp; Payroll</small></span>
        </a>

        <nav class="nav-links" aria-label="Primary">
          <ul>{nav_markup(page["slug"])}</ul>
        </nav>

        <div class="nav-cta">
          <a class="nav-phone" href="tel:{CONTACT['phone_e164']}">
            <span class="eyebrow">Call / WhatsApp</span>{esc(CONTACT['phone_display'])}
          </a>
          <a class="btn btn-primary" href="/contact">Get In Touch</a>
        </div>

        <button class="nav-toggle" aria-expanded="false" aria-controls="mobile-panel" aria-label="Toggle menu">
          <span></span><span></span><span></span>
        </button>
      </div>

      <div class="mobile-panel" id="mobile-panel">
        <div class="mobile-panel-inner">
          <ul>{mobile_nav_markup()}</ul>
          <div class="container">
            <a class="nav-phone" href="tel:{CONTACT['phone_e164']}">Call / WhatsApp — {esc(CONTACT['phone_display'])}</a>
          </div>
        </div>
      </div>
    </header>"""


def breadcrumb_markup(page: dict) -> str:
    trail = page.get("breadcrumbs")
    if not trail:
        return ""
    crumbs = [f'<li><a href="/">Home</a></li>']
    for item in trail:
        crumbs.append(f'<li><a href="{path_for(item["slug"])}">{esc(item["name"])}</a></li>')
    crumbs.append(f'<li><span aria-current="page">{esc(page["breadcrumb"])}</span></li>')
    return (
        '<nav class="breadcrumbs" aria-label="Breadcrumb"><div class="container">'
        f'<ol>{"".join(crumbs)}</ol></div></nav>'
    )


def hero_for(page: dict) -> str:
    """Home gets the tall showcase hero; inner pages get a compact page header."""
    if page["slug"] == "":
        return ""  # the home fragment supplies its own hero

    eyebrow = page.get("eyebrow", "")
    lead = detokenise(page.get("lead", page["description"]))
    updated = page.get("updated")
    stamp = ""
    if page.get("type") == "article" and updated:
        # strftime's day-without-leading-zero flag differs across platforms,
        # so format it by hand.
        stamp_day = date.fromisoformat(updated)
        pretty = f"{stamp_day.day} {stamp_day.strftime('%B %Y')}"
        stamp = (
            f'<p class="page-stamp">Last reviewed <time datetime="{updated}">{pretty}</time>'
            " against SARS and National Treasury sources.</p>"
        )
    return f"""<section class="page-hero">
        <div class="container">
          {f'<span class="eyebrow">{esc(eyebrow)}</span>' if eyebrow else ''}
          <h1>{detokenise(page["h1"])}</h1>
          <div class="double-rule double-rule--left" aria-hidden="true"></div>
          <p class="page-lead">{lead}</p>
          {stamp}
        </div>
      </section>"""


def cta_band() -> str:
    return f"""<section class="section section--dark cta-band">
        <div class="container reveal">
          <span class="eyebrow">Working With {esc(PRINCIPAL['name'].split()[0])}</span>
          <h2>All your accounting needs. Sorted.</h2>
          <div class="double-rule" aria-hidden="true"></div>
          <p>
            From bookkeeping to statutory returns, {esc(PRINCIPAL['name'].split()[0])} takes care of the
            numbers so you can get on with running the business — friendly,
            professional service, with no jargon and no surprises.
          </p>
          <div class="hero-actions">
            <a class="btn btn-primary" href="/contact">Book a free consultation<span class="btn-arrow" aria-hidden="true">&rarr;</span></a>
            <a class="btn btn-outline" href="{CONTACT['whatsapp_url']}" target="_blank" rel="noopener noreferrer">WhatsApp {esc(PRINCIPAL['name'].split()[0])}</a>
          </div>
        </div>
      </section>"""


def footer_markup() -> str:
    service_links = "".join(
        f'<a href="{kid["href"]}">{esc(kid["label"])}</a>'
        for item in SITE["nav"] if item["label"] == "Services"
        for kid in item["children"]
    )
    resource_links = "".join(
        f'<a href="{kid["href"]}">{esc(kid["label"])}</a>'
        for item in SITE["nav"] if item["label"] == "Resources"
        for kid in item["children"]
    )

    creds = []
    if has("saipa"):
        creds.append(f'<span>{esc(PRINCIPAL["body"])} member no. {esc(CREDS["saipa_number"])}</span>')
    if has("practitioner"):
        creds.append(f'<span>SARS tax practitioner no. {esc(CREDS["tax_practitioner_number"])}</span>')
    if has("company_reg"):
        creds.append(f'<span>Reg. no. {esc(CREDS["company_reg_number"])}</span>')
    creds_markup = f'<div class="footer-creds">{"".join(creds)}</div>' if creds else ""

    address_line = LOCATION["street"] + ", " if has("street") else ""
    address_line += f'{LOCATION["suburb"]}, {LOCATION["city"]}'

    return f"""<footer class="site-footer" aria-label="Site footer">
      <div class="container">
        <div class="footer-top">
          <div class="footer-brand">
            <span class="brand-word">Knoesen Accounting<small>Tax &amp; Payroll</small></span>
            <p>
              {esc(PRINCIPAL['body'])}-registered accounting, tax and payroll services for small
              and medium-sized businesses across the Nelson Mandela Bay Metro.
              Based in {esc(LOCATION['suburb'])}, {esc(LOCATION['city'])} ({esc(LOCATION['city_alt'])}).
            </p>
            {creds_markup}
          </div>

          <div class="footer-cols">
            <div class="footer-col">
              <h3 class="footer-label">Services</h3>
              {service_links}
            </div>
            <div class="footer-col">
              <h3 class="footer-label">Free Resources</h3>
              {resource_links}
            </div>
            <div class="footer-col">
              <h3 class="footer-label">Practice</h3>
              <a href="/about">About {esc(PRINCIPAL['name'])}</a>
              <a href="/areas-we-serve">Areas We Serve</a>
              <a href="/contact">Contact</a>
              <a href="tel:{CONTACT['phone_e164']}">{esc(CONTACT['phone_display'])}</a>
              <a href="mailto:{CONTACT['email']}">{esc(CONTACT['email'])}</a>
              <span>{esc(address_line)}</span>
            </div>
            <div class="footer-col">
              <h3 class="footer-label">Legal</h3>
              <a href="/privacy-policy">Privacy Policy (POPIA)</a>
              <a href="/disclaimer">Disclaimer</a>
              <p class="legal-note">
                We only ever use your information to provide accounting services
                and respond to enquiries — never sold, never used for anything
                else. Full detail in the <a href="/privacy-policy">Privacy Policy</a>.
              </p>
            </div>
          </div>
        </div>

        <div class="footer-bottom">
          <span>&copy; <span id="year">{date.today().year}</span> {esc(BRAND['name'])}. All rights reserved.</span>
          <a href="/sitemap.xml">Sitemap</a>
          <a class="back-to-top" href="#top">Back to top &uarr;</a>
        </div>
      </div>
    </footer>

    <nav class="sticky-contact" aria-label="Quick contact">
      <a href="tel:{CONTACT['phone_e164']}" class="sticky-contact-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z"/></svg>
        Call
      </a>
      <a href="{CONTACT['whatsapp_url']}" target="_blank" rel="noopener noreferrer" class="sticky-contact-btn sticky-contact-btn--wa">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"/></svg>
        WhatsApp
      </a>
      <a href="/contact" class="sticky-contact-btn sticky-contact-btn--primary">Enquire</a>
    </nav>"""


# --------------------------------------------------------------------------
# Page assembly
# --------------------------------------------------------------------------

TABLE_WRAP_RE = re.compile(r'<div class="(table-wrap[^"]*)">(.*?)</div>', re.S)
CAPTION_RE = re.compile(r"<caption[^>]*>(.*?)</caption>", re.S)
TABLE_TITLE_RE = re.compile(r'<h3 class="table-title">(.*?)</h3>', re.S)


def enhance_tables(body: str) -> str:
    """Make the rate tables usable on a phone and reachable by keyboard.

    A horizontally scrolling container is a WCAG 2.1.1 problem: a mouse or
    finger can pan it, but a keyboard cannot reach it at all unless it is
    focusable. Adding tabindex="0" plus a role and an accessible name turns
    each one into a proper scrollable region. The visible hint matters too —
    a table clipped at the viewport edge reads as truncated data rather than
    as something you can scroll, which for a rate table is worse than useless.

    Applied here rather than in the content fragments so authors just write a
    plain table and get the behaviour for free on all 17 of them.
    """

    def repl(match: re.Match) -> str:
        classes, inner = match.group(1), match.group(2)
        if "<table" not in inner:
            return match.group(0)

        name = ""
        for pattern in (CAPTION_RE, TABLE_TITLE_RE):
            found = pattern.search(inner)
            if found:
                name = re.sub(r"<[^>]+>", "", found.group(1)).strip()
                break
        label = esc(name) if name else "Data table"

        return (
            f'<div class="{classes}" role="region" aria-label="{label}, scrollable" tabindex="0">'
            f"{inner}</div>"
            '<p class="table-scroll-hint" aria-hidden="true">Scroll the table sideways to see every column &rarr;</p>'
        )

    return TABLE_WRAP_RE.sub(repl, body)


def render(page: dict) -> str:
    body = detokenise((CONTENT / page["file"]).read_text(encoding="utf-8")).strip()
    body = enhance_tables(body)
    cta = cta_band() if page.get("cta", True) else ""

    return f"""<!doctype html>
<html lang="{SITE['locale']}">
  <head>
    {head_for(page)}
  </head>
  <body id="top">
    <a class="skip-link" href="#main">Skip to content</a>

    {header_for(page)}
    {breadcrumb_markup(page)}

    <main id="main">
      {hero_for(page)}
      {body}
      {cta}
    </main>

    {footer_markup()}

    <script src="/js/main.js?v={JS_VERSION}"></script>
  </body>
</html>
"""


def write_sitemap() -> None:
    entries = []
    for page in PAGES:
        if page.get("noindex"):
            continue
        entries.append(
            "  <url>\n"
            f"    <loc>{url_for(page['slug'])}</loc>\n"
            f"    <lastmod>{page.get('updated', BUILD_DATE)}</lastmod>\n"
            f"    <changefreq>{page.get('changefreq', 'monthly')}</changefreq>\n"
            f"    <priority>{page.get('priority', '0.6')}</priority>\n"
            "  </url>"
        )
    (ROOT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(entries)
        + "\n</urlset>\n",
        encoding="utf-8",
    )


def write_robots() -> None:
    (ROOT / "robots.txt").write_text(
        "# https://www.robotstxt.org/robotstxt.html\n"
        "User-agent: *\n"
        "Allow: /\n\n"
        "# Nothing here is private, but these are build inputs, not pages.\n"
        "Disallow: /content/\n\n"
        f"Sitemap: {DOMAIN}/sitemap.xml\n",
        encoding="utf-8",
    )


def check_redirects() -> list[str]:
    """Validate _redirects against what Cloudflare Workers Assets accepts.

    This site deploys as a Worker, not as Pages, and Workers only allows
    RELATIVE URLs in _redirects. An absolute cross-host rule is valid Pages
    syntax but fails the entire Worker deploy with error 100324 — and it fails
    at the API, after the assets have already uploaded, so nothing local
    catches it. Hence this check.
    """
    path = ROOT / "_redirects"
    if not path.exists():
        return []

    problems = []
    valid_status = {"200", "301", "302", "303", "307", "308", "404", "410"}

    for lineno, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue

        parts = line.split()
        if len(parts) < 2:
            problems.append(f"  line {lineno}: needs at least a source and a destination — {line!r}")
            continue

        source, destination = parts[0], parts[1]
        for label, value in (("source", source), ("destination", destination)):
            if "://" in value or value.startswith("//"):
                problems.append(
                    f"  line {lineno}: absolute URL in {label} ({value}). "
                    "Workers Assets allows only relative URLs — use a Cloudflare "
                    "Redirect Rule for host-level redirects."
                )
            elif not value.startswith("/"):
                problems.append(f"  line {lineno}: {label} must start with '/' — {value!r}")

        if len(parts) > 2 and parts[2] not in valid_status:
            problems.append(f"  line {lineno}: unexpected status code {parts[2]!r}")

    return problems


LINK_RE = re.compile(r'href="(/[^"#?]*)"')


def check_links(written: dict[str, str]) -> list[str]:
    """Catch internal links that point at pages which do not exist."""
    known = {path_for(p["slug"]) for p in PAGES}
    known |= {
        "/", "/sitemap.xml", "/robots.txt", "/manifest.json",
        "/css/styles.css", "/js/main.js",
        "/assets/favicon.svg", "/assets/favicon.ico",
        "/assets/apple-touch-icon.png", "/assets/og-image.png",
        "/assets/icon-192.png", "/assets/icon-512.png",
    }
    problems = []
    for slug, markup in written.items():
        for href in set(LINK_RE.findall(markup)):
            if href not in known:
                problems.append(f"  {path_for(slug) or '/'} → {href}")
    return sorted(set(problems))


def main() -> int:
    written: dict[str, str] = {}
    for page in PAGES:
        markup = render(page)
        target = outfile_for(page["slug"])
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(markup, encoding="utf-8")
        written[page["slug"]] = markup
        print(f"  wrote {target.relative_to(ROOT)}")

    write_sitemap()
    write_robots()
    print(f"  wrote sitemap.xml ({sum(1 for p in PAGES if not p.get('noindex'))} URLs)")
    print("  wrote robots.txt")

    missing = []
    for label, keys in [
        ("street address", ("street",)),
        ("geo coordinates", ("lat", "lng")),
        ("SAIPA membership number", ("saipa",)),
        ("SARS tax practitioner number", ("practitioner",)),
        ("opening hours", ("hours",)),
        ("Web3Forms access key (contact form)", ("web3forms",)),
    ]:
        if not has(*keys):
            missing.append(label)

    print(f"\nBuilt {len(PAGES)} pages for {DOMAIN}")
    if missing:
        print("\nOmitted (not verified — see TODO-BEFORE-LAUNCH.md):")
        for item in missing:
            print(f"  · {item}")

    if "--check" in sys.argv:
        failed = False

        problems = check_links(written)
        if problems:
            print("\nBroken internal links:")
            print("\n".join(problems))
            failed = True
        else:
            print("\nLink check passed — no broken internal links.")

        redirect_problems = check_redirects()
        if redirect_problems:
            print("\nInvalid _redirects (Cloudflare Workers would reject this):")
            print("\n".join(redirect_problems))
            failed = True
        else:
            print("_redirects check passed — all rules are relative URLs.")

        return 1 if failed else 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
