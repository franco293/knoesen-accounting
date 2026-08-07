/* SARS penalty and interest estimator.
   Loaded only by /tools/sars-penalty-calculator (see pages.json → scripts),
   after js/tax-rates.js and js/sa-tax-core.js.

   Covers the two things that actually cost people money when they fall behind:

   1. ADMINISTRATIVE NON-COMPLIANCE PENALTY (s210/s211 Tax Administration Act)
      A fixed rand amount charged PER OUTSTANDING RETURN, for every month or
      part of a month it stays outstanding. The amount is set by the taxable
      income of the PRECEDING year — not the year the return relates to — and
      an assessed loss falls in the lowest band however large the loss is.
      It recurs for up to 35 months where SARS holds a current address.

      This is the one people underestimate, because it is not a percentage of
      anything. It accrues whether or not any tax is owed, and a nil return
      that is three years late still costs thousands.

   2. LATE PAYMENT PENALTY AND INTEREST
      10% of the unpaid amount, plus interest at the prescribed rate.

   The penalty table is transcribed from SAIPA's admin penalty guide, which
   reproduces the s211 table; its endpoints and the 35-month cap agree with
   what SARS itself publishes. Interest rates come from the tax year data.

   Modelling note on multiple outstanding returns
   ----------------------------------------------
   Returns do not all become overdue on the same day — annual returns fall due
   roughly twelve months apart. So rather than multiplying one figure by the
   number of returns, each return is aged separately from the oldest: the
   second is treated as twelve months younger than the first, the third
   twenty-four, and so on. That is both closer to reality and materially
   different from the naive product, which overstates badly. */
(function () {
  "use strict";

  var form = document.getElementById("penalty-calc");
  if (!form) return;

  var T = window.SATax;
  var el = function (id) { return document.getElementById(id); };

  var P = T && T.sarsPenalties ? T.sarsPenalties() : null;
  if (!T || !P) {
    var empty = el("pn-empty");
    if (empty) {
      empty.textContent =
        "The penalty tables could not be loaded, so this calculator cannot " +
        "run. Please reload the page, or call us and we will work out where " +
        "you stand.";
    }
    return;
  }

  var MONTHS_BETWEEN_RETURNS = 12;

  function selectedYear() {
    var picker = el("pn-year");
    return picker ? picker.value : T.currentYear();
  }

  function readInput() {
    var returns = parseInt(el("pn-returns").value, 10);
    var months = parseInt(el("pn-months").value, 10);
    return {
      assessedLoss: el("pn-assessed-loss").checked,
      precedingIncome: T.parseAmount(el("pn-income").value),
      returnsOutstanding: isFinite(returns) && returns > 0 ? Math.min(returns, 20) : 0,
      oldestMonths: isFinite(months) && months > 0 ? Math.min(months, 120) : 0,
      hasAddress: el("pn-address").checked,
      amountOwed: T.parseAmount(el("pn-owed").value),
      monthsLate: (function () {
        var m = parseInt(el("pn-owed-months").value, 10);
        return isFinite(m) && m > 0 ? Math.min(m, 120) : 0;
      })()
    };
  }

  function monthlyPenaltyFor(input) {
    /* An assessed loss sits in the lowest band whatever its size — the loss
       value has no effect on the scale at all. */
    if (input.assessedLoss) return P.assessed_loss_penalty;
    /* Inclusive bounds: the s211 table reads "R0 – R250 000", so R250 000
       itself is in that band and R250 001 starts the next. Unlike the CIPC fee
       table, which is worded "less than". */
    return T.bandFor(input.precedingIncome, P.admin_penalty_bands, true).penalty;
  }

  function calculate(input, R) {
    var monthly = monthlyPenaltyFor(input);
    var cap = input.hasAddress ? P.max_months_with_address
                               : P.max_months_without_address;

    /* Age each outstanding return separately from the oldest. */
    var rows = [];
    var adminTotal = 0;
    var anyCapped = false;
    for (var i = 0; i < input.returnsOutstanding; i++) {
      var age = input.oldestMonths - (i * MONTHS_BETWEEN_RETURNS);
      if (age <= 0) { age = 0; }
      var charged = Math.min(age, cap);
      if (age > cap) anyCapped = true;
      var amount = charged * monthly;
      adminTotal += amount;
      rows.push({ index: i + 1, months: age, charged: charged, amount: amount });
    }

    /* Late payment: a flat percentage of what was not paid, plus interest.
       SARS calculates interest on daily balances compounded monthly, so a
       monthly compounding is the right shape for an estimate — simple interest
       would understate it. */
    var rate = R && R.meta.sars_interest
      ? R.meta.sars_interest.late_or_underpayment
      : 0;
    var latePenalty = input.amountOwed * P.late_payment_penalty_rate;
    var interest = input.monthsLate > 0 && rate > 0
      ? input.amountOwed * (Math.pow(1 + rate / 12, input.monthsLate) - 1)
      : 0;

    return {
      monthly: monthly,
      cap: cap,
      rows: rows,
      adminTotal: adminTotal,
      anyCapped: anyCapped,
      latePenalty: latePenalty,
      interest: interest,
      interestRate: rate,
      lateTotal: latePenalty + interest,
      total: adminTotal + latePenalty + interest,
      hasAdmin: input.returnsOutstanding > 0 && input.oldestMonths > 0,
      hasLate: input.amountOwed > 0
    };
  }

  function setText(id, text) {
    var node = el(id);
    if (node) node.textContent = text;
  }

  function renderYearNote(R) {
    var note = el("pn-year-note");
    if (!note || !R) return;
    var rate = R.meta.sars_interest
      ? T.percent(R.meta.sars_interest.late_or_underpayment, 2) : "—";
    note.textContent =
      "Interest at the " + R.meta.label + " prescribed rate of " + rate +
      " a year on late or underpaid tax.";
  }

  function render() {
    var R = T.ratesFor(selectedYear());
    renderYearNote(R);

    var input = readInput();
    var r = calculate(input, R);

    if (!r.hasAdmin && !r.hasLate) {
      el("pn-results").hidden = true;
      el("pn-empty").hidden = false;
      return;
    }

    el("pn-empty").hidden = true;
    el("pn-results").hidden = false;

    setText("pn-out-total", T.money(r.total));
    setText("pn-out-monthly", T.money(r.monthly));

    /* Per-return breakdown, because "R18 000" with no working looks arbitrary
       and this is a number people need to believe. */
    var tbody = el("pn-admin-body");
    if (tbody) {
      tbody.textContent = "";
      r.rows.forEach(function (row) {
        var tr = document.createElement("tr");
        [
          "Return " + row.index + (row.index === 1 ? " (oldest)" : ""),
          row.months + (row.months === 1 ? " month" : " months"),
          row.charged + " charged",
          T.money(row.amount)
        ].forEach(function (cell, idx) {
          var node = document.createElement(idx === 0 ? "th" : "td");
          if (idx === 0) node.scope = "row";
          node.textContent = cell;
          tr.appendChild(node);
        });
        tbody.appendChild(tr);
      });
    }
    setText("pn-out-admin-total", T.money(r.adminTotal));

    var adminBlock = el("pn-admin-block");
    if (adminBlock) adminBlock.hidden = !r.hasAdmin;

    var cappedNote = el("pn-note-capped");
    if (cappedNote) cappedNote.hidden = !r.anyCapped;
    setText("pn-out-cap", String(r.cap));

    var lateBlock = el("pn-late-block");
    if (lateBlock) lateBlock.hidden = !r.hasLate;
    setText("pn-out-owed", T.money(input.amountOwed));
    setText("pn-out-late-penalty", T.money(r.latePenalty));
    setText("pn-out-interest", T.money(r.interest));
    setText("pn-out-late-total", T.money(r.lateTotal));
    /* Two decimals: this is the prescribed rate being quoted, not a
       derived figure. 10.25% must not render as 10.3%. */
    setText("pn-out-interest-rate", T.percent(r.interestRate, 2));

    var live = el("pn-live");
    if (live) {
      live.textContent = "Estimated SARS penalties and interest " +
        T.money(r.total) + ".";
    }
  }

  function yearFromUrl() {
    var match = /[?&]year=([^&]+)/.exec(window.location.search);
    return match ? T.slugToYear(decodeURIComponent(match[1])) : null;
  }

  function syncUrlToYear() {
    if (!window.history || !window.history.replaceState) return;
    var picker = el("pn-year");
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

  var yearPicker = el("pn-year");
  if (yearPicker) {
    var requested = yearFromUrl();
    if (requested && yearPicker.querySelector('option[value="' + requested + '"]')) {
      yearPicker.value = requested;
    }
    yearPicker.addEventListener("change", syncUrlToYear);
  }

  render();
})();
