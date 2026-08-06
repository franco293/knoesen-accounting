/* South African income tax / PAYE calculator.
   Loaded only by /tools/income-tax-calculator (see pages.json → scripts),
   after js/tax-rates.js, which it depends on.

   No tax figure is written in this file. Every bracket, rebate, credit and cap
   comes from data/tax-rates.json via `window.SA_TAX_RATES`, the same source
   that renders the visible tables on /resources/tax-rates-2026-2027. Before
   that existed the brackets lived here AND in the guide, and a Budget update
   that touched only one left the calculator quietly disagreeing with the page
   documenting it. `python build.py --check` proves the data is internally
   consistent — every cumulative amount against the bracket below it, and every
   threshold against its rebate — before any of it ships. */
(function () {
  "use strict";

  var form = document.getElementById("tax-calc");
  if (!form) return;

  /* If tax-rates.js did not load there are no brackets to calculate with.
     Returning quietly would leave the panel showing "enter your income" for
     ever, so the visitor keeps typing into something that will never answer.
     Say so, and point at the pages that still work. */
  var DATA = window.SA_TAX_RATES;
  if (!DATA) {
    var empty = document.getElementById("tc-empty");
    if (empty) {
      empty.textContent =
        "The tax tables could not be loaded, so this calculator cannot run. " +
        "Please reload the page — or see the published rate tables at " +
        "/resources/tax-rates-2026-2027, or call us and we will work it out.";
    }
    return;
  }

  var el = function (id) { return document.getElementById(id); };

  /* Which year's figures to use. Read per render rather than resolved once,
     because the visitor can change it — and between 2025/26 and 2026/27 the
     BRACKETS ARE IDENTICAL while the rebates, medical credits and retirement
     cap all moved. A calculator that quietly used one year's rebates against
     another year's income would look right and be wrong. */
  function ratesFor(yearKey) {
    var year = DATA.years[yearKey] || DATA.years[DATA.current];
    var ind = year.individual;
    return {
      key: DATA.years[yearKey] ? yearKey : DATA.current,
      meta: year,
      /* `to: null` marks the top bracket in the data, because JSON has no
         Infinity. The arithmetic compares against it, so convert here. */
      brackets: ind.brackets.map(function (b) {
        return {
          from: b.from,
          to: b.to === null ? Infinity : b.to,
          base: b.base,
          rate: b.rate
        };
      }),
      /* Rebates are cumulative: a 76-year-old gets all three. */
      rebates: ind.rebates,
      /* Medical scheme fees tax credit, per month: one amount for each of the
         first two people covered, a lower one for every dependant after. */
      medical: ind.medical_credit,
      /* Retirement contributions: deductible up to a percentage of the greater
         of remuneration or taxable income, never more than the annual cap. */
      retirement: ind.retirement,
      /* UIF is the one figure NOT in the Budget guide, which says only "below
         a certain amount" — the ceiling comes from SARS. It is capped MONTHLY,
         so annualising it is only correct for steady pay, which is what this
         calculator assumes. */
      uif: {
        rate: year.payroll.uif_employee_rate,
        monthlyCeiling: year.payroll.uif_monthly_ceiling
      }
    };
  }

  function selectedYear() {
    var picker = el("tc-year");
    return picker ? picker.value : DATA.current;
  }

  /* ---- Formatting --------------------------------------------------------
     Non-breaking thin gaps between thousands, matching how SARS and the rate
     tables on this site set numbers, and so a figure never wraps mid-number. */
  function money(value, decimals) {
    var negative = value < 0;
    var n = Math.abs(value);
    var fixed = n.toFixed(decimals === undefined ? 2 : decimals);
    var parts = fixed.split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return (negative ? "−R" : "R") + parts.join(".");
  }

  function percent(value) {
    return (value * 100).toFixed(1).replace(/\.0$/, "") + "%";
  }

  /* ---- The arithmetic ---------------------------------------------------- */

  function bracketFor(taxableIncome, R) {
    var brackets = R.brackets;
    for (var i = 0; i < brackets.length; i++) {
      if (taxableIncome <= brackets[i].to) return brackets[i];
    }
    return brackets[brackets.length - 1];
  }

  function taxBeforeRebates(taxableIncome, R) {
    if (taxableIncome <= 0) return 0;
    var b = bracketFor(taxableIncome, R);
    return b.base + (taxableIncome - b.from) * b.rate;
  }

  function rebateFor(ageBand, R) {
    var total = R.rebates.primary;
    if (ageBand === "65" || ageBand === "75") total += R.rebates.secondary;
    if (ageBand === "75") total += R.rebates.tertiary;
    return total;
  }

  function medicalCreditFor(members, R) {
    if (members <= 0) return 0;
    var first = Math.min(members, 2) * R.medical.first_two_each;
    var rest = Math.max(members - 2, 0) * R.medical.each_additional;
    return (first + rest) * 12;
  }

  function calculate(input, R) {
    var gross = input.annualGross;

    /* Deductible portion of retirement contributions. The statutory test is
       27.5% of the GREATER of remuneration or taxable income; for a salaried
       taxpayer with no other income those are the same figure before the
       deduction, so remuneration is the right base here. */
    var allowedRetirement = Math.min(
      input.annualRetirement,
      gross * R.retirement.rate,
      R.retirement.annual_cap
    );

    var taxableIncome = Math.max(gross - allowedRetirement, 0);
    var beforeRebates = taxBeforeRebates(taxableIncome, R);
    var rebates = rebateFor(input.ageBand, R);
    var medical = medicalCreditFor(input.medicalMembers, R);

    /* Rebates and the medical credit are credits, not refunds: they can reduce
       the liability to nil but never below it. */
    var afterRebates = Math.max(beforeRebates - rebates, 0);
    var tax = Math.max(afterRebates - medical, 0);

    var uif = input.includeUif
      ? Math.min(input.monthlyGross, R.uif.monthlyCeiling) * R.uif.rate * 12
      : 0;

    var takeHome = gross - tax - uif - input.annualRetirement;

    return {
      gross: gross,
      allowedRetirement: allowedRetirement,
      retirementDisallowed: input.annualRetirement - allowedRetirement,
      taxableIncome: taxableIncome,
      beforeRebates: beforeRebates,
      rebates: Math.min(rebates, beforeRebates),
      medical: Math.min(medical, afterRebates),
      tax: tax,
      uif: uif,
      takeHome: takeHome,
      effectiveRate: gross > 0 ? tax / gross : 0,
      /* Marginal rate is the rate the NEXT rand earned would attract.
         `tax > 0` was the wrong test: someone whose liability is wiped out by
         the medical credit is still in a bracket — earn one rand more and it
         is taxed — but the page showed them "—". `beforeRebates > 0` is
         equally wrong in the other direction: below the threshold the rebate
         still absorbs that next rand, so there is genuinely no marginal rate
         to report. What both cases turn on is whether anything survives the
         rebates. */
      marginalRate: afterRebates > 0 ? bracketFor(taxableIncome, R).rate : 0,
      /* "Below the threshold" means the age rebates alone cover the tax — that
         is what the threshold IS. Someone pushed to nil by the medical credit
         is above the threshold and is still required to file, so telling them
         they fall below it is actively misleading. Separate flags, separate
         messages. */
      belowThreshold: afterRebates === 0,
      nilByMedical: afterRebates > 0 && tax === 0
    };
  }

  /* Tax charged slice by slice, so the result is explainable rather than a
     single number the visitor has to take on faith. */
  function bracketBreakdown(taxableIncome, R) {
    var rows = [];
    for (var i = 0; i < R.brackets.length; i++) {
      var b = R.brackets[i];
      if (taxableIncome <= b.from) break;
      var slice = Math.min(taxableIncome, b.to) - b.from;
      rows.push({
        band: money(b.from + 1, 0) + (b.to === Infinity ? " and above" : " – " + money(b.to, 0)),
        rate: percent(b.rate),
        amount: slice,
        tax: slice * b.rate
      });
    }
    return rows;
  }

  /* ---- Reading the form -------------------------------------------------- */

  function num(id) {
    var raw = (el(id).value || "").replace(/[\s,R]/g, "");
    var value = parseFloat(raw);
    return isFinite(value) && value > 0 ? value : 0;
  }

  function readInput() {
    var monthly = form.querySelector('input[name="period"]:checked').value === "monthly";
    var amount = num("tc-income");
    var retirement = num("tc-retirement");

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
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July",
                "August", "September", "October", "November", "December"];

  /* "2026-08-06" -> "6 August 2026", matching how the guides stamp their
     review dates. Parsed by hand rather than with Date, because `new
     Date("2026-08-06")` is UTC midnight and renders as the 5th for anyone
     west of Greenwich. */
  function prettyDate(iso) {
    var parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!parts) return iso || "";
    return Number(parts[3]) + " " + MONTHS[Number(parts[2]) - 1] + " " + parts[1];
  }

  function renderYearNote(R) {
    var note = el("tc-year-note");
    if (!note) return;
    var reviewed = R.meta.verified_on
      ? ", reviewed " + prettyDate(R.meta.verified_on)
      : "";
    note.textContent =
      "Using the " + R.meta.label + " figures (" + R.meta.period + ")" +
      reviewed + ".";
  }

  function render() {
    var R = ratesFor(selectedYear());
    renderYearNote(R);

    var input = readInput();

    if (input.annualGross <= 0) {
      el("tc-results").hidden = true;
      el("tc-empty").hidden = false;
      return;
    }

    el("tc-empty").hidden = true;
    el("tc-results").hidden = false;

    var r = calculate(input, R);

    setText("tc-out-tax-month", money(r.tax / 12));
    setText("tc-out-tax-year", money(r.tax));
    setText("tc-out-tax-year-2", money(r.tax));
    setText("tc-out-net-month", money(r.takeHome / 12));
    setText("tc-out-net-year", money(r.takeHome));

    setText("tc-out-gross", money(r.gross));
    setText("tc-out-taxable", money(r.taxableIncome));
    setText("tc-out-before", money(r.beforeRebates));
    setText("tc-out-rebates", "−" + money(r.rebates));
    setText("tc-out-medical", "−" + money(r.medical));
    setText("tc-out-uif", money(r.uif));
    setText("tc-out-effective", percent(r.effectiveRate));
    setText("tc-out-marginal", r.marginalRate > 0 ? percent(r.marginalRate) : "—");

    /* Retirement rows only earn their space when there is a contribution. */
    var retireRow = el("tc-row-retirement");
    if (retireRow) {
      retireRow.hidden = r.allowedRetirement <= 0;
      setText("tc-out-retirement", "−" + money(r.allowedRetirement));
    }
    var disallowed = el("tc-note-disallowed");
    if (disallowed) {
      disallowed.hidden = r.retirementDisallowed < 0.01;
      setText(
        "tc-out-disallowed",
        money(r.retirementDisallowed)
      );
    }

    var medicalRow = el("tc-row-medical");
    if (medicalRow) medicalRow.hidden = input.medicalMembers <= 0;

    var uifRow = el("tc-row-uif");
    if (uifRow) uifRow.hidden = !input.includeUif;

    /* Below-threshold message, and its counterpart for a nil result reached
       via the medical credit instead. */
    var note = el("tc-threshold-note");
    if (note) note.hidden = !r.belowThreshold;
    var medNote = el("tc-medical-nil-note");
    if (medNote) medNote.hidden = !r.nilByMedical;

    /* Bracket breakdown table. */
    var tbody = el("tc-brackets-body");
    if (tbody) {
      var rows = bracketBreakdown(r.taxableIncome, R);
      tbody.textContent = "";
      rows.forEach(function (row) {
        var tr = document.createElement("tr");
        [row.band, row.rate, money(row.amount, 0), money(row.tax)].forEach(function (cell) {
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

  /* The chosen year lives in the URL so a particular year can be linked to and
     shared — "/tools/income-tax-calculator?year=2025/26".

     Only the YEAR goes in the URL. The income, age and medical details
     deliberately do not, even though putting them there would make a whole
     result shareable: a URL carrying somebody's salary gets pasted into chats,
     kept in browser history and logged by every proxy in between. This page
     promises that nothing you type leaves your browser, and a query string is
     the one part of a page that does. */
  /* Years are keyed "2026/27" for display, but a slash in a query string
     percent-encodes to "%2F" and turns a link people are meant to share into
     "?year=2025%2F26". The URL uses a hyphen instead. */
  function yearToSlug(key) { return key.replace("/", "-"); }

  function slugToYear(slug) {
    var keys = Object.keys(DATA.years);
    for (var i = 0; i < keys.length; i++) {
      if (yearToSlug(keys[i]) === slug || keys[i] === slug) return keys[i];
    }
    return null;
  }

  function yearFromUrl() {
    var match = /[?&]year=([^&]+)/.exec(window.location.search);
    return match ? slugToYear(decodeURIComponent(match[1])) : null;
  }

  function syncUrlToYear() {
    if (!window.history || !window.history.replaceState) return;
    var picker = el("tc-year");
    if (!picker) return;
    /* replaceState, not pushState: flicking between years is adjusting one
       control, not navigating, and it should not take several Back presses to
       leave the page. */
    var url = window.location.pathname +
      (picker.value === DATA.current ? "" : "?year=" + yearToSlug(picker.value)) +
      window.location.hash;
    window.history.replaceState(null, "", url);
  }

  function update() {
    render();
    announce();
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
