(function () {
  "use strict";

  /* Mobile navigation toggle */
  var toggle = document.querySelector(".nav-toggle");
  var panel = document.querySelector(".mobile-panel");

  if (toggle && panel) {
    toggle.addEventListener("click", function () {
      var isOpen = panel.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(isOpen));
    });

    panel.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        panel.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
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
