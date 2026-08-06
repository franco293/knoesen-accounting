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

  var YEAR = DATA.years[DATA.current];
  var IND = YEAR.individual;

  /* `to: null` marks the top bracket in the data, because JSON has no
     Infinity. The arithmetic below compares against it, so convert once. */
  var BRACKETS = IND.brackets.map(function (b) {
    return {
      from: b.from,
      to: b.to === null ? Infinity : b.to,
      base: b.base,
      rate: b.rate
    };
  });

  /* Rebates are cumulative: a 76-year-old gets all three. */
  var REBATES = IND.rebates;

  /* Medical scheme fees tax credit, per month: one amount for each of the
     first two people covered, a lower one for every dependant after that. */
  var MEDICAL = IND.medical_credit;

  /* Retirement fund contributions: deductible up to a percentage of the
     greater of remuneration or taxable income, and never more than the annual
     cap. */
  var RETIREMENT = IND.retirement;

  /* UIF is the one figure NOT in the Budget guide, which says only "below a
     certain amount" — the ceiling comes from SARS. It is capped MONTHLY, so
     annualising the ceiling is only correct for steady pay, which is exactly
     what this calculator assumes. */
  var UIF = {
    rate: YEAR.payroll.uif_employee_rate,
    monthlyCeiling: YEAR.payroll.uif_monthly_ceiling
  };

  var el = function (id) { return document.getElementById(id); };

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

  function bracketFor(taxableIncome) {
    for (var i = 0; i < BRACKETS.length; i++) {
      if (taxableIncome <= BRACKETS[i].to) return BRACKETS[i];
    }
    return BRACKETS[BRACKETS.length - 1];
  }

  function taxBeforeRebates(taxableIncome) {
    if (taxableIncome <= 0) return 0;
    var b = bracketFor(taxableIncome);
    return b.base + (taxableIncome - b.from) * b.rate;
  }

  function rebateFor(ageBand) {
    var total = REBATES.primary;
    if (ageBand === "65" || ageBand === "75") total += REBATES.secondary;
    if (ageBand === "75") total += REBATES.tertiary;
    return total;
  }

  function medicalCreditFor(members) {
    if (members <= 0) return 0;
    var first = Math.min(members, 2) * MEDICAL.first_two_each;
    var rest = Math.max(members - 2, 0) * MEDICAL.each_additional;
    return (first + rest) * 12;
  }

  function calculate(input) {
    var gross = input.annualGross;

    /* Deductible portion of retirement contributions. The statutory test is
       27.5% of the GREATER of remuneration or taxable income; for a salaried
       taxpayer with no other income those are the same figure before the
       deduction, so remuneration is the right base here. */
    var allowedRetirement = Math.min(
      input.annualRetirement,
      gross * RETIREMENT.rate,
      RETIREMENT.annual_cap
    );

    var taxableIncome = Math.max(gross - allowedRetirement, 0);
    var beforeRebates = taxBeforeRebates(taxableIncome);
    var rebates = rebateFor(input.ageBand);
    var medical = medicalCreditFor(input.medicalMembers);

    /* Rebates and the medical credit are credits, not refunds: they can reduce
       the liability to nil but never below it. */
    var afterRebates = Math.max(beforeRebates - rebates, 0);
    var tax = Math.max(afterRebates - medical, 0);

    var uif = input.includeUif
      ? Math.min(input.monthlyGross, UIF.monthlyCeiling) * UIF.rate * 12
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
      marginalRate: afterRebates > 0 ? bracketFor(taxableIncome).rate : 0,
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
  function bracketBreakdown(taxableIncome) {
    var rows = [];
    for (var i = 0; i < BRACKETS.length; i++) {
      var b = BRACKETS[i];
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

  function render() {
    var input = readInput();

    if (input.annualGross <= 0) {
      el("tc-results").hidden = true;
      el("tc-empty").hidden = false;
      return;
    }

    el("tc-empty").hidden = true;
    el("tc-results").hidden = false;

    var r = calculate(input);

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
      var rows = bracketBreakdown(r.taxableIncome);
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

  /* Nothing is prefilled, so the first paint shows the empty state. */
  render();
})();
