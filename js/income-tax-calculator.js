/* South African income tax / PAYE calculator — 2026/27 tax year.
   Loaded only by /tools/income-tax-calculator (see pages.json → scripts).

   Every figure below is transcribed from National Treasury's Budget 2026 Tax
   Guide, covering 1 March 2026 – 28 February 2027, with one exception noted at
   UIF. The same numbers are published as visible tables on
   /resources/tax-rates-2026-2027 — if a new Budget changes them, BOTH have to
   move, or the calculator will quietly disagree with the page that documents
   it. The cumulative "base" amounts are load-bearing: each one is the tax due
   at the top of the previous bracket, so an error in one silently shifts every
   result above it rather than producing an obviously wrong answer. */
(function () {
  "use strict";

  var form = document.getElementById("tax-calc");
  if (!form) return;

  var BRACKETS = [
    { from: 0,       to: 245100,   base: 0,      rate: 0.18 },
    { from: 245100,  to: 383100,   base: 44118,  rate: 0.26 },
    { from: 383100,  to: 530200,   base: 79998,  rate: 0.31 },
    { from: 530200,  to: 695800,   base: 125599, rate: 0.36 },
    { from: 695800,  to: 887000,   base: 185215, rate: 0.39 },
    { from: 887000,  to: 1878600,  base: 259783, rate: 0.41 },
    { from: 1878600, to: Infinity, base: 666339, rate: 0.45 }
  ];

  /* Rebates are cumulative: a 76-year-old gets all three. */
  var REBATES = { primary: 17820, secondary: 9765, tertiary: 3249 };

  /* Medical scheme fees tax credit, per month. R376 for each of the first two
     people covered, R254 for every dependant after that. */
  var MEDICAL = { firstTwo: 376, additional: 254 };

  /* Retirement fund contributions: deductible up to 27.5% of the greater of
     remuneration or taxable income, and in any event no more than R430 000 a
     year. Raised from R350 000 — a figure a lot of calculators still use. */
  var RETIREMENT = { rate: 0.275, annualCap: 430000 };

  /* UIF is the one number NOT in the Budget guide, which says only "below a
     certain amount". The ceiling comes from SARS: R17 712 per month
     (R212 544 a year), unchanged since 1 June 2021. It is capped MONTHLY, so
     annualising the ceiling is only correct for steady pay — which is exactly
     what this calculator assumes. */
  var UIF = { rate: 0.01, monthlyCeiling: 17712 };

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
    var first = Math.min(members, 2) * MEDICAL.firstTwo;
    var rest = Math.max(members - 2, 0) * MEDICAL.additional;
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
      RETIREMENT.annualCap
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
      marginalRate: tax > 0 ? bracketFor(taxableIncome).rate : 0,
      belowThreshold: tax === 0
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
    setText("tc-out-marginal", r.tax > 0 ? percent(r.marginalRate) : "—");

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

    /* Below-threshold message. */
    var note = el("tc-threshold-note");
    if (note) note.hidden = !r.belowThreshold;

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
