/* Cookie consent.

   Hand-maintained, and deliberately knows nothing about Google, Meta or any
   other vendor. It does three things: remember what the visitor chose, show the
   banner when they have not chosen yet, and tell anyone who asked when a
   category is granted. js/tags.js — which IS generated, from the tracking IDs
   in site.json — is the only file that knows a vendor exists, and it can only
   load one through the API below.

   That split is the point. A tag cannot fire early by accident, because the
   code that loads it never runs until a category is granted. And this file
   never needs editing when a tag is added or removed.

   Storage is a first-party cookie rather than localStorage, for one reason:
   consent has to expire. localStorage never does, so an answer given once would
   stand forever and the visitor would never be asked again — which is not what
   consent means. CONSENT_MONTHS is how long an answer stands.

   Loaded on every page, but only when at least one tracking tag is configured.
   With every ID in site.json blank, build.py emits neither this file's <script>
   tag nor the banner, because there is nothing to consent to. */
(function () {
  "use strict";

  var COOKIE = "ka_consent";
  var VERSION = "v1";
  var CONSENT_MONTHS = 6;

  var banner = document.getElementById("consent");
  var options = document.getElementById("consent-options");
  var title = document.getElementById("consent-title");

  /* Categories are whatever the banner actually offers. Reading them out of the
     DOM rather than hard-coding a list means this file needs no edit when a
     category appears or disappears in site.json. */
  var toggles = [].slice.call(document.querySelectorAll("[data-consent-category]"));
  var categories = toggles.map(function (input) {
    return input.getAttribute("data-consent-category");
  });

  /* Two kinds of listener, and the difference matters. A grant listener loads a
     tag, so it must run exactly once. A change listener reports the current
     answer — Google Consent Mode has to hear "denied" as loudly as "granted",
     and has to hear it again if the visitor reopens the panel and changes their
     mind — so it runs on every decision, forever. */
  var grantListeners = [];
  var changeListeners = [];
  var granted = {};
  var decided = false;
  var returnFocus = null;
  var storageFailed = false;
  var refreshing = false;
  var channel = null;

  /* ---- Storage ---------------------------------------------------------- */

  function readCookie() {
    try {
      var match = document.cookie.match(new RegExp("(?:^|; )" + COOKIE + "=([^;]*)"));
      return match ? decodeURIComponent(match[1]) : "";
    } catch (error) {
      storageFailed = true;
      return "";
    }
  }

  function writeCookie(value) {
    var maxAge = CONSENT_MONTHS * 30 * 24 * 60 * 60;
    var secure = location.protocol === "https:" ? "; Secure" : "";
    try {
      document.cookie =
        COOKIE + "=" + encodeURIComponent(value) +
        "; Max-Age=" + maxAge + "; Path=/; SameSite=Lax" + secure;
      /* Some browsers silently discard writes. Never load a tag on the
         strength of an answer that the next permission check cannot read. */
      return readCookie() === value;
    } catch (error) {
      return false;
    }
  }

  /* Stored as "v1:analytics=1,marketing=0" — legible in devtools, and the
     version prefix means a future change to what we ask can invalidate old
     answers by bumping VERSION rather than silently reinterpreting them. */
  function parse(value) {
    if (!value || value.indexOf(VERSION + ":") !== 0) return null;
    var result = Object.create(null);
    var valid = true;
    value.slice(VERSION.length + 1).split(",").forEach(function (pair) {
      var bits = pair.split("=");
      if (bits.length !== 2 || !/^[a-z_]+$/.test(bits[0]) ||
          (bits[1] !== "0" && bits[1] !== "1") ||
          Object.prototype.hasOwnProperty.call(result, bits[0])) {
        valid = false;
        return;
      }
      result[bits[0]] = bits[1] === "1";
    });
    /* A newly offered category must receive an explicit answer too. */
    return valid && categories.every(function (name) {
      return Object.prototype.hasOwnProperty.call(result, name);
    }) ? result : null;
  }

  function serialise(state) {
    return VERSION + ":" + categories.map(function (name) {
      return name + "=" + (state[name] ? "1" : "0");
    }).join(",");
  }

  /* ---- Clearing a category's cookies ------------------------------------ */

  /* Which cookies belong to which category. Registered by js/tags.js, so this
     file still knows nothing about any vendor. Patterns may end in "*". */
  var owned = {};

  function matches(name, pattern) {
    return pattern.charAt(pattern.length - 1) === "*"
      ? name.indexOf(pattern.slice(0, -1)) === 0
      : name === pattern;
  }

  function forgetCookies(category) {
    var patterns = owned[category];
    if (!patterns || !patterns.length) return;

    var cookies;
    try { cookies = document.cookie; } catch (error) { return; }
    cookies.split("; ").forEach(function (pair) {
      var name = pair.split("=")[0];
      if (!name) return;
      var mine = patterns.some(function (pattern) {
        return matches(name, pattern);
      });
      if (!mine) return;

      /* A cookie is only overwritten by an exact domain/path match, and we
         cannot read which was used — so expire it against the host and the
         dot-host, at the root path. That covers how these vendors set theirs. */
      var host = location.hostname;
      [host, "." + host, ""].forEach(function (domain) {
        try {
          document.cookie =
            name + "=; Max-Age=0; Path=/" + (domain ? "; Domain=" + domain : "");
        } catch (error) { /* Storage cannot veto withdrawal. */ }
      });
    });
  }

  /* ---- Applying a decision ---------------------------------------------- */

  function run(fn) {
    try {
      fn(snapshot());
    } catch (error) {
      /* One broken vendor snippet must not take the others down with it. */
      if (window.console) window.console.error("consent listener failed", error);
    }
  }

  function apply(state, hasDecision) {
    decided = hasDecision;

    categories.forEach(function (name) {
      granted[name] = !!state[name];
      /* Refused or withdrawn: clear what that category already left behind.
         Stopping further collection but leaving the identifiers on the device
         is not really honouring the answer. */
      if (!granted[name]) forgetCookies(name);
    });

    /* Update permission (and vendor opt-out flags) before loading a new tag. */
    changeListeners.forEach(run);

    grantListeners = grantListeners.filter(function (entry) {
      if (!granted[entry.category]) return true;
      run(entry.fn);
      return false;
    });
  }

  /* Cookies are shared between tabs, but this JavaScript state is not. Re-read
     before permission is used and on browser lifecycle events. A missing,
     expired, malformed or unreadable answer always revokes loaded vendors as
     well as preventing the site's next event. Reads never extend its expiry. */
  function refresh() {
    if (refreshing) return;
    refreshing = true;
    try {
      var stored = parse(readCookie());
      if (storageFailed) stored = null;
      var state = stored || all(false);
      var changed = decided !== !!stored || categories.some(function (name) {
        return !!granted[name] !== !!state[name];
      });
      if (changed) {
        apply(state, !!stored);
        if (!stored) show(options && !options.hidden, false);
        else if (banner && !banner.hidden) {
          /* Synchronise an open panel without taking focus or dismissing a
             visitor's editing context when another tab changes the answer. */
          toggles.forEach(function (input) {
            input.checked = !!granted[input.getAttribute("data-consent-category")];
          });
        }
      }
    } finally {
      refreshing = false;
    }
  }

  function snapshot() {
    var out = {};
    categories.forEach(function (name) {
      out[name] = !!granted[name];
    });
    return out;
  }

  function all(value) {
    var state = {};
    categories.forEach(function (name) {
      state[name] = value;
    });
    return state;
  }

  function fromToggles() {
    var state = {};
    toggles.forEach(function (input) {
      state[input.getAttribute("data-consent-category")] = input.checked;
    });
    return state;
  }

  /* ---- Banner ----------------------------------------------------------- */

  function setActions(expanded) {
    var choose = banner.querySelector('[data-consent-action="choose"]');
    var save = banner.querySelector('[data-consent-action="save"]');
    if (choose) choose.hidden = expanded;
    if (save) save.hidden = !expanded;
  }

  function show(expanded, moveFocus) {
    if (!banner) return;
    if (moveFocus && !banner.contains(document.activeElement)) {
      returnFocus = document.activeElement;
    }
    banner.hidden = false;
    document.body.classList.add("consent-open");
    if (options) options.hidden = !expanded;
    setActions(expanded);
    /* Reflect what is actually stored, so reopening the panel shows the current
       answer rather than a row of empty boxes. */
    toggles.forEach(function (input) {
      input.checked = !!granted[input.getAttribute("data-consent-category")];
    });
    /* Focus is moved only when the visitor asked for the panel. Stealing it on
       page load would rip a keyboard user out of the content they came for. */
    /* A fresh banner already starts at the top. Resetting scrollTop after
       unhiding it forces a synchronous page layout before the remaining
       visibility changes. Only reset when reopening, after all DOM writes. */
    if (moveFocus) {
      banner.scrollTop = 0;
      if (title) title.focus();
    }
  }

  function hide() {
    if (!banner) return;
    banner.hidden = true;
    document.body.classList.remove("consent-open");
    if (returnFocus && document.contains(returnFocus)) returnFocus.focus();
    returnFocus = null;
  }

  function decide(state) {
    /* A previous failure can be resolved by a fresh, successfully persisted
       choice, but a blocked write must never keep an old grant alive. */
    storageFailed = false;
    var saved = writeCookie(serialise(state));
    storageFailed = !saved;
    apply(saved ? state : all(false), saved);
    if (channel) {
      try { channel.postMessage({ type: "decision", storageFailed: !saved }); }
      catch (error) { /* Lifecycle and permission checks remain available. */ }
    }
    hide();
  }

  if (banner) {
    banner.addEventListener("click", function (event) {
      var control = event.target.closest && event.target.closest("[data-consent-action]");
      if (!control || !banner.contains(control)) return;
      var action = control.getAttribute("data-consent-action");

      if (action === "accept") decide(all(true));
      else if (action === "reject") decide(all(false));
      else if (action === "save") decide(fromToggles());
      else if (action === "choose") {
        if (options) options.hidden = false;
        setActions(true);
        var first = banner.querySelector("[data-consent-category]");
        if (first) first.focus();
      }
    });

    /* Escape closes the panel WITHOUT recording anything. Dismissing a banner
       is not consent, so nothing is stored and it returns on the next visit. */
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !banner.hidden) hide();
    });
  }

  /* The footer "Cookie settings" control, on every page. POPIA s11(2)(b): a
     visitor may withdraw consent at any time, which needs a way back in. */
  document.addEventListener("click", function (event) {
    var opener = event.target.closest && event.target.closest('[data-consent-action="open"]');
    if (!opener || (banner && banner.contains(opener))) return;
    event.preventDefault();
    refresh();
    show(true, true);
    /* WebKit does not necessarily focus a button on a pointer click. Restore
       this actual opener, rather than whatever happened to be focused before. */
    returnFocus = opener;
  });

  /* ---- Public API ------------------------------------------------------- */

  window.KAConsent = {
    /* True only if that category has been granted. Unknown category: false. */
    get: function (category) {
      refresh();
      return !!granted[category];
    },
    /* Run fn as soon as `category` is granted — immediately, if it already is,
       so a listener registered after the fact is never lost to load order. */
    onGrant: function (category, fn) {
      refresh();
      if (granted[category]) run(fn);
      else grantListeners.push({ category: category, fn: fn });
    },
    /* Run fn on every decision, granted or refused, now and in future. */
    onChange: function (fn) {
      refresh();
      changeListeners.push(fn);
      run(fn);
    },
    /* Declare which cookies a category owns, so refusing or withdrawing it
       clears them. Called by js/tags.js; names may end in "*". */
    forget: function (category, names) {
      owned[category] = (owned[category] || []).concat(names);
      refresh();
      if (!granted[category]) forgetCookies(category);
    },
    open: function () {
      refresh();
      show(true, true);
    }
  };

  /* ---- Start ------------------------------------------------------------ */

  window.addEventListener("focus", refresh);
  window.addEventListener("pageshow", refresh);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") refresh();
  });

  /* No localStorage identifier or polling is needed. BroadcastChannel promptly
     informs other open same-origin tabs; Cookie Store also covers cookie
     changes outside this UI where the browser supports it. Neither API is
     required: get(), focus and restored-page checks still fail closed. */
  if (typeof window.BroadcastChannel === "function") {
    try {
      channel = new window.BroadcastChannel("ka-consent");
      channel.addEventListener("message", function (event) {
        if (!event.data || event.data.type !== "decision") return;
        storageFailed = !!event.data.storageFailed;
        refresh();
      });
    } catch (error) { /* Browser privacy settings may disable this API. */ }
  }
  if (window.cookieStore && window.cookieStore.addEventListener) {
    window.cookieStore.addEventListener("change", function (event) {
      var changed = (event.changed || []).concat(event.deleted || []);
      if (changed.some(function (cookie) { return cookie.name === COOKIE; })) refresh();
    });
  }

  apply(all(false), false);
  refresh();
  if (!decided) show(false, false);
})();
