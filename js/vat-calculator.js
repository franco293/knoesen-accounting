/* South African VAT calculator — standard rate 15%.
   Loaded only by /tools/vat-calculator (see pages.json → scripts).

   Source: National Treasury, Budget 2026 Tax Guide — "VAT is levied at the
   standard rate of 15%". */
(function () {
  "use strict";

  var form = document.getElementById("vat-calc");
  if (!form) return;

  var RATE = 0.15;

  var el = function (id) { return document.getElementById(id); };

  function money(value) {
    var parts = Math.abs(value).toFixed(2).split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return (value < 0 ? "−R" : "R") + parts.join(".");
  }

  function render() {
    var raw = (el("vat-amount").value || "").replace(/[\s,R]/g, "");
    var amount = parseFloat(raw);
    var mode = form.querySelector('input[name="vat-mode"]:checked').value;

    if (!isFinite(amount) || amount <= 0) {
      el("vat-results").hidden = true;
      el("vat-empty").hidden = false;
      return;
    }

    el("vat-empty").hidden = true;
    el("vat-results").hidden = false;

    var exclusive, vat, inclusive;

    if (mode === "add") {
      /* The figure typed is before VAT. */
      exclusive = amount;
      vat = amount * RATE;
      inclusive = amount + vat;
    } else {
      /* The figure typed already contains VAT. Backing it out uses the tax
         fraction 15/115, NOT 15% of the inclusive amount — taking 15% off an
         inclusive price is the single most common VAT error, and it
         understates the VAT-exclusive value every time. */
      inclusive = amount;
      exclusive = amount / (1 + RATE);
      vat = inclusive - exclusive;
    }

    el("vat-out-exclusive").textContent = money(exclusive);
    el("vat-out-vat").textContent = money(vat);
    el("vat-out-inclusive").textContent = money(inclusive);

    var live = el("vat-live");
    if (live) {
      live.textContent =
        "Excluding VAT " + money(exclusive) +
        ", VAT " + money(vat) +
        ", including VAT " + money(inclusive) + ".";
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
