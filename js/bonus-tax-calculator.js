/* South African bonus / 13th cheque tax calculator.
   Loaded only by /tools/bonus-tax-calculator (see pages.json → scripts),
   after js/tax-rates.js and js/sa-tax-core.js.

   How a bonus is actually taxed
   -----------------------------
   There is no "bonus tax rate", and the widely-repeated idea that bonuses are
   taxed at a flat penalty rate is wrong. A bonus is remuneration: it is added
   to the year's income and taxed at whatever rate that pushes it into. So the
   tax ON the bonus is simply

       tax(salary + bonus) − tax(salary)

   which is what this works out. Doing it that way rather than applying a
   marginal rate to the bonus is not pedantry — a bonus that straddles a
   bracket boundary is taxed partly at one rate and partly at the next, and a
   flat marginal rate would overstate the tax for exactly the people most
   likely to check.

   Every figure comes from data/tax-rates.json; every bracket, rebate and
   credit is applied by the shared core in js/sa-tax-core.js. */
(function () {
  "use strict";

  var form = document.getElementById("bonus-calc");
  if (!form) return;

  var T = window.SATax;
  var el = function (id) { return document.getElementById(id); };

  if (!T || !T.currentYear()) {
    var empty = el("bc-empty");
    if (empty) {
      empty.textContent =
        "The tax tables could not be loaded, so this calculator cannot run. " +
        "Please reload the page — or see the published rate tables at " +
        "/resources/tax-rates-2026-2027, or call us and we will work it out.";
    }
    return;
  }

  function selectedYear() {
    var picker = el("bc-year");
    return picker ? picker.value : T.currentYear();
  }

  function readInput() {
    var monthly = form.querySelector('input[name="bc-period"]:checked').value === "monthly";
    var salary = T.parseAmount(el("bc-salary").value);
    var retirement = T.parseAmount(el("bc-retirement").value);

    return {
      monthlySalary: monthly ? salary : salary / 12,
      annualSalary: monthly ? salary * 12 : salary,
      annualRetirement: monthly ? retirement * 12 : retirement,
      bonus: T.parseAmount(el("bc-bonus").value),
      ageBand: form.querySelector('input[name="bc-age"]:checked').value,
      medicalMembers: parseInt(el("bc-medical").value, 10) || 0,
      includeUif: el("bc-uif").checked
    };
  }

  /* Extra UIF the bonus attracts.

     UIF is 1% of remuneration but capped on MONTHLY remuneration, so a bonus
     only attracts UIF to the extent the month it is paid in is still under the
     ceiling. Anyone earning at or above the ceiling — currently R17 712 a
     month — pays no UIF on a bonus at all. Calculators that take a flat 1% of
     the bonus overstate the deduction for most people who receive one. */
  function uifOnBonus(input, R) {
    if (!input.includeUif) return 0;
    var ceiling = R.uif.monthlyCeiling;
    var withBonus = Math.min(input.monthlySalary + input.bonus, ceiling);
    var without = Math.min(input.monthlySalary, ceiling);
    return Math.max(withBonus - without, 0) * R.uif.rate;
  }

  /* The rest of this site's JavaScript is deliberately ES5 — no arrow
     functions, no Object.assign — so it runs anywhere without a build step or
     a polyfill. Keeping to that here rather than reaching for a spread. */
  function withGross(input, gross) {
    return {
      gross: gross,
      retirement: input.annualRetirement,
      ageBand: input.ageBand,
      medicalMembers: input.medicalMembers
    };
  }

  function calculate(input, R) {
    var without = T.annualTax(withGross(input, input.annualSalary), R);
    var with_ = T.annualTax(
      withGross(input, input.annualSalary + input.bonus), R);

    var taxOnBonus = with_.tax - without.tax;
    var uif = uifOnBonus(input, R);
    var net = input.bonus - taxOnBonus - uif;

    return {
      bonus: input.bonus,
      taxWithout: without.tax,
      taxWith: with_.tax,
      taxOnBonus: taxOnBonus,
      uif: uif,
      net: net,
      effectiveOnBonus: input.bonus > 0 ? taxOnBonus / input.bonus : 0,
      marginalRate: with_.marginalRate,
      /* A bonus can lift someone over the tax threshold who was under it all
         year. Worth saying plainly, because it surprises people. */
      liftedOverThreshold: without.belowThreshold && !with_.belowThreshold,
      /* And it can straddle a bracket, which is the case the "flat marginal
         rate" shortcut gets wrong. */
      straddlesBracket: without.marginalRate > 0 &&
                        with_.marginalRate > without.marginalRate
    };
  }

  function setText(id, text) {
    var node = el(id);
    if (node) node.textContent = text;
  }

  function renderYearNote(R) {
    var note = el("bc-year-note");
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

    if (input.bonus <= 0 || input.annualSalary <= 0) {
      el("bc-results").hidden = true;
      el("bc-empty").hidden = false;
      return;
    }

    el("bc-empty").hidden = true;
    el("bc-results").hidden = false;

    var r = calculate(input, R);

    setText("bc-out-net", T.money(r.net));
    setText("bc-out-tax", T.money(r.taxOnBonus));
    setText("bc-out-bonus", T.money(r.bonus));
    setText("bc-out-tax-2", "−" + T.money(r.taxOnBonus));
    setText("bc-out-uif", "−" + T.money(r.uif));
    setText("bc-out-net-2", T.money(r.net));
    setText("bc-out-effective", T.percent(r.effectiveOnBonus));
    setText("bc-out-marginal", r.marginalRate > 0 ? T.percent(r.marginalRate) : "—");
    setText("bc-out-tax-without", T.money(r.taxWithout));
    setText("bc-out-tax-with", T.money(r.taxWith));
    setText("bc-out-tax-diff", T.money(r.taxOnBonus));

    var uifRow = el("bc-row-uif");
    if (uifRow) uifRow.hidden = r.uif < 0.005;

    var lifted = el("bc-note-threshold");
    if (lifted) lifted.hidden = !r.liftedOverThreshold;

    var straddle = el("bc-note-straddle");
    if (straddle) straddle.hidden = !r.straddlesBracket;

    var live = el("bc-live");
    if (live) {
      live.textContent =
        "Tax on the bonus " + T.money(r.taxOnBonus) +
        ", leaving " + T.money(r.net) + ".";
    }
  }

  function yearFromUrl() {
    var match = /[?&]year=([^&]+)/.exec(window.location.search);
    return match ? T.slugToYear(decodeURIComponent(match[1])) : null;
  }

  function syncUrlToYear() {
    if (!window.history || !window.history.replaceState) return;
    var picker = el("bc-year");
    if (!picker) return;
    var url = window.location.pathname +
      (picker.value === T.currentYear() ? "" : "?year=" + T.yearToSlug(picker.value)) +
      window.location.hash;
    window.history.replaceState(null, "", url);
  }

  form.addEventListener("input", render);
  form.addEventListener("change", render);
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    render();
  });

  var yearPicker = el("bc-year");
  if (yearPicker) {
    var requested = yearFromUrl();
    if (requested) yearPicker.value = requested;
    yearPicker.addEventListener("change", syncUrlToYear);
  }

  render();
})();
