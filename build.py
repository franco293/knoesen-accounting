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
RATES = json.loads((ROOT / "data" / "tax-rates.json").read_text(encoding="utf-8"))

CURRENT_YEAR = RATES["current"]
YEAR = RATES["years"][CURRENT_YEAR]

DOMAIN = SITE["domain"].rstrip("/")
BRAND = SITE["brand"]
PRINCIPAL = SITE["principal"]
CONTACT = SITE["contact"]
LOCATION = SITE["location"]
CREDS = SITE["credentials"]
TAXYEAR = SITE["tax_year"]

BUILD_DATE = date.today().isoformat()


# --------------------------------------------------------------------------
#  Feature flags
# --------------------------------------------------------------------------
#
# `site.json -> features` switches a whole section of the site off without
# deleting a single line of what builds it. A flag set to false means:
#
#   * nav entries in site.json tagged `"feature": "<name>"` are not rendered,
#     header and mobile menu alike;
#   * pages in content/pages.json tagged `"feature": "<name>"` are not written,
#     are left out of sitemap.xml, and stop counting as valid link targets — so
#     `--check` fails on any link still pointing at them;
#   * body markup wrapped in <!-- feature:<name> --> ... <!-- /feature:<name> -->
#     is dropped, and the <!-- nofeature:<name> --> ... <!-- /nofeature:<name> -->
#     alternative next to it is kept instead. With the flag on it is the other
#     way round, so a sentence can read correctly either way.
#
# The calculators are switched off this way. content/tool-*.html, the nine
# js/*-calculator.js files and every pages.json entry are untouched: set
# features.calculators back to true, run `python build.py`, drop the calculator
# block from `.assetsignore` and the /tools rules from `_redirects`, and the
# whole section comes back exactly as it was.
FEATURES = SITE.get("features", {})

# Flags nobody writes by hand: they are worked out further down from what is
# actually configured — chiefly which tracking tags have an ID. Kept separate
# from FEATURES so that a derived flag can never be silently overridden by a
# stray key in site.json, and so the build report only lists the flags a human
# really did switch off. Populated in the "Analytics & consent" section below;
# empty until then, which is fine because nothing reads a derived flag before
# that point.
DERIVED_FEATURES: dict[str, bool] = {}


def feature_on(name: str) -> bool:
    """Unknown flags default to on — a feature has to be switched off on purpose."""
    if name in DERIVED_FEATURES:
        return DERIVED_FEATURES[name]
    return bool(FEATURES.get(name, True))


def enabled(item: dict) -> bool:
    """True unless this nav entry / page is tagged with a flag that is off."""
    return feature_on(item["feature"]) if item.get("feature") else True


# Everything downstream reads these, never SITE["nav"] or the raw pages list,
# so a disabled feature disappears from the build in one place.
NAV = [
    dict(item, children=[kid for kid in item.get("children", []) if enabled(kid)])
    for item in SITE["nav"]
    if enabled(item)
]
HIDDEN_PAGES = [page for page in PAGES if not enabled(page)]
PAGES = [page for page in PAGES if enabled(page)]

FEATURE_RE = re.compile(
    r"[ \t]*<!--\s*feature:([\w-]+)\s*-->(.*?)<!--\s*/feature:\1\s*-->", re.S
)
NOFEATURE_RE = re.compile(
    r"[ \t]*<!--\s*nofeature:([\w-]+)\s*-->(.*?)<!--\s*/nofeature:\1\s*-->", re.S
)


def apply_features(markup: str) -> str:
    """Keep the variant of each flagged block that matches the current flags.

    Runs to a fixed point rather than once, because these blocks nest: a
    per-vendor disclosure sits inside its category's block, which sits inside
    the tracking block. re.sub resumes scanning AFTER each replacement, so a
    nested block inside a block that was kept is copied through untouched by a
    single pass — which once shipped a paragraph naming Google Ads on a site
    that had no Google Ads tag. Repeating until the markup stops changing
    strips every layer.

    An unclosed marker cannot spin here: it simply never matches, and the loop
    settles. The bound only trips on absurd nesting, which is worth failing on.
    """
    for _ in range(10):
        before = markup
        markup = NOFEATURE_RE.sub(lambda m: "" if feature_on(m.group(1)) else m.group(2), markup)
        markup = FEATURE_RE.sub(lambda m: m.group(2) if feature_on(m.group(1)) else "", markup)
        if markup == before:
            return markup
    raise SystemExit("build: feature blocks nested more than 10 deep — check for a stray marker")


# --------------------------------------------------------------------------
#  Analytics & consent
# --------------------------------------------------------------------------
#
# The rule this whole section exists to enforce: a tracking tag, the CSP origins
# it needs, the consent toggle that gates it, and the privacy-notice paragraph
# that discloses it either ALL exist or NONE of them do. They are derived from
# one place — `site.json -> analytics` — so they cannot drift apart.
#
# With every ID blank there is no cookie banner, no consent cookie and no
# consent script: nothing is set that anyone could consent to, and the privacy
# notice says exactly that. Paste an ID in and the banner, the category toggle,
# the CSP origins and the disclosure paragraph all appear on the next build.
#
# Nothing here fires a tag on its own. js/consent.js stores the visitor's answer
# and js/tags.js (generated below) waits for the matching category to be granted
# before it puts a single third-party <script> in the page.
ANALYTICS = SITE.get("analytics", {})
LEGAL = SITE.get("legal", {})

# The day the "this website sets no cookies of its own" wording in
# content/privacy-policy.html was written. Switching a tracker on replaces that
# wording, so the notice's own "last updated" date has to move past this date —
# otherwise the page shows new text under an old review date. --check enforces
# it, because a stale date on a privacy notice is the kind of detail a regulator
# notices and a visitor cannot verify.
POLICY_BASE_DATE = "2026-08-25"

CATEGORIES = {
    "analytics": {
        "label": "Analytics",
        "blurb": "Counts visits and shows which pages people actually read, so we know what to improve. Never used to advertise to you.",
    },
    "marketing": {
        "label": "Marketing",
        "blurb": "Measures whether an advert brought you here, and lets those platforms show you our adverts on other sites.",
    },
}

# One entry per tag we are prepared to run. `id_key` is the site.json field that
# switches it on; `flag` is the feature flag its privacy-notice paragraph is
# wrapped in; `csp` is every origin it needs, which is what keeps _headers
# honest — see write_headers(). `prefix` is a cheap sanity check on the ID
# itself, so a mistyped or pasted-in-the-wrong-slot ID fails the build instead
# of silently loading nothing.
VENDORS = [
    {
        "id_key": "ga4_measurement_id",
        "cookies": ["_ga", "_ga_*", "_gid", "_gat*"],
        "policy_marker": "Google Analytics",
        "label": "Google Analytics 4",
        "category": "analytics",
        "flag": "tracking-ga4",
        "prefix": "G-",
        "csp": {
            "script-src": ["https://www.googletagmanager.com"],
            "img-src": ["https://www.google-analytics.com", "https://*.google-analytics.com"],
            "connect-src": [
                "https://www.google-analytics.com",
                "https://*.google-analytics.com",
                "https://*.analytics.google.com",
                "https://*.googletagmanager.com",
            ],
        },
        "loader": (
            '  KAConsent.onGrant("analytics", function () {\n'
            "    loadScript(\"https://www.googletagmanager.com/gtag/js?id=__ID__\");\n"
            '    gtag("js", new Date());\n'
            # No anonymize_ip. It is a Universal Analytics setting that GA4
            # ignores: GA4 never logs or stores the IP at all, it derives a
            # coarse location and discards it. Passing it would imply we control
            # something we do not, and the privacy notice would be describing a
            # setting that does not exist.
            '    gtag("config", "__ID__");\n'
            "  });\n"
        ),
    },
    {
        "id_key": "google_ads_id",
        "cookies": ["_gcl_*", "_gac_*"],
        "policy_marker": "Google Ads",
        "label": "Google Ads",
        "category": "marketing",
        "flag": "tracking-google-ads",
        "prefix": "AW-",
        "csp": {
            "script-src": [
                "https://www.googletagmanager.com",
                "https://www.googleadservices.com",
                "https://googleads.g.doubleclick.net",
            ],
            "img-src": [
                "https://googleads.g.doubleclick.net",
                "https://www.google.com",
                "https://www.google.co.za",
            ],
            "connect-src": ["https://www.google.com", "https://*.googletagmanager.com"],
            "frame-src": ["https://td.doubleclick.net", "https://bid.g.doubleclick.net"],
        },
        "loader": (
            '  KAConsent.onGrant("marketing", function () {\n'
            "    loadScript(\"https://www.googletagmanager.com/gtag/js?id=__ID__\");\n"
            '    gtag("js", new Date());\n'
            '    gtag("config", "__ID__");\n'
            "  });\n"
        ),
    },
    {
        "id_key": "meta_pixel_id",
        "cookies": ["_fbp", "_fbc"],
        "policy_marker": "Meta Platforms",
        "label": "Meta (Facebook) Pixel",
        "category": "marketing",
        "flag": "tracking-meta-pixel",
        "prefix": "",
        "csp": {
            "script-src": ["https://connect.facebook.net"],
            "img-src": ["https://www.facebook.com"],
            "connect-src": ["https://www.facebook.com"],
        },
        "loader": (
            '  KAConsent.onGrant("marketing", function () {\n'
            "    window.fbq = window.fbq || function () { (window.fbq.q = window.fbq.q || []).push(arguments); };\n"
            "    loadScript(\"https://connect.facebook.net/en_US/fbevents.js\");\n"
            '    window.fbq("init", "__ID__");\n'
            '    window.fbq("track", "PageView");\n'
            "  });\n"
        ),
    },
]


def vendor_id(vendor: dict) -> str:
    return str(ANALYTICS.get(vendor["id_key"], "") or "").strip()


ACTIVE_VENDORS = [vendor for vendor in VENDORS if vendor_id(vendor)]
ACTIVE_CATEGORIES = [
    name for name in CATEGORIES
    if any(vendor["category"] == name for vendor in ACTIVE_VENDORS)
]
CF_ANALYTICS = bool(ANALYTICS.get("cloudflare_web_analytics", True))
TRACKING_ON = bool(ACTIVE_VENDORS)

# These drive the privacy notice. `tracking` swaps section 7 between the
# no-cookies wording and the consent wording; the per-vendor flags reveal one
# disclosure paragraph and one cookie-table row each.
DERIVED_FEATURES["tracking"] = TRACKING_ON
DERIVED_FEATURES["cloudflare-analytics"] = CF_ANALYTICS
for _vendor in VENDORS:
    DERIVED_FEATURES[_vendor["flag"]] = bool(vendor_id(_vendor))
for _category in CATEGORIES:
    DERIVED_FEATURES["tracking-" + _category] = _category in ACTIVE_CATEGORIES


def consent_markup() -> str:
    """The cookie banner — or nothing at all, which is the normal case.

    Rendered into the HTML rather than injected by JavaScript, so there is no
    flash of a banner on a page whose visitor answered months ago, and no layout
    shift. It ships `hidden`; js/consent.js reveals it only when there is no
    stored answer. That also means a visitor with JavaScript off never sees it —
    correct, because with JavaScript off not one tag can load either.

    Accept and Reject carry equal visual weight on purpose. Regulators treat a
    prominent Accept beside a buried Reject as consent that was not freely
    given, which makes it no consent at all.
    """
    if not TRACKING_ON:
        return ""

    options = "".join(
        f"""
          <label class="consent-option">
            <input type="checkbox" data-consent-category="{name}" />
            <span>
              <strong>{esc(CATEGORIES[name]['label'])}</strong>
              {esc(CATEGORIES[name]['blurb'])}
            </span>
          </label>"""
        for name in ACTIVE_CATEGORIES
    )

    return f"""
    <div class="consent" id="consent" role="dialog" aria-modal="false"
         aria-labelledby="consent-title" aria-describedby="consent-text" hidden>
      <div class="consent-inner">
        <!-- tabindex so consent.js can move focus here when the panel is
             reopened from the footer; without it a keyboard user activates
             "Cookie settings" and focus stays at the bottom of the page. -->
        <h2 class="consent-title" id="consent-title" tabindex="-1">Cookies on this site</h2>
        <p class="consent-text" id="consent-text">
          We would like to set optional cookies to understand how this site is
          used, so we can improve it. They are off unless you switch them on,
          and the site works exactly the same either way. Full detail in our
          <a href="/privacy-policy#cookies">Privacy Policy</a>.
        </p>
        <div class="consent-options" id="consent-options" hidden>{options}
        </div>
        <div class="consent-actions">
          <button type="button" class="btn btn-primary" data-consent-action="accept">Accept all</button>
          <button type="button" class="btn btn-primary" data-consent-action="reject">Reject all</button>
          <button type="button" class="btn btn-outline" data-consent-action="choose">Choose</button>
          <button type="button" class="btn btn-primary" data-consent-action="save" hidden>Save choices</button>
        </div>
      </div>
    </div>"""


def consent_footer_link() -> str:
    """Lets a visitor change their mind. POPIA s11(2)(b) — consent may be
    withdrawn at any time — so the only honest banner is one you can reopen."""
    if not TRACKING_ON:
        return ""
    return (
        '\n              <button type="button" class="footer-consent-btn" '
        'data-consent-action="open">Cookie settings</button>'
    )


def write_tag_loaders() -> None:
    """Generate js/tags.js: the configured tags, each waiting on its category.

    Generated rather than hand-written so that the file contains exactly the
    tags that are switched on — no commented-out vendor waiting to be
    uncommented by accident, and no ID left behind when one is removed.

    The Consent Mode block matters more than it looks. Google's tags assume
    consent unless told otherwise, so the defaults have to be denied BEFORE
    gtag.js is fetched. Setting them here, at parse time, guarantees that: the
    Google script itself cannot load until a category is granted, which happens
    strictly later.
    """
    target = ROOT / "js" / "tags.js"
    if not TRACKING_ON:
        # Nothing to load. Leaving a stale generated file on disk would ship an
        # unreferenced script that still names an ID that is no longer in use.
        if target.exists():
            target.unlink()
            print("  removed js/tags.js (no tracking tags configured)")
        return

    google = [v for v in ACTIVE_VENDORS if v["id_key"] in ("ga4_measurement_id", "google_ads_id")]
    consent_mode = ""
    if google:
        consent_mode = (
            "  /* Google Consent Mode v2. Denied by default, before any Google\n"
            "     script exists on the page; KAConsent sends the update. */\n"
            "  window.dataLayer = window.dataLayer || [];\n"
            "  window.gtag = function () { window.dataLayer.push(arguments); };\n"
            '  gtag("consent", "default", {\n'
            '    ad_storage: "denied",\n'
            '    ad_user_data: "denied",\n'
            '    ad_personalization: "denied",\n'
            '    analytics_storage: "denied",\n'
            '    personalization_storage: "denied",\n'
            '    functionality_storage: "granted",\n'
            '    security_storage: "granted",\n'
            "    wait_for_update: 500\n"
            "  });\n\n"
            '  KAConsent.onChange(function (consent) {\n'
            '    gtag("consent", "update", {\n'
            '      analytics_storage: consent.analytics ? "granted" : "denied",\n'
            '      ad_storage: consent.marketing ? "granted" : "denied",\n'
            '      ad_user_data: consent.marketing ? "granted" : "denied",\n'
            '      ad_personalization: consent.marketing ? "granted" : "denied"\n'
            "    });\n"
            "  });\n\n"
        )

    # Telling consent.js which cookies belong to which category is what lets a
    # withdrawal actually clear them. Stopping collection but leaving the
    # identifiers sitting on the device is not really honouring a withdrawal.
    forget = "".join(
        '  KAConsent.forget("%s", %s);\n' % (vendor["category"], json.dumps(vendor["cookies"]))
        for vendor in ACTIVE_VENDORS
        if vendor.get("cookies")
    )

    loaders = "\n".join(
        "  /* " + vendor["label"] + " */\n"
        + vendor["loader"].replace("__ID__", vendor_id(vendor))
        for vendor in ACTIVE_VENDORS
    )
    if forget:
        loaders = "  /* Cookies to clear if a category is refused or withdrawn. */\n" + forget + "\n" + loaders

    write(
        target,
        "/* GENERATED by build.py from site.json -> analytics — do not edit.\n"
        "   Add or remove a tracking ID there and rebuild; the CSP in _headers,\n"
        "   the consent categories and the privacy notice all follow from the\n"
        "   same source and are checked against each other by --check. */\n"
        "(function () {\n"
        '  "use strict";\n\n'
        "  function loadScript(src) {\n"
        '    var s = document.createElement("script");\n'
        "    s.async = true;\n"
        "    s.src = src;\n"
        "    document.head.appendChild(s);\n"
        "  }\n\n"
        + consent_mode
        + loaders
        + "})();\n",
    )
    print(f"  wrote js/tags.js ({len(ACTIVE_VENDORS)} tag{'s' if len(ACTIVE_VENDORS) != 1 else ''})")


# Directive order is the order they appear in the header. Kept explicit so the
# generated CSP reads the same way every build and diffs stay legible.
CSP_BASE = {
    "default-src": ["'self'"],
    "script-src": ["'self'"],
    "style-src": ["'self'"],
    "font-src": ["'self'"],
    "img-src": ["'self'", "data:"],
    "connect-src": ["'self'", "https://api.web3forms.com"],
    "frame-src": ["https://www.google.com"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'", "https://api.web3forms.com"],
    "frame-ancestors": ["'self'"],
}


def csp_value() -> str:
    """Build the Content-Security-Policy from what is actually switched on.

    A CSP is only worth having if it is tight, and it only stays tight if
    nobody has to remember to edit it. Every origin below is here because some
    configured feature needs it; switch that feature off and the origin goes
    with it. --check fails the build if an origin is present for a vendor that
    is not configured, which is how a permissive leftover gets caught.
    """
    directives = {name: list(values) for name, values in CSP_BASE.items()}

    if CF_ANALYTICS:
        directives["script-src"].append("https://static.cloudflareinsights.com")
        directives["connect-src"].append("https://cloudflareinsights.com")

    for vendor in ACTIVE_VENDORS:
        for directive, origins in vendor["csp"].items():
            for origin in origins:
                if origin not in directives[directive]:
                    directives[directive].append(origin)

    rendered = "; ".join(f"{name} {' '.join(values)}" for name, values in directives.items())
    return rendered + "; upgrade-insecure-requests"


def write_headers() -> None:
    """Generate _headers, because the CSP inside it is derived, not authored."""
    write(
        ROOT / "_headers",
        f"""# GENERATED by build.py — do not edit. The Content-Security-Policy below is
# assembled from site.json: which tracking tags have an ID, and whether
# Cloudflare Web Analytics is on. Change those, run `python build.py`, and the
# policy follows. Editing this file by hand is overwritten on the next build.
#
# Cloudflare Web Analytics is enabled on this zone, so Cloudflare injects its
# beacon from static.cloudflareinsights.com into every response. `script-src
# 'self'` used to block it, which meant the console logged a CSP violation on
# every page load and the practice collected no traffic data at all — the
# analytics looked switched on in the dashboard and was silently dead.
#
# The beacon is cookieless and collects no personal information, which is why
# it needs no cookie banner. It IS a third-party request, so it is disclosed in
# content/privacy-policy.html. If you ever turn Web Analytics OFF in the
# Cloudflare dashboard, set analytics.cloudflare_web_analytics to false in
# site.json and remove that disclosure — do not leave an origin allowed that
# nothing uses.
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: SAMEORIGIN
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), camera=(), microphone=(), payment=(), usb=(), interest-cohort=(), browsing-topics=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Resource-Policy: same-origin
  X-Permitted-Cross-Domain-Policies: none
  Content-Security-Policy: {csp_value()}

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/css/*
  Cache-Control: public, max-age=31536000, immutable

/js/*
  Cache-Control: public, max-age=31536000, immutable

# sitemap.xml and robots.txt are regenerated by build.py on every build, so a
# long cache here would only delay crawlers seeing new pages.
/sitemap.xml
  Cache-Control: public, max-age=3600

/robots.txt
  Cache-Control: public, max-age=3600
""",
    )


def check_analytics() -> list[str]:
    """Prove the tag, its CSP origins, its consent toggle and its disclosure
    are all present together — or all absent together."""
    problems = []

    for vendor in VENDORS:
        value = vendor_id(vendor)
        if value and vendor["prefix"] and not value.startswith(vendor["prefix"]):
            problems.append(
                f"  analytics.{vendor['id_key']} is {value!r}, which does not look like a "
                f"{vendor['label']} ID (expected it to start with {vendor['prefix']!r}). "
                "Check it is in the right slot."
            )

    # Compared per directive, not against the CSP as one string. An origin can
    # be legitimate in one directive and a leak in another: https://www.google.com
    # belongs in frame-src for the Maps embed whether or not Google Ads is
    # switched on, but has no business in img-src unless it is.
    csp = {
        part.split(" ")[0]: set(part.split(" ")[1:])
        for part in csp_value().split("; ")
        if " " in part
    }

    def allowed_without(vendor: dict) -> set:
        """(directive, origin) pairs something OTHER than `vendor` justifies."""
        pairs = {
            (directive, origin)
            for directive, origins in CSP_BASE.items()
            for origin in origins
        }
        if CF_ANALYTICS:
            pairs.add(("script-src", "https://static.cloudflareinsights.com"))
            pairs.add(("connect-src", "https://cloudflareinsights.com"))
        for other in ACTIVE_VENDORS:
            if other is vendor:
                continue
            for directive, origins in other["csp"].items():
                pairs.update((directive, origin) for origin in origins)
        return pairs

    for vendor in VENDORS:
        wanted = {
            (directive, origin)
            for directive, origins in vendor["csp"].items()
            for origin in origins
        }
        if vendor_id(vendor):
            missing = sorted(
                f"{directive} {origin}"
                for directive, origin in wanted
                if origin not in csp.get(directive, set())
            )
            if missing:
                problems.append(
                    f"  {vendor['label']} is configured but the CSP is missing: "
                    f"{', '.join(missing)}"
                )
        else:
            justified = allowed_without(vendor)
            leftover = sorted(
                f"{directive} {origin}"
                for directive, origin in wanted - justified
                if origin in csp.get(directive, set())
            )
            if leftover:
                problems.append(
                    f"  {vendor['label']} is NOT configured but the CSP still allows: "
                    f"{', '.join(leftover)}"
                )

    if TRACKING_ON and not (ROOT / "js" / "consent.js").exists():
        problems.append("  tracking is configured but js/consent.js is missing")

    updated = str(LEGAL.get("privacy_policy_updated", ""))
    if updated < POLICY_BASE_DATE:
        problems.append(
            f"  legal.privacy_policy_updated is {updated or 'unset'!r}, earlier than the "
            f"last known review of the notice ({POLICY_BASE_DATE}). A privacy notice's "
            "date may move forward, never back."
        )

    # The real guarantee, checked against the page that actually ships rather
    # than inferred from a date: what the notice SAYS about cookies has to match
    # what the site DOES. Publishing "this website sets no cookies" over a live
    # analytics tag is the single worst failure this whole design exists to
    # prevent, so it is worth asserting on the rendered HTML.
    policy = ROOT / "privacy-policy.html"
    if policy.exists():
        text = policy.read_text(encoding="utf-8")
        no_cookie_claim = "sets no cookies of its own" in text
        consent_wording = "ka_consent" in text

        if TRACKING_ON and no_cookie_claim:
            problems.append(
                "  a tracking tag is switched on, but the published privacy notice still "
                "claims the site sets no cookies of its own"
            )
        if TRACKING_ON and not consent_wording:
            problems.append(
                "  a tracking tag is switched on, but the published privacy notice does "
                "not describe the consent cookie"
            )
        if not TRACKING_ON and consent_wording:
            problems.append(
                "  no tracking tag is configured, but the published privacy notice "
                "describes a consent cookie that is never set"
            )

        for vendor in VENDORS:
            named = vendor["policy_marker"] in text
            if vendor_id(vendor) and not named:
                problems.append(
                    f"  {vendor['label']} is configured but the published privacy notice "
                    f"never mentions {vendor['policy_marker']!r}"
                )
            if not vendor_id(vendor) and named:
                problems.append(
                    f"  the published privacy notice mentions {vendor['policy_marker']!r} "
                    f"but {vendor['label']} is not configured"
                )

    return problems


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


# The three faces that are needed to paint the top of every page: body text,
# headings, and the mono used for the eyebrow labels and the header phone
# number. @font-face lives inside styles.css, so without these the browser
# cannot even discover the font URLs until the stylesheet has parsed — one
# extra round trip on the critical path. `crossorigin` is required even though
# these are same-origin: fonts are always fetched in CORS mode, and a preload
# whose mode does not match the real request is simply downloaded twice.
#
# Only the `latin` subsets are preloaded. `latin-ext` is declared in the CSS
# but this site's copy never reaches for it, so preloading it would be pure
# waste.
#
# IBM Plex Mono 500 and 700 are deliberately absent. They are real weights the
# design uses, but only for table headings, step numbers and the notice tag —
# all below the fold. Measured on the live site they arrive ~24ms after the
# preloaded faces with cumulative layout shift of 0, so preloading them would
# buy nothing and would compete for bandwidth with the three faces that do
# paint the header.
PRELOAD_FONTS = [
    "ibm-plex-sans-latin.woff2",
    "fraunces-normal-latin.woff2",
    "ibm-plex-mono-400-latin.woff2",
]

# The home page's <h1> puts half of itself in italics — "Accountants in Gqeberha
# <em>who actually answer the phone</em>" — so Fraunces Italic is part of the
# largest above-the-fold text there, not a decorative afterthought. Unpreloaded
# it is discovered only after the stylesheet parses and the browser reaches the
# <em>, landing ~35ms behind the other three faces and repainting the headline.
#
# It is deliberately NOT in the site-wide list. Everywhere else <em> appears in
# body prose well below the fold, where `font-display: swap` handles it and a
# 45KB preload would only compete with the faces that paint the header.
PRELOAD_FONTS_HOME = PRELOAD_FONTS + ["fraunces-italic-latin.woff2"]


def font_preloads_for(page: dict) -> str:
    names = PRELOAD_FONTS_HOME if page["slug"] == "" else PRELOAD_FONTS
    return "\n    ".join(
        f'<link rel="preload" href="/assets/fonts/{name}" as="font" '
        'type="font/woff2" crossorigin />'
        for name in names
    )


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


def write(path: Path, text: str) -> None:
    """Write UTF-8 with LF endings, whatever platform the build runs on.

    Path.write_text() translates "\\n" to "\\r\\n" on Windows, so a build run
    there rewrote every generated file end to end — a diff of thousands of
    changed lines in which the one real change was impossible to see. Every
    generated file in this repo is LF; this keeps it that way.
    """
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(text)


def url_for(slug: str) -> str:
    """Absolute canonical URL for a slug. '' is the home page."""
    return DOMAIN + "/" if slug == "" else f"{DOMAIN}/{slug}"


def path_for(slug: str) -> str:
    """Site-root-relative href. Cloudflare serves foo.html at /foo."""
    return "/" if slug == "" else f"/{slug}"


def pretty_date(iso: str) -> str:
    """'2026-08-25' -> '25 August 2026'. Empty in, empty out.

    strftime's day-without-leading-zero flag differs across platforms, so the
    day is formatted by hand.
    """
    if not iso:
        return ""
    day = date.fromisoformat(iso)
    return f"{day.day} {day.strftime('%B %Y')}"


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
    # The privacy notice's own "last updated" date. It lives in site.json rather
    # than in the prose because switching a tracking tag on rewrites section 7,
    # and a rewritten notice showing an old review date is worse than no date.
    "{{policy_updated}}": pretty_date(SITE.get("legal", {}).get("privacy_policy_updated", "")),
    # main.js checks for this exact sentinel and, when it finds it, disables
    # the form and shows the phone/email instead of posting into the void.
    "{{WEB3FORMS_KEY}}": SITE["forms"]["web3forms_key"] or "UNCONFIGURED",
}


def _register_rate_tokens() -> None:
    """Figures that appear in ordinary prose, not in a table.

    The calculator page explains its own inputs — "R376 a month each for the
    first two", "no more than R430 000 a year", "capped at R177.12 a month".
    Those are the same figures the calculator computes with, so left as literal
    text they are exactly the drift the rate tables were just rescued from: a
    Budget update moves the arithmetic and leaves the sentence beside it wrong.
    """
    year = YEAR
    ind = year["individual"]
    payroll = year["payroll"]
    uif_monthly_max = payroll["uif_monthly_ceiling"] * payroll["uif_employee_rate"]

    TOKENS.update({
        "{{medical_first_two}}": money(ind["medical_credit"]["first_two_each"]),
        "{{medical_additional}}": money(ind["medical_credit"]["each_additional"]),
        "{{retirement_rate}}": pct(ind["retirement"]["rate"]),
        "{{retirement_cap}}": money(ind["retirement"]["annual_cap"]),
        "{{uif_rate}}": pct(payroll["uif_employee_rate"]),
        "{{uif_monthly_max}}": "R" + f"{uif_monthly_max:,.2f}".replace(",", " "),
        "{{uif_monthly_ceiling}}": money(payroll["uif_monthly_ceiling"]),
        "{{vat_rate}}": pct(year["vat"]["standard_rate"]),
    })


def detokenise(markup: str) -> str:
    for token, value in TOKENS.items():
        markup = markup.replace(token, value)
    return markup


# --------------------------------------------------------------------------
# Rate tables, rendered from data/tax-rates.json
#
# The brackets used to exist twice: as data in js/income-tax-calculator.js and
# as a readable table in content/guide-rates.html. Nothing but a regex-scraping
# validator held the two together, and it only covered the individual income
# tax table — the rebates, medical credits, retirement cap and every other
# figure were unguarded. Both now render from one file.
#
# A content author writes `{{rates:individual_brackets}}` on its own line inside
# a <tbody> and gets the rows. The surrounding table markup stays in the
# fragment where it is visible and editable; only the figures are generated.
# --------------------------------------------------------------------------

def money_plain(value: float) -> str:
    """245100 -> '245 100'. Space-separated, matching SARS and the rate tables."""
    return f"{int(round(value)):,}".replace(",", " ")


def money(value: float) -> str:
    return "R" + money_plain(value)


def pct(rate: float) -> str:
    """0.18 -> '18%', 0.275 -> '27.5%'. Rounded before trimming, because
    0.18 * 100 is 18.000000000000004 in binary floating point."""
    text = f"{round(rate * 100, 6):f}".rstrip("0").rstrip(".")
    return text + "%"


def bracket_rows(brackets: list, unit: str, prefix: str = "") -> list[str]:
    """Render a cumulative bracket table the way the Budget guide sets them out.

    `unit` is what the rate applies to ("taxable income", "taxable turnover",
    "the value"); `prefix` is "R" for the tables that carry the currency symbol
    inline, which transfer duty does and the income tables do not.
    """
    rows = []
    for b in brackets:
        low, high = b["from"], b["to"]
        band = (
            f"{money_plain(low + 1)} – {money_plain(high)}"
            if high is not None
            else f"{money_plain(low + 1)} and above"
        )
        rule = ""
        if b["base"]:
            rule += f"{prefix}{money_plain(b['base'])} + "
        rule += f"{pct(b['rate'])} of {unit}"
        if low:
            rule += f" above {prefix}{money_plain(low)}"
        rows.append(f"<tr><td>{band}</td><td>{rule}</td></tr>")
    return rows


def resolve(path: str):
    """Look up a dotted path inside the current tax year's data."""
    node = YEAR
    for key in path.split("."):
        node = node[key]
    return node


FORMATTERS = {"money": money, "money_plain": money_plain, "pct": pct}


def simple_rows(spec: list) -> list[str]:
    """Render a plain label/value table from (label, path, formatter, suffix)."""
    rows = []
    for label, path, fmt, suffix in spec:
        value = FORMATTERS[fmt](resolve(path))
        rows.append(f"<tr><td>{label}</td><td>{value}{suffix}</td></tr>")
    return rows


def year_options(requires: str | None = None) -> list[str]:
    """<option> for every tax year in the data, newest first, current selected.

    Generated rather than written into the fragment so that adding a year to
    data/tax-rates.json is genuinely a one-file change — the selector, the
    calculators and the tables all follow from it.

    `requires` names a section a year must actually carry to be offered. Past
    years are allowed to hold only what a calculator needs (see `_partial_years`
    in the JSON), so a company-tax page must not list a year whose data has no
    company rates in it — the picker would offer a year that silently fell back
    to another one's figures.
    """
    labels = sorted(RATES["years"], reverse=True)
    out = []
    for label in labels:
        year = RATES["years"][label]
        if requires and not year.get(requires):
            continue
        selected = " selected" if label == RATES["current"] else ""
        current = " (current)" if label == RATES["current"] else ""
        out.append(
            f'<option value="{esc(label)}"{selected}>'
            f'{esc(label)}{current} &mdash; {esc(year["period"])}</option>'
        )
    return out


def rate_table(name: str) -> list[str]:
    if name == "year_options":
        return year_options()
    if name == "year_options_company":
        return year_options(requires="company")
    if name == "year_options_interest":
        return year_options(requires="sars_interest")
    if name == "year_options_coida":
        return year_options(requires="coida")
    ind = "individual"
    if name == "individual_brackets":
        return bracket_rows(resolve(f"{ind}.brackets"), "taxable income")
    if name == "sbc_brackets":
        return bracket_rows(resolve("company.sbc_brackets"), "taxable income")
    if name == "turnover_brackets":
        return bracket_rows(resolve("company.turnover_brackets"), "taxable turnover")
    if name == "transfer_duty_brackets":
        return bracket_rows(resolve("transfer_duty.brackets"), "the value", prefix="R")
    if name == "rebates":
        return simple_rows([
            ("Primary", f"{ind}.rebates.primary", "money", ""),
            ("Secondary (65 and older)", f"{ind}.rebates.secondary", "money", ""),
            ("Tertiary (75 and older)", f"{ind}.rebates.tertiary", "money", ""),
        ])
    if name == "thresholds":
        return simple_rows([
            ("Under 65", f"{ind}.thresholds.under_65", "money", ""),
            ("65 to below 75", f"{ind}.thresholds.age_65_to_74", "money", ""),
            ("75 and older", f"{ind}.thresholds.age_75_plus", "money", ""),
        ])
    if name == "interest_exemptions":
        return simple_rows([
            ("Under 65", f"{ind}.interest_exemption.under_65", "money", " per annum"),
            ("65 and older", f"{ind}.interest_exemption.age_65_plus", "money", " per annum"),
        ])
    if name == "medical_credit":
        return simple_rows([
            ("First two members (each)", f"{ind}.medical_credit.first_two_each", "money", " per month"),
            ("Each additional dependant", f"{ind}.medical_credit.each_additional", "money", " per month"),
        ])
    raise KeyError(f"unknown rate table {name!r}")


RATE_TOKEN_RE = re.compile(r"^([ \t]*)\{\{rates:(\w+)\}\}[ \t]*$", re.M)


def expand_rate_tables(markup: str) -> str:
    """Replace each `{{rates:name}}` line with its rows at the same indent."""
    def repl(match: re.Match) -> str:
        indent, name = match.group(1), match.group(2)
        return indent + ("\n" + indent).join(rate_table(name))

    return RATE_TOKEN_RE.sub(repl, markup)


def write_tax_rates_js() -> None:
    """Emit the rate data for the browser.

    Calculators read `window.SA_TAX_RATES` rather than carrying their own copy
    of the brackets, so adding a calculator adds no new place for a Budget
    update to be missed. The whole `years` map ships, not just the current
    year, so a year selector needs no further build work.
    """
    # The JSON is heavily commented, and `_`-prefixed keys are those comments.
    # They are for whoever updates the file after the next Budget, not for the
    # browser — shipping them would roughly double the payload.
    def strip_comments(node):
        if isinstance(node, dict):
            return {k: strip_comments(v) for k, v in node.items() if not k.startswith("_")}
        if isinstance(node, list):
            return [strip_comments(item) for item in node]
        return node

    payload = json.dumps(
        strip_comments({
            "current": RATES["current"],
            "years": RATES["years"],
            # Statutory amounts that are not tax and do not move with the tax
            # year — CIPC annual return fees, and the Tax Administration Act
            # penalty table — but which a calculator still needs.
            "cipc": RATES.get("cipc", {}),
            "sars_penalties": RATES.get("sars_penalties", {}),
        }),
        separators=(",", ":"),
        ensure_ascii=False,
    )
    write(
        ROOT / "js" / "tax-rates.js",
        "/* GENERATED by build.py from data/tax-rates.json — do not edit.\n"
        "   Edit the JSON and rebuild; `python build.py --check` proves the\n"
        "   brackets are internally consistent before they ship. */\n"
        f"window.SA_TAX_RATES = {payload};\n",
    )


# Deferred to here because it formats with money() and pct(), which are defined
# in this section, whereas TOKENS itself has to exist further up for detokenise.
_register_rate_tokens()


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

    if kind == "tool":
        # A calculator is a WebApplication, not an Article. The distinction is
        # not cosmetic: it is what makes the page eligible to be described as a
        # free tool rather than a piece of writing, and `isAccessibleForFree`
        # plus a zero-price Offer is what stops it being read as a paywalled or
        # trial product.
        return {
            "@type": ["WebApplication", "WebPage"],
            "@id": url + "#webapp",
            "name": page["h1"],
            "url": url,
            "description": page["description"],
            "applicationCategory": "FinanceApplication",
            "applicationSubCategory": "Tax calculator",
            "operatingSystem": "Any modern web browser",
            "browserRequirements": "Requires JavaScript",
            "inLanguage": SITE["locale"],
            "isAccessibleForFree": True,
            "offers": {"@type": "Offer", "price": "0", "priceCurrency": "ZAR"},
            "creator": {"@id": f"{DOMAIN}/#organization"},
            "publisher": {"@id": f"{DOMAIN}/#organization"},
            "isPartOf": {"@id": f"{DOMAIN}/#website"},
            "dateModified": updated,
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

    {font_preloads_for(page)}
    <link rel="stylesheet" href="/css/styles.css?v={CSS_VERSION}" />

    {jsonld_for(page)}"""


def nav_markup(current: str) -> str:
    """Desktop navigation. Dropdowns open on hover AND focus-within, so they
    are reachable by keyboard without any JavaScript."""
    out = []
    for item in NAV:
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
    for item in NAV:
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

      <nav class="mobile-panel" id="mobile-panel" aria-label="Mobile">
        <div class="mobile-panel-inner">
          <ul>{mobile_nav_markup()}</ul>
          <div class="container">
            <a class="nav-phone" href="tel:{CONTACT['phone_e164']}">Call / WhatsApp — {esc(CONTACT['phone_display'])}</a>
          </div>
        </div>
      </nav>
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
        pretty = pretty_date(updated)
        # Which primary sources this page was actually checked against. Most
        # guides are tax and so default to SARS and Treasury, but not all of
        # them are — the CIPC reinstatement guide is checked against CIPC, and
        # a stamp claiming otherwise is a false statement about provenance on a
        # site whose whole argument is that its figures are properly sourced.
        # Override per page with "sources" in pages.json.
        sources = page.get("sources", "SARS and National Treasury")
        stamp = (
            f'<p class="page-stamp">Last reviewed <time datetime="{updated}">{pretty}</time>'
            f" against {esc(sources)} sources.</p>"
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
        for item in NAV if item["label"] == "Services"
        for kid in item["children"]
    )
    resource_links = "".join(
        f'<a href="{kid["href"]}">{esc(kid["label"])}</a>'
        for item in NAV if item["label"] == "Resources"
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
              <a href="/disclaimer">Disclaimer</a>{consent_footer_link()}
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


def page_scripts(page: dict) -> str:
    """Extra JS for the handful of pages that need it.

    The calculators are several kilobytes of arithmetic that 18 of the 20 pages
    have no use for, so they do not go in main.js. Listed per page in
    pages.json as `"scripts": ["tax-calculator.js"]`, and content-hashed for
    the same reason main.js is — /js/* is served `immutable` for a year.
    """
    names = page.get("scripts") or []
    if not names:
        return ""
    return "".join(
        f'    <script src="/js/{name}?v={asset_version("js/" + name)}"></script>\n'
        for name in names
    )


def consent_scripts() -> str:
    """consent.js then tags.js, on every page, and only when a tag exists.

    Order is not cosmetic: tags.js registers its loaders through the KAConsent
    API, so consent.js has to have run first. Neither ships at all while every
    ID in site.json is blank — a consent script with nothing to consent to is
    just another script to audit.
    """
    if not TRACKING_ON:
        return ""
    return (
        f'    <script src="/js/consent.js?v={asset_version("js/consent.js")}"></script>\n'
        f'    <script src="/js/tags.js?v={asset_version("js/tags.js")}"></script>\n'
    )


def render(page: dict) -> str:
    body = (CONTENT / page["file"]).read_text(encoding="utf-8")
    # Feature flags first, so a section that is switched off costs nothing
    # downstream — no rate tables expanded into it, no tokens resolved, and
    # nothing left for check_links() to trip over.
    body = apply_features(body)
    # Rate tables next: they emit markup containing no tokens, but detokenise
    # must still run over the surrounding prose.
    body = expand_rate_tables(body)
    body = detokenise(body).strip()
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
{consent_markup()}
    <script src="/js/main.js?v={JS_VERSION}"></script>
{consent_scripts()}{page_scripts(page)}  </body>
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
    write(
        ROOT / "sitemap.xml",
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(entries)
        + "\n</urlset>\n",
    )


def write_robots() -> None:
    write(
        ROOT / "robots.txt",
        "# https://www.robotstxt.org/robotstxt.html\n"
        "User-agent: *\n"
        "Allow: /\n\n"
        "# Nothing here is private, but these are build inputs, not pages.\n"
        "Disallow: /content/\n\n"
        f"Sitemap: {DOMAIN}/sitemap.xml\n",
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


def check_tax_constants() -> list[str]:
    """Prove the rate data is internally consistent before it ships.

    This used to scrape the brackets out of js/income-tax-calculator.js with a
    regex and compare them against a table parsed out of guide-rates.html,
    because the figures genuinely lived in both places. They now live in
    data/tax-rates.json alone, so there is no longer a copy to disagree with —
    what is left to check is whether the data itself makes sense.

    Two properties, both of which catch a mistyped digit that would otherwise
    ship as a confident wrong answer:

    1.  Every cumulative `base` equals the tax due at the top of the bracket
        below it. The tables are self-proving: 245 100 x 18% must be 44 118,
        and if it is not, one of those two numbers is wrong. Checked for every
        bracket table, not just the individual one.
    2.  Each tax threshold equals its rebate divided by the first bracket rate.
        The threshold IS the rebate expressed as income, so a Budget update
        that moves one without the other is an error by construction.
    """
    problems = []

    for year_label, year in RATES["years"].items():
        # A past year may carry only the sections a calculator needs — see
        # `_partial_years` in the JSON. Validate what is there; do not demand
        # figures nobody has verified yet.
        candidates = [
            ("individual", year.get("individual", {}).get("brackets")),
            ("SBC", year.get("company", {}).get("sbc_brackets")),
            ("turnover tax", year.get("company", {}).get("turnover_brackets")),
            ("transfer duty", year.get("transfer_duty", {}).get("brackets")),
        ]
        tables = [(name, rows) for name, rows in candidates if rows]

        for name, brackets in tables:
            for i in range(1, len(brackets)):
                prev, row = brackets[i - 1], brackets[i]
                expected = prev["base"] + (prev["to"] - prev["from"]) * prev["rate"]
                if abs(expected - row["base"]) > 0.5:
                    problems.append(
                        f"  {year_label} {name} bracket {i + 1}: base is "
                        f"{row['base']:,.0f} but the tax at the top of bracket {i} "
                        f"works out to {expected:,.0f}"
                    )
            # A gap or overlap between bands leaves income that is taxed twice
            # or not at all, which no amount of correct arithmetic recovers.
            for i in range(1, len(brackets)):
                if brackets[i]["from"] != brackets[i - 1]["to"]:
                    problems.append(
                        f"  {year_label} {name} bracket {i + 1} starts at "
                        f"{brackets[i]['from']:,.0f} but bracket {i} ended at "
                        f"{brackets[i - 1]['to']:,.0f}"
                    )
            if brackets[-1]["to"] is not None:
                problems.append(f"  {year_label} {name}: the top bracket must have \"to\": null")

        ind = year.get("individual")
        if not ind:
            continue
        first_rate = ind["brackets"][0]["rate"]
        rebates = ind["rebates"]
        for key, cumulative in (
            ("under_65", rebates["primary"]),
            ("age_65_to_74", rebates["primary"] + rebates["secondary"]),
            ("age_75_plus", rebates["primary"] + rebates["secondary"] + rebates["tertiary"]),
        ):
            expected = cumulative / first_rate
            actual = ind["thresholds"][key]
            if abs(expected - actual) > 1:
                problems.append(
                    f"  {year_label} threshold {key}: published as {actual:,.0f} but "
                    f"rebates of {cumulative:,.0f} at {first_rate:.0%} give {expected:,.0f}"
                )

    # site.json names the tax year in prose ("2026/27") for page copy; the data
    # file is what the figures come from. If they drift, the page says one year
    # and shows another year's numbers.
    if SITE["tax_year"]["label"] != RATES["current"]:
        problems.append(
            f"  site.json tax_year.label is {SITE['tax_year']['label']!r} but "
            f"data/tax-rates.json current is {RATES['current']!r}"
        )

    return problems


LINK_RE = re.compile(r'href="(/[^"#?]*)"')


def check_links(written: dict[str, str]) -> list[str]:
    """Catch internal links that point at pages or files which do not exist."""
    known = {path_for(p["slug"]) for p in PAGES}
    known |= {"/", "/sitemap.xml", "/robots.txt", "/manifest.json"}

    # Every real file under /assets, /css and /js counts as a valid target.
    # This used to be a hand-maintained list of a dozen filenames, which meant
    # adding an asset required remembering to add it here too — and the failure
    # mode was a build error on a link that was actually fine. Reading the
    # directories keeps the check honest in both directions: a typo'd asset URL
    # still fails, and a new asset needs no bookkeeping.
    for folder in ("assets", "css", "js"):
        base = ROOT / folder
        if not base.exists():
            continue
        for item in base.rglob("*"):
            if item.is_file():
                known.add("/" + item.relative_to(ROOT).as_posix())

    problems = []
    for slug, markup in written.items():
        for href in set(LINK_RE.findall(markup)):
            if href not in known:
                problems.append(f"  {path_for(slug) or '/'} → {href}")
    return sorted(set(problems))


MARKER_RE = re.compile(r"<!--\s*/?(?:no)?feature:[\w-]+\s*-->")


def check_markers(written: dict[str, str]) -> list[str]:
    """No feature marker may survive into a shipped page.

    A leftover marker means its block was never evaluated, so the page is
    showing whichever variant happened to be written first — which on the
    privacy notice means publishing a claim about the site that is not true.
    """
    problems = []
    for slug, markup in written.items():
        found = sorted(set(MARKER_RE.findall(markup)))
        if found:
            problems.append(f"  {path_for(slug) or '/'} still contains {', '.join(found)}")
    return sorted(problems)


def main() -> int:
    # Must run BEFORE the pages render: page_scripts() content-hashes every
    # file it links, so js/tax-rates.js has to be on disk and current or the
    # calculator pages ship a `?v=` for the previous build's data.
    write_tax_rates_js()
    print("  wrote js/tax-rates.js")

    # Same reason: consent_scripts() content-hashes js/tags.js, so it has to be
    # on disk and current before the first page renders.
    write_tag_loaders()

    written: dict[str, str] = {}
    for page in PAGES:
        markup = render(page)
        target = outfile_for(page["slug"])
        target.parent.mkdir(parents=True, exist_ok=True)
        write(target, markup)
        written[page["slug"]] = markup
        print(f"  wrote {target.relative_to(ROOT)}")

    write_sitemap()
    write_robots()
    write_headers()
    print(f"  wrote sitemap.xml ({sum(1 for p in PAGES if not p.get('noindex'))} URLs)")
    print("  wrote robots.txt")
    print(f"  wrote _headers ({len(ACTIVE_VENDORS)} tracking origin set(s) in the CSP)")

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
    off = [name for name in FEATURES if not name.startswith("_") and not FEATURES.get(name)]
    if off:
        print(
            f"\nFeatures switched off in site.json ({', '.join(sorted(off))}) — "
            f"{len(HIDDEN_PAGES)} page{'s' if len(HIDDEN_PAGES) != 1 else ''} not built:"
        )
        for page in HIDDEN_PAGES:
            print(f"  · {path_for(page['slug'])}")
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

        marker_problems = check_markers(written)
        if marker_problems:
            print("\nUnresolved feature blocks (the page is showing an unevaluated variant):")
            print("\n".join(marker_problems))
            failed = True
        else:
            print("Feature block check passed — every flagged block resolved.")

        analytics_problems = check_analytics()
        if analytics_problems:
            print("\nTracking, CSP and privacy notice disagree:")
            print("\n".join(analytics_problems))
            failed = True
        elif TRACKING_ON:
            print(
                f"Analytics check passed — {len(ACTIVE_VENDORS)} tag"
                f"{'s' if len(ACTIVE_VENDORS) != 1 else ''} configured, each with its CSP "
                f"origins, consent category and privacy-notice disclosure."
            )
        else:
            print(
                "Analytics check passed — no tracking tags configured, so no consent "
                "banner, no consent cookie and no third-party origins in the CSP."
            )

        tax_problems = check_tax_constants()
        if tax_problems:
            print("\nTax rate data is inconsistent:")
            print("\n".join(tax_problems))
            failed = True
        else:
            years = len(RATES["years"])
            print(
                f"Tax rate check passed — brackets, bands and thresholds are "
                f"internally consistent for {years} tax year"
                f"{'s' if years != 1 else ''}."
            )

        return 1 if failed else 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
