/* South African net-to-gross salary calculator ("reverse PAYE").
   Loaded only by /tools/net-to-gross-calculator (see pages.json → scripts),
   after js/tax-rates.js and js/sa-tax-core.js.

   Answers the question the ordinary PAYE calculator cannot: not "what will I
   take home on this salary", but "what salary do I need to take home this
   much". That is the question people actually have when negotiating a package
   or when an employer is costing a role against a candidate's number.

   The solve lives in the shared core (SATax.grossForNet) and is done by
   bisection on the forward calculation rather than by inverting it — see the
   note there for why. All this file does is read the form and present it. */
(function () {
  "use strict";

  var form = document.getElementById("ntg-calc");
  if (!form) return;

  var T = window.SATax;
  var el = function (id) { return document.getElementById(id); };

  if (!T || !T.currentYear()) {
    var empty = el("ng-empty");
    if (empty) {
      empty.textContent =
        "The tax tables could not be loaded, so this calculator cannot run. " +
        "Please reload the page — or see the published rate tables at " +
        "/resources/tax-rates-2026-2027, or call us and we will work it out.";
    }
    return;
  }

  function selectedYear() {
    var picker = el("ng-year");
    return picker ? picker.value : T.currentYear();
  }

  function readInput() {
    var monthly = form.querySelector('input[name="ng-period"]:checked').value === "monthly";
    var target = T.parseAmount(el("ng-target").value);
    var retirement = T.parseAmount(el("ng-retirement").value);

    return {
      annualTarget: monthly ? target * 12 : target,
      annualRetirement: monthly ? retirement * 12 : retirement,
      ageBand: form.querySelector('input[name="ng-age"]:checked').value,
      medicalMembers: parseInt(el("ng-medical").value, 10) || 0,
      includeUif: el("ng-uif").checked
    };
  }

  function setText(id, text) {
    var node = el(id);
    if (node) node.textContent = text;
  }

  function renderYearNote(R) {
    var note = el("ng-year-note");
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

    if (input.annualTarget <= 0) {
      el("ng-results").hidden = true;
      el("ng-empty").hidden = false;
      return;
    }

    el("ng-empty").hidden = true;
    el("ng-results").hidden = false;

    var opts = {
      retirement: input.annualRetirement,
      ageBand: input.ageBand,
      medicalMembers: input.medicalMembers,
      includeUif: input.includeUif
    };

    var gross = T.grossForNet(input.annualTarget, opts, R);

    /* Feed the answer back through the forward calculation and show the
       resulting take-home. It is not decoration: it is the check that the
       solve landed, and it lets a reader confirm the number themselves rather
       than trusting a search that happened off-screen. */
    var r = T.annualTax({
      gross: gross,
      retirement: input.annualRetirement,
      ageBand: input.ageBand,
      medicalMembers: input.medicalMembers
    }, R);
    var uif = input.includeUif ? T.annualUif(gross / 12, R) : 0;
    var achieved = gross - r.tax - uif - input.annualRetirement;

    setText("ng-out-gross-month", T.money(gross / 12));
    setText("ng-out-gross-year", T.money(gross));
    setText("ng-out-target-month", T.money(input.annualTarget / 12));
    setText("ng-out-target-year", T.money(input.annualTarget));

    setText("ng-out-gross-2", T.money(gross));
    setText("ng-out-tax", "−" + T.money(r.tax));
    setText("ng-out-uif", "−" + T.money(uif));
    setText("ng-out-retirement", "−" + T.money(input.annualRetirement));
    setText("ng-out-achieved", T.money(achieved));
    setText("ng-out-effective", T.percent(r.effectiveRate));
    setText("ng-out-marginal", r.marginalRate > 0 ? T.percent(r.marginalRate) : "—");

    /* Cost of the next rand: how much gross buys one more rand in hand. The
       single most useful number on this page when negotiating, and one that
       almost no calculator shows. */
    var keepRate = 1 - r.marginalRate - (input.includeUif && gross / 12 < R.uif.monthlyCeiling
      ? R.uif.rate : 0);
    setText("ng-out-cost-of-rand", keepRate > 0 ? T.money(1 / keepRate) : "—");

    var retireRow = el("ng-row-retirement");
    if (retireRow) retireRow.hidden = input.annualRetirement <= 0;
    var uifRow = el("ng-row-uif");
    if (uifRow) uifRow.hidden = !input.includeUif;

    var belowNote = el("ng-note-threshold");
    if (belowNote) belowNote.hidden = !r.belowThreshold;

    var live = el("ng-live");
    if (live) {
      live.textContent =
        "A gross salary of " + T.money(gross / 12) + " a month gives a take-home of " +
        T.money(achieved / 12) + ".";
    }
  }

  function yearFromUrl() {
    var match = /[?&]year=([^&]+)/.exec(window.location.search);
    return match ? T.slugToYear(decodeURIComponent(match[1])) : null;
  }

  function syncUrlToYear() {
    if (!window.history || !window.history.replaceState) return;
    var picker = el("ng-year");
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

  var yearPicker = el("ng-year");
  if (yearPicker) {
    var requested = yearFromUrl();
    if (requested) yearPicker.value = requested;
    yearPicker.addEventListener("change", syncUrlToYear);
  }

  render();
})();
