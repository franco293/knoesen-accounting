/* CIPC annual return fee calculator.
   Loaded only by /tools/cipc-annual-return-calculator (see pages.json →
   scripts), after js/tax-rates.js and js/sa-tax-core.js.

   Fees come from data/tax-rates.json under `cipc`, transcribed from CIPC's own
   Annual Returns FAQ (v5.0) and Information Guide (v1.4). These are statutory
   fees set by regulation, not tax, so they do not move with the tax year.

   The calculation people actually need is not "what is this year's fee" — CIPC
   tells you that at the point of filing. It is "I am several years behind,
   what will it cost to put it right", because a fee is payable for EVERY
   outstanding year, and the answer determines whether someone deals with it or
   keeps avoiding it until the company is deregistered.

   The two Acts express lateness differently and the difference matters:

     Companies (2008 Act)   the late figure REPLACES the standard fee
                            (R100 -> R150, R450 -> R600, and so on)

     Close corporations     a flat R150 penalty is ADDED to the standard fee
                            for each late lodgment

   See `_late_treatment` in the data for why the close corporation column is
   read as additive: it is R150 in both bands including the one whose standard
   fee is R4 000, and a replacement reading would make filing late cheaper than
   filing on time. */
(function () {
  "use strict";

  var form = document.getElementById("cipc-calc");
  if (!form) return;

  var T = window.SATax;
  var el = function (id) { return document.getElementById(id); };

  var FEES = T && T.cipc ? T.cipc() : null;
  if (!T || !FEES) {
    var empty = el("cf-empty");
    if (empty) {
      empty.textContent =
        "The fee tables could not be loaded, so this calculator cannot run. " +
        "Please reload the page, or call us and we will work out what you owe.";
    }
    return;
  }

  function readInput() {
    var count = parseInt(el("cf-count").value, 10);
    return {
      entity: form.querySelector('input[name="cf-entity"]:checked').value,
      turnover: T.parseAmount(el("cf-turnover").value),
      outstanding: isFinite(count) && count > 0 ? Math.min(count, 20) : 0,
      currentOnTime: el("cf-on-time").checked,
      reinstating: el("cf-reinstate").checked
    };
  }

  function calculate(input) {
    var isCC = input.entity === "cc";
    var table = isCC ? FEES.close_corporation : FEES.company;
    var band = T.bandFor(input.turnover, table.bands);

    /* If the most recent return is still inside its filing window, exactly one
       of the outstanding returns is charged at the standard rate. Everything
       older is, by definition, late. */
    var onTimeCount = input.currentOnTime && input.outstanding > 0 ? 1 : 0;
    var lateCount = Math.max(input.outstanding - onTimeCount, 0);

    var standardFee = band.standard;
    var lateFee = isCC ? band.standard + table.late_penalty : band.late;

    var onTimeTotal = onTimeCount * standardFee;
    var lateTotal = lateCount * lateFee;
    var reinstatement = input.reinstating ? FEES.reinstatement_fee : 0;

    return {
      isCC: isCC,
      band: band,
      standardFee: standardFee,
      lateFee: lateFee,
      latePenalty: isCC ? table.late_penalty : lateFee - standardFee,
      onTimeCount: onTimeCount,
      lateCount: lateCount,
      onTimeTotal: onTimeTotal,
      lateTotal: lateTotal,
      reinstatement: reinstatement,
      total: onTimeTotal + lateTotal + reinstatement,
      /* Two years missed is the point at which CIPC may refer the entity for
         deregistration, which is a materially different problem from a fee. */
      deregistrationRisk: lateCount >= 2
    };
  }

  function bandLabel(band) {
    if (band.to === null) return T.money(band.from, 0) + " and above";
    if (band.from === 0) return "Under " + T.money(band.to, 0);
    return T.money(band.from, 0) + " to " + T.money(band.to, 0);
  }

  function setText(id, text) {
    var node = el(id);
    if (node) node.textContent = text;
  }

  function render() {
    var input = readInput();

    if (input.outstanding <= 0) {
      el("cf-results").hidden = true;
      el("cf-empty").hidden = false;
      return;
    }

    el("cf-empty").hidden = true;
    el("cf-results").hidden = false;

    var r = calculate(input);

    setText("cf-out-total", T.money(r.total));
    setText("cf-out-total-2", T.money(r.total));
    setText("cf-out-count", String(input.outstanding) +
      (input.outstanding === 1 ? " return" : " returns"));
    setText("cf-out-band", bandLabel(r.band));
    setText("cf-out-standard-fee", T.money(r.standardFee));
    setText("cf-out-late-fee", T.money(r.lateFee));

    setText("cf-out-ontime-line",
      r.onTimeCount + " x " + T.money(r.standardFee));
    setText("cf-out-ontime-total", T.money(r.onTimeTotal));
    setText("cf-out-late-line",
      r.lateCount + " x " + T.money(r.lateFee));
    setText("cf-out-late-total", T.money(r.lateTotal));
    setText("cf-out-reinstatement", T.money(r.reinstatement));

    var onTimeRow = el("cf-row-ontime");
    if (onTimeRow) onTimeRow.hidden = r.onTimeCount === 0;
    var lateRow = el("cf-row-late");
    if (lateRow) lateRow.hidden = r.lateCount === 0;
    var reinstateRow = el("cf-row-reinstatement");
    if (reinstateRow) reinstateRow.hidden = r.reinstatement === 0;

    /* Explain how lateness is charged, because the two Acts differ and the
       difference is not obvious from the total. */
    var ccNote = el("cf-note-cc-penalty");
    if (ccNote) ccNote.hidden = !(r.isCC && r.lateCount > 0);
    setText("cf-out-cc-penalty", T.money(r.latePenalty));

    var coNote = el("cf-note-company-penalty");
    if (coNote) coNote.hidden = !(!r.isCC && r.lateCount > 0);

    var deregNote = el("cf-note-dereg");
    if (deregNote) deregNote.hidden = !r.deregistrationRisk;

    var live = el("cf-live");
    if (live) {
      live.textContent = "Total CIPC fees " + T.money(r.total) + ".";
    }
  }

  form.addEventListener("input", render);
  form.addEventListener("change", render);
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    render();
  });

  render();
})();
