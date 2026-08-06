/* South African small business tax comparator.
   Loaded only by /tools/small-business-tax-calculator (see pages.json →
   scripts), after js/tax-rates.js and js/sa-tax-core.js.

   Compares the four ways the same business can be taxed:

     Standard company tax   a flat rate on taxable income
     Small Business Corp    a graduated table starting at 0%, s12E
     Turnover tax           on TURNOVER, not profit — Sixth Schedule
     Sole proprietor        profit added to personal income, individual tables

   The important asymmetry is that turnover tax is charged on revenue while
   everything else is charged on profit, so the comparison needs both figures.
   A high-margin consultancy and a thin-margin retailer on identical turnover
   land in completely different places, and that is the whole point of the page.

   What this deliberately does NOT do
   ----------------------------------
   It does not tell you whether you qualify as a Small Business Corporation.
   Section 12E has six tests and only one of them — the R20 million gross
   income ceiling — is visible in the numbers on this form. The others turn on
   who the shareholders are, whether any of them holds an interest in another
   company, the mix of investment and personal-service income, the entity type,
   and whether the company is a personal service provider. A calculator that
   inferred SBC status from turnover and profit would be confidently wrong for
   exactly the businesses that most need to know, so the qualifying conditions
   are presented as a checklist for the reader to answer instead.

   Turnover tax is different: its qualifying test IS a single checkable number,
   so that one is applied automatically. */
(function () {
  "use strict";

  var form = document.getElementById("sbt-calc");
  if (!form) return;

  var T = window.SATax;
  var el = function (id) { return document.getElementById(id); };

  if (!T || !T.currentYear()) {
    var empty = el("sb-empty");
    if (empty) {
      empty.textContent =
        "The tax tables could not be loaded, so this calculator cannot run. " +
        "Please reload the page — or see the published rate tables at " +
        "/resources/tax-rates-2026-2027, or call us and we will work it out.";
    }
    return;
  }

  function selectedYear() {
    var picker = el("sb-year");
    return picker ? picker.value : T.currentYear();
  }

  /* Walk a cumulative bracket table. Shared in shape with the individual
     tables, but SBC and turnover tax have their own, so this takes the
     brackets rather than assuming which set. */
  function taxFromBrackets(amount, brackets) {
    if (amount <= 0) return 0;
    for (var i = 0; i < brackets.length; i++) {
      var b = brackets[i];
      var top = b.to === null ? Infinity : b.to;
      if (amount <= top) return b.base + (amount - b.from) * b.rate;
    }
    var last = brackets[brackets.length - 1];
    return last.base + (amount - last.from) * last.rate;
  }

  function readInput() {
    return {
      turnover: T.parseAmount(el("sb-turnover").value),
      profit: T.parseAmount(el("sb-profit").value),
      sbcEligible: el("sb-sbc-eligible").checked,
      distribute: el("sb-distribute").checked
    };
  }

  function calculate(input, R) {
    var co = R.company;
    var year = R.meta;

    var standard = input.profit * co.rate;
    var sbc = taxFromBrackets(input.profit, co.sbc_brackets);
    var turnover = taxFromBrackets(input.turnover, co.turnover_brackets);

    /* Sole proprietor: business profit is simply added to personal income and
       taxed on the individual tables. Assumed to be the person's only income,
       under 65, with the primary rebate and no medical credit — stated on the
       page, because any other income changes it. */
    var sole = T.annualTax({
      gross: input.profit,
      retirement: 0,
      ageBand: "under65",
      medicalMembers: 0
    }, R).tax;

    var turnoverQualifies = co.turnover_qualifying_limit
      ? input.turnover <= co.turnover_qualifying_limit
      : true;
    var sbcOverGrossLimit = co.sbc_gross_income_limit
      ? input.turnover > co.sbc_gross_income_limit
      : false;

    /* Money in a company is not money in your pocket. Taking the after-tax
       profit out as a dividend costs dividends tax on top, which is what makes
       an apparently cheap company rate close the gap on a sole proprietor. */
    var dividendRate = year.dividends_tax_rate || 0;
    function withDistribution(companyTax) {
      if (!input.distribute) return companyTax;
      return companyTax + (input.profit - companyTax) * dividendRate;
    }

    var options = [
      {
        key: "standard",
        name: "Standard company tax",
        basis: "profit",
        tax: withDistribution(standard),
        taxBeforeDividend: standard,
        available: true,
        note: T.percent(co.rate) + " of taxable income"
      },
      {
        key: "sbc",
        name: "Small Business Corporation",
        basis: "profit",
        tax: withDistribution(sbc),
        taxBeforeDividend: sbc,
        available: input.sbcEligible && !sbcOverGrossLimit,
        note: "graduated s12E table from 0%"
      },
      {
        key: "turnover",
        name: "Turnover tax",
        basis: "turnover",
        tax: turnover,
        taxBeforeDividend: turnover,
        /* Turnover tax replaces income tax, VAT, provisional tax, CGT AND
           dividends tax, so there is no second layer to add. */
        available: turnoverQualifies,
        note: "on turnover, replaces income tax, VAT, CGT and dividends tax"
      },
      {
        key: "sole",
        name: "Sole proprietor",
        basis: "profit",
        tax: sole,
        taxBeforeDividend: sole,
        available: true,
        note: "individual tables, profit already in your hands"
      }
    ];

    var eligible = options.filter(function (o) { return o.available; });
    var cheapest = eligible.reduce(function (best, o) {
      return best === null || o.tax < best.tax ? o : best;
    }, null);

    return {
      options: options,
      cheapest: cheapest,
      turnoverQualifies: turnoverQualifies,
      turnoverLimit: co.turnover_qualifying_limit,
      sbcOverGrossLimit: sbcOverGrossLimit,
      sbcGrossLimit: co.sbc_gross_income_limit,
      dividendRate: dividendRate,
      margin: input.turnover > 0 ? input.profit / input.turnover : null,
      /* Turnover tax is charged whether or not the business made a profit.
         That is the trap the guide describes, and it is worth surfacing the
         moment the numbers show it. */
      turnoverTaxOnALoss: input.profit <= 0 && turnover > 0
    };
  }

  function setText(id, text) {
    var node = el(id);
    if (node) node.textContent = text;
  }

  function renderYearNote(R) {
    var note = el("sb-year-note");
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

    if (input.turnover <= 0) {
      el("sb-results").hidden = true;
      el("sb-empty").hidden = false;
      return;
    }

    el("sb-empty").hidden = true;
    el("sb-results").hidden = false;

    var r = calculate(input, R);

    /* Comparison table, built rather than hand-written so a regime can never
       be shown with another regime's figure. */
    var tbody = el("sb-compare-body");
    tbody.textContent = "";
    r.options.forEach(function (o) {
      var tr = document.createElement("tr");
      if (r.cheapest && o.key === r.cheapest.key) tr.className = "calc-table-total";
      if (!o.available) tr.className = "is-unavailable";

      var th = document.createElement("th");
      th.scope = "row";
      th.textContent = o.name;
      tr.appendChild(th);

      var basis = document.createElement("td");
      basis.textContent = o.note;
      tr.appendChild(basis);

      var amount = document.createElement("td");
      amount.textContent = o.available ? T.money(o.tax) : "Not available";
      tr.appendChild(amount);

      var rate = document.createElement("td");
      rate.textContent = o.available && input.profit > 0
        ? T.percent(o.tax / input.profit)
        : "—";
      tr.appendChild(rate);

      tbody.appendChild(tr);
    });

    if (r.cheapest) {
      setText("sb-out-best", r.cheapest.name);
      setText("sb-out-best-tax", T.money(r.cheapest.tax));
      var others = r.options.filter(function (o) {
        return o.available && o.key !== r.cheapest.key;
      });
      var worst = others.reduce(function (m, o) { return o.tax > m ? o.tax : m; }, 0);
      setText("sb-out-spread", T.money(Math.max(worst - r.cheapest.tax, 0)));
    }

    setText("sb-out-margin", r.margin === null ? "—" : T.percent(r.margin));

    var turnoverNote = el("sb-note-turnover-limit");
    if (turnoverNote) turnoverNote.hidden = r.turnoverQualifies;
    setText("sb-out-turnover-limit", T.money(r.turnoverLimit, 0));

    var sbcLimitNote = el("sb-note-sbc-limit");
    if (sbcLimitNote) sbcLimitNote.hidden = !r.sbcOverGrossLimit;
    setText("sb-out-sbc-limit", T.money(r.sbcGrossLimit, 0));

    var sbcUncheckedNote = el("sb-note-sbc-unchecked");
    if (sbcUncheckedNote) {
      sbcUncheckedNote.hidden = input.sbcEligible || r.sbcOverGrossLimit;
    }

    var lossNote = el("sb-note-loss");
    if (lossNote) lossNote.hidden = !r.turnoverTaxOnALoss;

    var divNote = el("sb-note-dividend");
    if (divNote) divNote.hidden = !input.distribute;
    setText("sb-out-dividend-rate", T.percent(r.dividendRate));

    var live = el("sb-live");
    if (live && r.cheapest) {
      live.textContent =
        "Cheapest option: " + r.cheapest.name + " at " + T.money(r.cheapest.tax) + ".";
    }
  }

  function yearFromUrl() {
    var match = /[?&]year=([^&]+)/.exec(window.location.search);
    return match ? T.slugToYear(decodeURIComponent(match[1])) : null;
  }

  function syncUrlToYear() {
    if (!window.history || !window.history.replaceState) return;
    var picker = el("sb-year");
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

  var yearPicker = el("sb-year");
  if (yearPicker) {
    var requested = yearFromUrl();
    /* Only honour a year the picker actually offers — past years may carry no
       company rates at all. */
    if (requested && yearPicker.querySelector('option[value="' + requested + '"]')) {
      yearPicker.value = requested;
    }
    yearPicker.addEventListener("change", syncUrlToYear);
  }

  render();
})();
