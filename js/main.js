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

  /* Footer year */
  var yearEl = document.getElementById("year");
  if (yearEl) { yearEl.textContent = new Date().getFullYear(); }

  /* Map: only talk to Google once the visitor asks for the map. */
  var mapFrame = document.getElementById("map-frame");
  var mapBtn = document.getElementById("map-load-btn");
  if (mapFrame && mapBtn) {
    mapBtn.addEventListener("click", function () {
      var iframe = mapFrame.querySelector("iframe[data-src]");
      if (iframe) {
        iframe.src = iframe.getAttribute("data-src");
        iframe.removeAttribute("data-src");
      }
      mapFrame.classList.add("is-loaded");
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
    form.addEventListener("submit", function (event) {
      event.preventDefault();

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
      if (submitBtn) { submitBtn.disabled = true; }
      showStatus("Sending…", "info");

      fetch(form.action, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: new FormData(form),
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data && data.success) {
            showStatus("Thanks — your message is on its way. We'll reply soon.", "success");
            form.reset();
          } else {
            showStatus("Something went wrong sending that. Please try calling, WhatsApp or email instead.", "error");
          }
        })
        .catch(function () {
          showStatus("Something went wrong sending that. Please try calling, WhatsApp or email instead.", "error");
        })
        .finally(function () {
          if (submitBtn) { submitBtn.disabled = false; }
        });
    });
  }
})();
