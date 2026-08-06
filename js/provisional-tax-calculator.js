/* South African provisional tax (IRP6) estimator — individuals.
   Loaded only by /tools/provisional-tax-calculator (see pages.json → scripts),
   after js/tax-rates.js and js/sa-tax-core.js.

   The rules implemented here are taken from SARS's Guide for Provisional Tax
   (GEN-PT-01-G01), read directly, because getting them subtly wrong costs a
   real taxpayer a real penalty.

   FIRST PERIOD (due six months into the year of assessment)
       normal tax on estimated taxable income
       less rebates (s6), medical scheme fees credit (s6A), additional
            medical expenses credit (s6B)                      = total tax
       half of total tax
       less employees' tax deducted during the first six months
       less foreign tax credits proved by the end of the period
                                                    = FIRST PAYMENT

   Note the order: the halving happens AFTER the rebates and credits, not
   before. Halving the tax before rebates overstates the first payment for
   everyone, and a lot of spreadsheets do exactly that.

   SECOND PERIOD (due on the last day of the year of assessment)
       total tax as above
       less employees' tax for the whole year
       less the first payment, if it was actually paid
       less foreign tax credits for the year        = SECOND PAYMENT

   UNDER-ESTIMATION PENALTY (Fourth Schedule para 20) — 20%, and the test
   depends on where actual taxable income lands:

       R1m or below   bites only if the final estimate is below BOTH 90% of
                      actual AND the basic amount. Charged on the LESSER of
                      the tax on 90% of actual and the tax on the basic
                      amount, less employees' tax and provisional tax paid.

       above R1m      the basic amount gives no protection whatsoever. The
                      estimate must reach 80% of actual, and the penalty is
                      charged on the tax on 80% of actual less what was paid.

   That asymmetry is the single most misunderstood part of the regime: people
   who have always relied on the basic amount as a safe harbour lose it
   entirely the year they cross a million rand of taxable income. */
(function () {
  "use strict";

  var form = document.getElementById("prov-calc");
  if (!form) return;

  var T = window.SATax;
  var el = function (id) { return document.getElementById(id); };

  if (!T || !T.currentYear()) {
    var empty = el("pv-empty");
    if (empty) {
      empty.textContent =
        "The tax tables could not be loaded, so this calculator cannot run. " +
        "Please reload the page — or see the published rate tables at " +
        "/resources/tax-rates-2026-2027, or call us and we will work it out.";
    }
    return;
  }

  var PENALTY_RATE = 0.20;
  var PENALTY_INCOME_THRESHOLD = 1000000;
  var SAFE_HARBOUR_AT_OR_BELOW = 0.90;
  var SAFE_HARBOUR_ABOVE = 0.80;
  var BASIC_AMOUNT_ESCALATION = 0.08;

  function selectedYear() {
    var picker = el("pv-year");
    return picker ? picker.value : T.currentYear();
  }

  function readInput() {
    return {
      estimate: T.parseAmount(el("pv-estimate").value),
      ageBand: form.querySelector('input[name="pv-age"]:checked').value,
      medicalMembers: parseInt(el("pv-medical").value, 10) || 0,
      payeFirst: T.parseAmount(el("pv-paye-first").value),
      payeYear: T.parseAmount(el("pv-paye-year").value),
      basicAmount: T.parseAmount(el("pv-basic").value),
      escalateBasic: el("pv-basic-escalate").checked,
      actual: T.parseAmount(el("pv-actual").value)
    };
  }

  /* Total normal tax for the year on a given taxable income, after rebates and
     the medical scheme fees credit. The additional medical expenses credit
     (s6B) is part of the statutory formula but depends on out-of-pocket
     spending this calculator does not ask for, so it is left out and said so
     on the page rather than silently assumed to be nil. */
  function totalTaxOn(taxableIncome, input, R) {
    return T.annualTax({
      gross: taxableIncome,
      retirement: 0,
      ageBand: input.ageBand,
      medicalMembers: input.medicalMembers
    }, R).tax;
  }

  function calculate(input, R) {
    var totalTax = totalTaxOn(input.estimate, input, R);

    /* Halve AFTER rebates and credits — see the note at the top. */
    var first = Math.max(totalTax / 2 - input.payeFirst, 0);
    var second = Math.max(totalTax - input.payeYear - first, 0);

    var basic = input.basicAmount;
    if (basic > 0 && input.escalateBasic) {
      basic = basic * (1 + BASIC_AMOUNT_ESCALATION);
    }

    var result = {
      totalTax: totalTax,
      first: first,
      second: second,
      totalPayable: first + second,
      basicAmount: basic,
      /* An estimate below the basic amount is not automatically penalised, but
         SARS may require it to be justified and may replace it with a higher
         figure that cannot be objected to. Worth flagging, not alarming. */
      belowBasic: basic > 0 && input.estimate < basic,
      penalty: null
    };

    if (input.actual > 0) {
      result.penalty = penaltyFor(input, basic, first, second, R);
    }
    return result;
  }

  /* Under-estimation penalty on the SECOND period estimate.

     Para 20 measures the shortfall against "employees' tax and provisional tax
     paid by the end of that year of assessment" — which is BOTH provisional
     payments, the second being due on the last day of the year, not just the
     first. With both paid in full that sum comes to the tax on the estimate,
     so the penalty lands where the legislation intends: 20% of the tax that
     should have been declared less the tax that was. */
  function penaltyFor(input, basic, first, second, R) {
    var actual = input.actual;
    var paid = input.payeYear + first + second;

    var aboveThreshold = actual > PENALTY_INCOME_THRESHOLD;
    var required, exposed, triggered;

    if (aboveThreshold) {
      /* The basic amount is no protection at all up here. */
      required = actual * SAFE_HARBOUR_ABOVE;
      triggered = input.estimate < required;
      exposed = totalTaxOn(required, input, R);
    } else {
      required = actual * SAFE_HARBOUR_AT_OR_BELOW;
      /* Penalised only if the estimate falls short of BOTH tests. */
      triggered = input.estimate < required && (basic <= 0 || input.estimate < basic);
      var taxOn90 = totalTaxOn(required, input, R);
      /* Charged on the LESSER of the two — the basic amount can cap the
         exposure even once the penalty has been triggered. */
      exposed = basic > 0 ? Math.min(taxOn90, totalTaxOn(basic, input, R)) : taxOn90;
    }

    var shortfall = Math.max(exposed - paid, 0);
    return {
      aboveThreshold: aboveThreshold,
      requiredEstimate: required,
      triggered: triggered,
      amount: triggered ? shortfall * PENALTY_RATE : 0,
      paid: paid,
      exposed: exposed,
      /* What the estimate needed to be to stay clear. Below R1m the basic
         amount is an alternative route to safety, so the safe figure is the
         lower of the two. */
      safeEstimate: aboveThreshold
        ? required
        : (basic > 0 ? Math.min(required, basic) : required)
    };
  }

  function setText(id, text) {
    var node = el(id);
    if (node) node.textContent = text;
  }

  function renderYearNote(R) {
    var note = el("pv-year-note");
    if (!note) return;
    var p = R.meta.provisional;
    var dates = p
      ? " First payment due " + T.prettyDate(p.first_period_due) +
        ", second " + T.prettyDate(p.second_period_due) +
        ", optional top-up " + T.prettyDate(p.third_period_due) + "."
      : "";
    note.textContent =
      "Using the " + R.meta.label + " figures (" + R.meta.period + ")." + dates;
  }

  function render() {
    var R = T.ratesFor(selectedYear());
    renderYearNote(R);

    var input = readInput();

    if (input.estimate <= 0) {
      el("pv-results").hidden = true;
      el("pv-empty").hidden = false;
      return;
    }

    el("pv-empty").hidden = true;
    el("pv-results").hidden = false;

    var r = calculate(input, R);

    setText("pv-out-first", T.money(r.first));
    setText("pv-out-second", T.money(r.second));
    setText("pv-out-total-tax", T.money(r.totalTax));
    setText("pv-out-half", T.money(r.totalTax / 2));
    setText("pv-out-paye-first", "−" + T.money(input.payeFirst));
    setText("pv-out-first-2", T.money(r.first));
    setText("pv-out-total-tax-2", T.money(r.totalTax));
    setText("pv-out-paye-year", "−" + T.money(input.payeYear));
    setText("pv-out-first-paid", "−" + T.money(r.first));
    setText("pv-out-second-2", T.money(r.second));

    var p = R.meta.provisional;
    setText("pv-out-first-due", p ? T.prettyDate(p.first_period_due) : "—");
    setText("pv-out-second-due", p ? T.prettyDate(p.second_period_due) : "—");
    setText("pv-out-third-due", p ? T.prettyDate(p.third_period_due) : "—");

    /* Basic amount comparison. */
    var basicBlock = el("pv-basic-block");
    if (basicBlock) basicBlock.hidden = r.basicAmount <= 0;
    setText("pv-out-basic", T.money(r.basicAmount));
    var belowNote = el("pv-note-below-basic");
    if (belowNote) belowNote.hidden = !r.belowBasic;

    /* Penalty exposure. */
    var penBlock = el("pv-penalty-block");
    if (penBlock) penBlock.hidden = !r.penalty;
    if (r.penalty) {
      setText("pv-out-required", T.money(r.penalty.requiredEstimate));
      setText("pv-out-safe", T.money(r.penalty.safeEstimate));
      setText("pv-out-penalty", T.money(r.penalty.amount));
      var pct = r.penalty.aboveThreshold ? "80%" : "90%";
      setText("pv-out-safe-pct", pct);
      var triggered = el("pv-penalty-triggered");
      if (triggered) triggered.hidden = !r.penalty.triggered;
      var clear = el("pv-penalty-clear");
      if (clear) clear.hidden = r.penalty.triggered;
      var aboveNote = el("pv-note-above-1m");
      if (aboveNote) aboveNote.hidden = !r.penalty.aboveThreshold;
    }

    var live = el("pv-live");
    if (live) {
      live.textContent =
        "First provisional payment " + T.money(r.first) +
        ", second provisional payment " + T.money(r.second) + ".";
    }
  }

  function yearFromUrl() {
    var match = /[?&]year=([^&]+)/.exec(window.location.search);
    return match ? T.slugToYear(decodeURIComponent(match[1])) : null;
  }

  function syncUrlToYear() {
    if (!window.history || !window.history.replaceState) return;
    var picker = el("pv-year");
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

  var yearPicker = el("pv-year");
  if (yearPicker) {
    var requested = yearFromUrl();
    if (requested) yearPicker.value = requested;
    yearPicker.addEventListener("change", syncUrlToYear);
  }

  render();
})();
