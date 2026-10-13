(function () {
  "use strict";

  /* Mobile navigation toggle.

     The panel is hidden with `visibility: hidden` rather than height alone, so
     its links are already out of the tab order and the accessibility tree when
     closed — nothing here needs to manage that. What this does manage is
     getting *out* of the menu: Escape, a tap outside it, following a link, or
     the viewport growing past the desktop breakpoint. Each of those used to
     leave the menu stuck open, and Escape not working is the one that strands
     a keyboard user with no obvious way back. */
  var toggle = document.querySelector(".nav-toggle");
  var panel = document.querySelector(".mobile-panel");

  if (toggle && panel) {
    var setOpen = function (open, returnFocus) {
      panel.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      /* Only pull focus back to the burger when the menu was dismissed by an
         action that isn't itself a navigation — otherwise we would yank focus
         off the link the visitor just followed. */
      if (!open && returnFocus) { toggle.focus(); }
    };

    toggle.addEventListener("click", function () {
      setOpen(!panel.classList.contains("is-open"), false);
    });

    panel.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () { setOpen(false, false); });
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && panel.classList.contains("is-open")) {
        setOpen(false, true);
      }
    });

    document.addEventListener("click", function (event) {
      if (!panel.classList.contains("is-open")) return;
      if (panel.contains(event.target) || toggle.contains(event.target)) return;
      setOpen(false, false);
    });

    /* At >=860px the panel is `display: none`, so an open menu becomes
       invisible while aria-expanded stays "true" — a screen reader would keep
       announcing an expanded menu that isn't there. */
    var desktop = window.matchMedia("(min-width: 860px)");
    var syncToViewport = function (mq) {
      if (mq.matches) { setOpen(false, false); }
    };
    if (desktop.addEventListener) {
      desktop.addEventListener("change", syncToViewport);
    } else if (desktop.addListener) {
      desktop.addListener(syncToViewport);      /* Safari < 14 */
    }
  }

  /* The .reveal entrance animation used to live here as an
     IntersectionObserver that removed an `opacity: 0`. That made this script
     load-bearing for whether the page showed any content at all. It is now a
     pure CSS animation (see .reveal in styles.css) whose resting state is
     visible, so there is nothing to do here and nothing to go wrong. */

  /* Conversion tracking.

     Phone, WhatsApp, email and Facebook activations measure contact intent.
     A form provider accepting a message is a separate event. Neither proves
     an enquiry was received, qualified, quoted or became a paying client;
     reconcile those outcomes separately with the practice's enquiry record.

     Done with one delegated listener rather than by tagging every link, because
     the phone number appears in five places (hero, sticky bar, mobile menu,
     footer, contact page) and a per-link attribute would be forgotten in one of
     them within a month. `where` records which placement earned the tap, which
     is the part that tells you what to change.

     The gtag queue exists before permission. Check the current decision on
     every activation, including after a visitor withdraws consent. */
  function placement(el) {
    var region = el.closest(
      ".sticky-contact, .mobile-panel, .site-footer, .page-hero, .contact-form-card, .contact-direct, .cta-band, .site-header"
    );
    if (!region) return "body";
    return (region.className.split(" ")[0] || "body").replace(/^(site|page)-/, "");
  }

  function track(name, el) {
    if (!window.KAConsent || !window.KAConsent.get("analytics")) return;
    if (typeof window.gtag !== "function") return;
    window.gtag("event", name, {
      where: placement(el),
      page_path: location.pathname
    });
  }

  document.addEventListener("click", function (event) {
    var link = event.target.closest && event.target.closest("a[href]");
    if (!link) return;
    var href = link.getAttribute("href") || "";
    if (href.indexOf("tel:") === 0) track("contact_call", link);
    else if (href.indexOf("wa.me") !== -1) track("contact_whatsapp", link);
    else if (href.indexOf("mailto:") === 0) track("contact_email", link);
    else {
      try {
        /* Match the actual Facebook host, never a substring in another
           destination's path or query. Send placement/page only, not the URL. */
        if (new URL(href, location.href).hostname === "www.facebook.com") {
          track("contact_facebook", link);
        }
      } catch (error) { /* Malformed links do not affect other navigation. */ }
    }
  });

  /* Footer year */
  var yearEl = document.getElementById("year");
  if (yearEl) { yearEl.textContent = new Date().getFullYear(); }

  /* Map: only talk to Google once the visitor asks for the map. */
  var mapFrame = document.getElementById("map-frame");
  var mapBtn = document.getElementById("map-load-btn");
  if (mapFrame && mapBtn) {
    var mapStatus = document.getElementById("map-status");
    var mapTimer;
    var reportMap = function (message) {
      if (!mapStatus) return;
      mapStatus.textContent = message;
      mapStatus.hidden = false;
    };
    mapBtn.addEventListener("click", function () {
      var iframe = mapFrame.querySelector("iframe[data-src]");
      if (!iframe) return;
      mapFrame.setAttribute("aria-busy", "true");
      reportMap("Requesting Google Maps… You can also use the Open in Google Maps link below for directions.");
      /* A cross-origin iframe's load event can also fire for an error page.
         It tells us the navigation finished, not that a map rendered. Keep
         the alternative directions visible and never announce success. */
      iframe.addEventListener("load", function () {
        clearTimeout(mapTimer);
        mapFrame.setAttribute("aria-busy", "false");
        reportMap("If the map is blank or unavailable, use Open in Google Maps below or contact us for directions.");
      }, { once: true });
      iframe.addEventListener("error", function () {
        clearTimeout(mapTimer);
        mapFrame.setAttribute("aria-busy", "false");
        reportMap("The map request could not complete. Use Open in Google Maps below or contact us for directions.");
      }, { once: true });
      mapTimer = setTimeout(function () {
        mapFrame.setAttribute("aria-busy", "false");
        reportMap("Google Maps may be slow or unavailable. If it has not appeared, use Open in Google Maps below or contact us for directions.");
      }, 8000);
      iframe.src = iframe.getAttribute("data-src");
      iframe.removeAttribute("data-src");
      mapFrame.classList.add("is-requested");
    });
  }

  /* Contact form: honeypot spam check + Web3Forms submission.
     build.py writes the literal "UNCONFIGURED" into access_key whenever
     site.json has no forms.web3forms_key, so an un-set-up copy of the site
     fails visibly and helpfully instead of silently posting a doomed
     request. See TODO-BEFORE-LAUNCH.md for the one-step activation. */
  var form = document.getElementById("contact-form");
  var status = document.getElementById("form-status");

  function showStatus(message, kind) {
    if (!status) return;
    status.textContent = message;
    status.className = "form-status is-visible is-" + kind;
  }

  if (form && status) {
    var submitting = false;
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (submitting || !form.reportValidity()) return;

      var honeypot = form.querySelector('input[name="website"]');
      if (honeypot && honeypot.value) {
        /* Bot filled the trap field. Pretend success; do not submit. */
        showStatus("Thanks — we'll be in touch shortly.", "success");
        form.reset();
        return;
      }

      var accessKeyField = form.querySelector('input[name="access_key"]');
      var accessKey = accessKeyField ? accessKeyField.value : "";
      if (!accessKey || accessKey === "UNCONFIGURED") {
        showStatus(
          "This form isn't switched on yet — please call, WhatsApp or email us directly using the details alongside.",
          "info"
        );
        return;
      }

      var submitBtn = form.querySelector('button[type="submit"]');
      submitting = true;
      if (submitBtn) { submitBtn.disabled = true; }
      showStatus("Sending…", "info");
      var controller = new AbortController();
      var timeout;
      var request = fetch(form.action, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: new FormData(form),
        signal: controller.signal
      });
      var deadline = new Promise(function (resolve, reject) {
        timeout = setTimeout(function () {
          controller.abort();
          reject(new Error("Request timed out"));
        }, 15000);
      });
      Promise.race([request, deadline])
        .then(function (res) {
          if (!res.ok) throw new Error("Request rejected");
          return res.json();
        })
        .then(function (data) {
          if (data && data.success) {
            showStatus("Thanks — your message is on its way. We'll reply soon.", "success");
            /* Provider acceptance, not proof of delivery or qualification. */
            track("generate_lead", form);
            form.reset();
          } else {
            showStatus("Something went wrong sending that. Please try calling, WhatsApp or email instead.", "error");
          }
        })
        .catch(function () {
          showStatus("Something went wrong sending that. Please try calling, WhatsApp or email instead.", "error");
        })
        .finally(function () {
          clearTimeout(timeout);
          submitting = false;
          if (submitBtn) { submitBtn.disabled = false; }
        });
    });
  }
})();
