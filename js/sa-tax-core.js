/* Shared South African tax arithmetic and helpers.
   Loaded before any calculator that needs it (see pages.json → scripts),
   after js/tax-rates.js, which supplies the figures.

   Why this exists
   ---------------
   The income tax calculator, the bonus calculator and the net-to-gross
   calculator are the same engine asked three different questions. Copying the
   bracket walk, the rebate ladder and the medical credit into each one would
   recreate — one layer up — exactly the drift that data/tax-rates.json was
   built to eliminate: three implementations, one of them subtly wrong after
   the next Budget, and nothing to catch it.

   Nothing here reads the DOM or knows about any particular page. It takes
   numbers and returns numbers, so it can be reasoned about and tested on its
   own. Anything page-specific belongs in that page's own script.

   Everything hangs off `window.SATax`. */
(function () {
  "use strict";

  var DATA = window.SA_TAX_RATES;

  /* ---- Tax year resolution ----------------------------------------------- */

  /* Resolve one year's figures into the shape the arithmetic below wants.
     Called per calculation rather than once, because a page may let the
     visitor switch years — and between 2025/26 and 2026/27 the brackets are
     identical while the rebates, medical credits and retirement cap all moved,
     so using the wrong year's rebates looks right and is wrong. */
  function ratesFor(yearKey) {
    if (!DATA) return null;
    var key = DATA.years[yearKey] ? yearKey : DATA.current;
    var year = DATA.years[key];
    var ind = year.individual;
    return {
      key: key,
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
      /* Cumulative: a 76-year-old gets all three. */
      rebates: ind.rebates,
      /* Per month: one amount for each of the first two people covered, a
         lower one for every dependant after that. */
      medical: ind.medical_credit,
      retirement: ind.retirement,
      /* UIF is the one figure NOT in the Budget guide, which says only "below
         a certain amount" — the ceiling comes from SARS. It is capped MONTHLY,
         so annualising it is only correct for steady pay. */
      uif: {
        rate: year.payroll.uif_employee_rate,
        monthlyCeiling: year.payroll.uif_monthly_ceiling
      },
      company: year.company || null,
      vat: year.vat || null
    };
  }

  function years() {
    return DATA ? Object.keys(DATA.years) : [];
  }

  /* Statutory fees that are not tax and do not move with the tax year. */
  function cipc() {
    return DATA ? (DATA.cipc || null) : null;
  }

  /* Pick the band a value falls into, for any table of {from, to} bands where
     `to: null` means open-ended. Used by the CIPC fee tables, which are flat
     amounts per band rather than the cumulative brackets tax uses. */
  function bandFor(value, bands) {
    for (var i = 0; i < bands.length; i++) {
      var top = bands[i].to === null ? Infinity : bands[i].to;
      if (value < top) return bands[i];
    }
    return bands[bands.length - 1];
  }

  function currentYear() {
    return DATA ? DATA.current : null;
  }

  /* Years are keyed "2026/27" for display, but a slash percent-encodes to
     "%2F" and turns a link meant to be shared into something unreadable. */
  function yearToSlug(key) { return key.replace("/", "-"); }

  function slugToYear(slug) {
    var keys = years();
    for (var i = 0; i < keys.length; i++) {
      if (yearToSlug(keys[i]) === slug || keys[i] === slug) return keys[i];
    }
    return null;
  }

  /* ---- Formatting --------------------------------------------------------
     Space-separated thousands, matching how SARS and the rate tables on this
     site set numbers. */
  function money(value, decimals) {
    var negative = value < 0;
    var fixed = Math.abs(value).toFixed(decimals === undefined ? 2 : decimals);
    var parts = fixed.split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return (negative ? "−R" : "R") + parts.join(".");
  }

  function percent(value) {
    return (value * 100).toFixed(1).replace(/\.0$/, "") + "%";
  }

  var MONTHS = ["January", "February", "March", "April", "May", "June", "July",
                "August", "September", "October", "November", "December"];

  /* "2026-08-06" -> "6 August 2026". Parsed by hand rather than with Date,
     because `new Date("2026-08-06")` is UTC midnight and renders as the 5th
     for anyone west of Greenwich. */
  function prettyDate(iso) {
    var parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!parts) return iso || "";
    return Number(parts[3]) + " " + MONTHS[Number(parts[2]) - 1] + " " + parts[1];
  }

  /* Tolerant of what people actually type: "R45 000", "45,000", " 45000 ". */
  function parseAmount(raw) {
    var value = parseFloat(String(raw == null ? "" : raw).replace(/[\s,R]/g, ""));
    return isFinite(value) && value > 0 ? value : 0;
  }

  /* ---- The arithmetic ----------------------------------------------------- */

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

  /* Annual value of the medical scheme fees tax credit. */
  function medicalCreditFor(members, R) {
    if (members <= 0) return 0;
    var first = Math.min(members, 2) * R.medical.first_two_each;
    var rest = Math.max(members - 2, 0) * R.medical.each_additional;
    return (first + rest) * 12;
  }

  /* Deductible portion of retirement contributions. The statutory test is a
     percentage of the GREATER of remuneration or taxable income; for a
     salaried taxpayer with no other income those are the same figure before
     the deduction, so remuneration is the right base. */
  function allowedRetirement(contribution, remuneration, R) {
    return Math.min(contribution, remuneration * R.retirement.rate,
                    R.retirement.annual_cap);
  }

  /* Annual income tax for a salaried taxpayer.

     `input` takes annual figures: { gross, retirement, ageBand,
     medicalMembers }. Returns every intermediate value, because a calculator
     that shows only the answer asks to be taken on faith. */
  function annualTax(input, R) {
    var gross = input.gross || 0;
    var allowed = allowedRetirement(input.retirement || 0, gross, R);
    var taxableIncome = Math.max(gross - allowed, 0);
    var beforeRebates = taxBeforeRebates(taxableIncome, R);
    var rebates = rebateFor(input.ageBand, R);
    var medical = medicalCreditFor(input.medicalMembers || 0, R);

    /* Rebates and the medical credit are credits, not refunds: they reduce the
       liability to nil but never below it. */
    var afterRebates = Math.max(beforeRebates - rebates, 0);
    var tax = Math.max(afterRebates - medical, 0);

    return {
      gross: gross,
      allowedRetirement: allowed,
      retirementDisallowed: (input.retirement || 0) - allowed,
      taxableIncome: taxableIncome,
      beforeRebates: beforeRebates,
      rebatesApplied: Math.min(rebates, beforeRebates),
      medicalApplied: Math.min(medical, afterRebates),
      afterRebates: afterRebates,
      tax: tax,
      effectiveRate: gross > 0 ? tax / gross : 0,
      /* The rate the NEXT rand earned would attract. Not `tax > 0`: someone
         whose liability is wiped out by the medical credit is still in a
         bracket. Not `beforeRebates > 0` either: below the threshold the
         rebate absorbs that next rand. What both turn on is whether anything
         survives the rebates. */
      marginalRate: afterRebates > 0 ? bracketFor(taxableIncome, R).rate : 0,
      /* "Below the threshold" means the age rebates alone cover the tax — that
         is what the threshold IS. Someone pushed to nil by the medical credit
         is above it and must still file. */
      belowThreshold: afterRebates === 0,
      nilByMedical: afterRebates > 0 && tax === 0
    };
  }

  /* Employee UIF for a year of steady pay. The 1% is capped on MONTHLY
     remuneration, so this is only correct for even monthly pay — which is the
     assumption every calculator on this site states. */
  function annualUif(monthlyGross, R) {
    return Math.min(monthlyGross, R.uif.monthlyCeiling) * R.uif.rate * 12;
  }

  /* Tax charged slice by slice, so a result is explainable rather than a
     single number to be taken on trust. */
  function bracketBreakdown(taxableIncome, R) {
    var rows = [];
    for (var i = 0; i < R.brackets.length; i++) {
      var b = R.brackets[i];
      if (taxableIncome <= b.from) break;
      var slice = Math.min(taxableIncome, b.to) - b.from;
      rows.push({
        band: money(b.from + 1, 0) +
              (b.to === Infinity ? " and above" : " – " + money(b.to, 0)),
        rate: percent(b.rate),
        amount: slice,
        tax: slice * b.rate
      });
    }
    return rows;
  }

  /* Gross income that yields a given take-home figure.

     Solved by bisection rather than algebraically: take-home is piecewise
     linear in gross, and inverting it in closed form means re-deriving the
     inverse of every bracket, rebate and credit interaction — and re-deriving
     it again after any Budget that changes their shape. Bisection asks the
     forward calculation, which is the one that is already proven correct.

     Take-home rises strictly with gross, so the answer is unique wherever one
     exists. 60 iterations halves the interval far past cent precision. */
  function grossForNet(targetNet, opts, R) {
    var lo = 0;
    var hi = Math.max(targetNet * 3, 1000);
    /* Push the ceiling up until it definitely overshoots, so bisection starts
       with the answer genuinely bracketed. */
    for (var guard = 0; guard < 40 && netForGross(hi, opts, R) < targetNet; guard++) {
      hi *= 2;
    }
    for (var i = 0; i < 60; i++) {
      var mid = (lo + hi) / 2;
      if (netForGross(mid, opts, R) < targetNet) { lo = mid; } else { hi = mid; }
    }
    return (lo + hi) / 2;
  }

  function netForGross(gross, opts, R) {
    var result = annualTax({
      gross: gross,
      retirement: opts.retirement || 0,
      ageBand: opts.ageBand,
      medicalMembers: opts.medicalMembers || 0
    }, R);
    var uif = opts.includeUif ? annualUif(gross / 12, R) : 0;
    return gross - result.tax - uif - (opts.retirement || 0);
  }

  window.SATax = {
    ratesFor: ratesFor,
    years: years,
    currentYear: currentYear,
    cipc: cipc,
    bandFor: bandFor,
    yearToSlug: yearToSlug,
    slugToYear: slugToYear,
    money: money,
    percent: percent,
    prettyDate: prettyDate,
    parseAmount: parseAmount,
    bracketFor: bracketFor,
    taxBeforeRebates: taxBeforeRebates,
    rebateFor: rebateFor,
    medicalCreditFor: medicalCreditFor,
    allowedRetirement: allowedRetirement,
    annualTax: annualTax,
    annualUif: annualUif,
    bracketBreakdown: bracketBreakdown,
    grossForNet: grossForNet,
    netForGross: netForGross
  };
})();
