/* Employer cost-to-company calculator.
   Loaded only by /tools/employer-cost-calculator (see pages.json → scripts),
   after js/tax-rates.js and js/sa-tax-core.js.

   Answers what a hire actually costs the business, as opposed to what appears
   on the employment contract. Three statutory amounts sit on top of the gross
   salary, and each behaves differently:

     Employer UIF   1% of remuneration, capped on MONTHLY earnings. Above the
                    ceiling it stops rising, so it is a shrinking proportion of
                    a senior salary and a real one on a junior.

     SDL            1% of total remuneration, with NO ceiling — but the whole
                    business is exempt while its annual payroll stays under the
                    threshold. So it is nil until the payroll crosses that
                    line, then it applies to everything, which is why hiring
                    one more person can add more cost than that person's own
                    levy.

     COIDA          an annual assessment: the industry rate applied to earnings
                    capped at a ceiling. The rate is industry-specific and is
                    on your Letter of Good Standing, so it is asked for rather
                    than guessed.

   Rates and ceilings come from data/tax-rates.json. Note the provenance
   warning on the COIDA figures there — they are sourced more weakly than the
   SARS and Treasury numbers. */
(function () {
  "use strict";

  var form = document.getElementById("employer-calc");
  if (!form) return;

  var T = window.SATax;
  var el = function (id) { return document.getElementById(id); };

  if (!T || !T.currentYear()) {
    var empty = el("ec-empty");
    if (empty) {
      empty.textContent =
        "The rate tables could not be loaded, so this calculator cannot run. " +
        "Please reload the page, or call us and we will cost the role for you.";
    }
    return;
  }

  function selectedYear() {
    var picker = el("ec-year");
    return picker ? picker.value : T.currentYear();
  }

  function readInput() {
    var monthly = form.querySelector('input[name="ec-period"]:checked').value === "monthly";
    var salary = T.parseAmount(el("ec-salary").value);
    var rate = parseFloat(String(el("ec-coida-rate").value).replace(/[\s%]/g, ""));

    return {
      monthlySalary: monthly ? salary : salary / 12,
      annualSalary: monthly ? salary * 12 : salary,
      totalPayroll: T.parseAmount(el("ec-payroll").value),
      coidaRate: isFinite(rate) && rate > 0 ? rate / 100 : 0,
      employerRetirement: T.parseAmount(el("ec-retirement").value),
      employerMedical: T.parseAmount(el("ec-medical").value),
      thirteenth: el("ec-thirteenth").checked
    };
  }

  function calculate(input, R) {
    var payroll = R.meta.payroll;
    var coidaData = R.meta.coida;

    /* A 13th cheque is remuneration, so it lifts the base every statutory
       charge is calculated on — not just the salary line. */
    var annualCash = input.annualSalary + (input.thirteenth ? input.monthlySalary : 0);

    /* UIF is capped on MONTHLY earnings, so annualising the ceiling is only
       right for steady pay. A 13th cheque paid in one month is mostly above
       the ceiling for anyone near it and attracts little or no extra UIF —
       modelled here by charging UIF on the regular months only. */
    var uif = Math.min(input.monthlySalary, payroll.uif_monthly_ceiling) *
              payroll.uif_employer_rate * 12;

    /* SDL is an employer-level test: exempt entirely while total annual
       payroll stays under the threshold. If the visitor has not told us the
       payroll, assume this employee is not the whole of it and charge it —
       understating a levy is the worse error when costing a hire. */
    var exemptionLimit = payroll.sdl_exemption_annual_remuneration;
    var payrollKnown = input.totalPayroll > 0;
    var sdlExempt = payrollKnown && input.totalPayroll < exemptionLimit;
    var sdl = sdlExempt ? 0 : annualCash * payroll.sdl_rate;

    /* COIDA: industry rate on earnings capped at the annual ceiling. */
    var ceiling = coidaData ? coidaData.earnings_ceiling : 0;
    var coidaEarnings = ceiling ? Math.min(annualCash, ceiling) : annualCash;
    var coida = input.coidaRate * coidaEarnings;

    var statutory = uif + sdl + coida;
    var voluntary = input.employerRetirement + input.employerMedical;
    var total = annualCash + statutory + voluntary;

    return {
      annualCash: annualCash,
      thirteenthAmount: input.thirteenth ? input.monthlySalary : 0,
      uif: uif,
      uifCapped: input.monthlySalary > payroll.uif_monthly_ceiling,
      uifCeiling: payroll.uif_monthly_ceiling,
      sdl: sdl,
      sdlExempt: sdlExempt,
      sdlAssumed: !payrollKnown,
      exemptionLimit: exemptionLimit,
      coida: coida,
      coidaCapped: ceiling > 0 && annualCash > ceiling,
      coidaCeiling: ceiling,
      coidaMissing: input.coidaRate <= 0,
      statutory: statutory,
      voluntary: voluntary,
      total: total,
      /* The number people actually want: how much more than the salary. */
      uplift: input.annualSalary > 0 ? (total - input.annualSalary) / input.annualSalary : 0
    };
  }

  function setText(id, text) {
    var node = el(id);
    if (node) node.textContent = text;
  }

  function renderYearNote(R) {
    var note = el("ec-year-note");
    if (!note) return;
    note.textContent =
      "Using the " + R.meta.label + " figures (" + R.meta.period + ").";
  }

  function render() {
    var R = T.ratesFor(selectedYear());
    renderYearNote(R);

    var input = readInput();

    if (input.annualSalary <= 0) {
      el("ec-results").hidden = true;
      el("ec-empty").hidden = false;
      return;
    }

    el("ec-empty").hidden = true;
    el("ec-results").hidden = false;

    var r = calculate(input, R);

    setText("ec-out-total-month", T.money(r.total / 12));
    setText("ec-out-total-year", T.money(r.total));
    setText("ec-out-uplift", T.percent(r.uplift));

    setText("ec-out-salary", T.money(input.annualSalary));
    setText("ec-out-thirteenth", T.money(r.thirteenthAmount));
    setText("ec-out-uif", T.money(r.uif));
    setText("ec-out-sdl", T.money(r.sdl));
    setText("ec-out-coida", T.money(r.coida));
    setText("ec-out-retirement", T.money(input.employerRetirement));
    setText("ec-out-medical", T.money(input.employerMedical));
    setText("ec-out-statutory", T.money(r.statutory));
    setText("ec-out-total-2", T.money(r.total));

    var rows = [
      ["ec-row-thirteenth", r.thirteenthAmount > 0],
      ["ec-row-retirement", input.employerRetirement > 0],
      ["ec-row-medical", input.employerMedical > 0]
    ];
    rows.forEach(function (pair) {
      var node = el(pair[0]);
      if (node) node.hidden = !pair[1];
    });

    var uifNote = el("ec-note-uif-capped");
    if (uifNote) uifNote.hidden = !r.uifCapped;
    setText("ec-out-uif-ceiling", T.money(r.uifCeiling, 0));

    var sdlExemptNote = el("ec-note-sdl-exempt");
    if (sdlExemptNote) sdlExemptNote.hidden = !r.sdlExempt;
    var sdlAssumedNote = el("ec-note-sdl-assumed");
    if (sdlAssumedNote) sdlAssumedNote.hidden = !r.sdlAssumed;
    setText("ec-out-sdl-limit", T.money(r.exemptionLimit, 0));

    var coidaNote = el("ec-note-coida-missing");
    if (coidaNote) coidaNote.hidden = !r.coidaMissing;
    var coidaCapNote = el("ec-note-coida-capped");
    if (coidaCapNote) coidaCapNote.hidden = !r.coidaCapped;
    setText("ec-out-coida-ceiling", T.money(r.coidaCeiling, 0));

    var live = el("ec-live");
    if (live) {
      live.textContent = "Total cost to company " + T.money(r.total / 12) +
        " a month, " + T.percent(r.uplift) + " above the salary.";
    }
  }

  function yearFromUrl() {
    var match = /[?&]year=([^&]+)/.exec(window.location.search);
    return match ? T.slugToYear(decodeURIComponent(match[1])) : null;
  }

  function syncUrlToYear() {
    if (!window.history || !window.history.replaceState) return;
    var picker = el("ec-year");
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

  var yearPicker = el("ec-year");
  if (yearPicker) {
    var requested = yearFromUrl();
    if (requested && yearPicker.querySelector('option[value="' + requested + '"]')) {
      yearPicker.value = requested;
    }
    yearPicker.addEventListener("change", syncUrlToYear);
  }

  render();
})();
