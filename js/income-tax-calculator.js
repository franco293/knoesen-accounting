/* South African income tax / PAYE calculator.
   Loaded only by /tools/income-tax-calculator (see pages.json → scripts),
   after js/tax-rates.js and js/sa-tax-core.js, which it depends on.

   No tax figure and no tax arithmetic lives in this file. The figures come
   from data/tax-rates.json via `window.SA_TAX_RATES`; the brackets, rebates
   and credits are applied by `window.SATax`, shared with every other salary
   calculator on the site. What is left here is this page: reading its form,
   filling in its table, and keeping its year picker and URL in step. */
(function () {
  "use strict";

  var form = document.getElementById("tax-calc");
  if (!form) return;

  var T = window.SATax;
  var el = function (id) { return document.getElementById(id); };

  /* If the data or the shared core did not load there is nothing to calculate
     with. Returning quietly would leave the panel showing "enter your income"
     for ever, so the visitor keeps typing into something that will never
     answer. Say so, and point at what still works. */
  if (!T || !T.currentYear()) {
    var empty = el("tc-empty");
    if (empty) {
      empty.textContent =
        "The tax tables could not be loaded, so this calculator cannot run. " +
        "Please reload the page — or see the published rate tables at " +
        "/resources/tax-rates-2026-2027, or call us and we will work it out.";
    }
    return;
  }

  function selectedYear() {
    var picker = el("tc-year");
    return picker ? picker.value : T.currentYear();
  }

  /* ---- Reading the form -------------------------------------------------- */

  function readInput() {
    var monthly = form.querySelector('input[name="period"]:checked').value === "monthly";
    var amount = T.parseAmount(el("tc-income").value);
    var retirement = T.parseAmount(el("tc-retirement").value);

    return {
      monthlyGross: monthly ? amount : amount / 12,
      annualGross: monthly ? amount * 12 : amount,
      annualRetirement: monthly ? retirement * 12 : retirement,
      ageBand: form.querySelector('input[name="age"]:checked').value,
      medicalMembers: parseInt(el("tc-medical").value, 10) || 0,
      includeUif: el("tc-uif").checked
    };
  }

  /* ---- Rendering --------------------------------------------------------- */

  function setText(id, text) {
    var node = el(id);
    if (node) node.textContent = text;
  }

  /* Say which year's figures produced the numbers, and when they were last
     checked. On a page that can show more than one year, "R17 820" on its own
     is ambiguous — and a visitor who has switched to a past year needs to know
     the answer is deliberately historic, not stale. */
  function renderYearNote(R) {
    var note = el("tc-year-note");
    if (!note) return;
    var reviewed = R.meta.verified_on
      ? ", reviewed " + T.prettyDate(R.meta.verified_on)
      : "";
    note.textContent =
      "Using the " + R.meta.label + " figures (" + R.meta.period + ")" +
      reviewed + ".";
  }

  function render() {
    var R = T.ratesFor(selectedYear());
    renderYearNote(R);

    var input = readInput();

    if (input.annualGross <= 0) {
      el("tc-results").hidden = true;
      el("tc-empty").hidden = false;
      return;
    }

    el("tc-empty").hidden = true;
    el("tc-results").hidden = false;

    var r = T.annualTax({
      gross: input.annualGross,
      retirement: input.annualRetirement,
      ageBand: input.ageBand,
      medicalMembers: input.medicalMembers
    }, R);

    var uif = input.includeUif ? T.annualUif(input.monthlyGross, R) : 0;
    var takeHome = input.annualGross - r.tax - uif - input.annualRetirement;

    setText("tc-out-tax-month", T.money(r.tax / 12));
    setText("tc-out-tax-year", T.money(r.tax));
    setText("tc-out-tax-year-2", T.money(r.tax));
    setText("tc-out-net-month", T.money(takeHome / 12));
    setText("tc-out-net-year", T.money(takeHome));

    setText("tc-out-gross", T.money(r.gross));
    setText("tc-out-taxable", T.money(r.taxableIncome));
    setText("tc-out-before", T.money(r.beforeRebates));
    setText("tc-out-rebates", "−" + T.money(r.rebatesApplied));
    setText("tc-out-medical", "−" + T.money(r.medicalApplied));
    setText("tc-out-uif", T.money(uif));
    setText("tc-out-effective", T.percent(r.effectiveRate));
    setText("tc-out-marginal", r.marginalRate > 0 ? T.percent(r.marginalRate) : "—");

    /* Retirement rows only earn their space when there is a contribution. */
    var retireRow = el("tc-row-retirement");
    if (retireRow) {
      retireRow.hidden = r.allowedRetirement <= 0;
      setText("tc-out-retirement", "−" + T.money(r.allowedRetirement));
    }
    var disallowed = el("tc-note-disallowed");
    if (disallowed) {
      disallowed.hidden = r.retirementDisallowed < 0.01;
      setText("tc-out-disallowed", T.money(r.retirementDisallowed));
    }

    var medicalRow = el("tc-row-medical");
    if (medicalRow) medicalRow.hidden = input.medicalMembers <= 0;

    var uifRow = el("tc-row-uif");
    if (uifRow) uifRow.hidden = !input.includeUif;

    var note = el("tc-threshold-note");
    if (note) note.hidden = !r.belowThreshold;
    var medNote = el("tc-medical-nil-note");
    if (medNote) medNote.hidden = !r.nilByMedical;

    /* Bracket breakdown table. */
    var tbody = el("tc-brackets-body");
    if (tbody) {
      var rows = T.bracketBreakdown(r.taxableIncome, R);
      tbody.textContent = "";
      rows.forEach(function (row) {
        var tr = document.createElement("tr");
        [row.band, row.rate, T.money(row.amount, 0), T.money(row.tax)].forEach(function (cell) {
          var td = document.createElement("td");
          td.textContent = cell;
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      el("tc-brackets").hidden = rows.length === 0;
    }
  }

  /* Recalculating on every keystroke is right for the numbers but wrong for a
     screen reader — an aria-live region would interrupt on each character. The
     figures update immediately; the announcement waits for a pause in typing. */
  var live = el("tc-live");
  var announceTimer = null;

  function announce() {
    if (!live) return;
    clearTimeout(announceTimer);
    announceTimer = setTimeout(function () {
      var monthly = el("tc-out-tax-month");
      var net = el("tc-out-net-month");
      if (monthly && net && !el("tc-results").hidden) {
        live.textContent =
          "Monthly PAYE " + monthly.textContent +
          ", monthly take-home pay " + net.textContent + ".";
      }
    }, 700);
  }

  function update() {
    render();
    announce();
  }

  /* The chosen year lives in the URL so a particular year can be linked to and
     shared — "/tools/income-tax-calculator?year=2025-26".

     Only the YEAR goes in the URL. The income, age and medical details
     deliberately do not, even though that would make a whole result shareable:
     a URL carrying somebody's salary gets pasted into chats, kept in browser
     history and logged by every proxy in between. This page promises that
     nothing you type leaves your browser, and a query string is the one part
     of a page that does. */
  function yearFromUrl() {
    var match = /[?&]year=([^&]+)/.exec(window.location.search);
    return match ? T.slugToYear(decodeURIComponent(match[1])) : null;
  }

  function syncUrlToYear() {
    if (!window.history || !window.history.replaceState) return;
    var picker = el("tc-year");
    if (!picker) return;
    /* replaceState, not pushState: flicking between years is adjusting one
       control, not navigating, and it should not take several Back presses to
       leave the page. */
    var url = window.location.pathname +
      (picker.value === T.currentYear() ? "" : "?year=" + T.yearToSlug(picker.value)) +
      window.location.hash;
    window.history.replaceState(null, "", url);
  }

  form.addEventListener("input", update);
  form.addEventListener("change", update);
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    update();
  });

  var yearPicker = el("tc-year");
  if (yearPicker) {
    var requested = yearFromUrl();
    if (requested) yearPicker.value = requested;
    yearPicker.addEventListener("change", syncUrlToYear);
  }

  /* Nothing is prefilled, so the first paint shows the empty state — but the
     year note still needs to render, hence a full render rather than nothing. */
  render();
})();
