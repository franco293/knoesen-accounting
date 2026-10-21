'use strict';

// Dormant arithmetic only: no browser, vendor requests or calculator activation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const context = vm.createContext({ window: {
  SA_TAX_RATES: JSON.parse(fs.readFileSync(path.join(root, 'data/tax-rates.json'), 'utf8'))
} });
vm.runInContext(fs.readFileSync(path.join(root, 'js/sa-tax-core.js'), 'utf8'), context);
const tax = context.window.SATax;

test('amount inputs retain supported rand, thousands and decimal formatting', () => {
  for (const text of ['45000.25', 'R45 000.25', '45,000.25', ' 45000.25 ', 'R 45\u00a0000.25']) {
    assert.equal(tax.parseAmount(text), 45000.25, text);
  }
  assert.equal(tax.parseAmount(45000.25), 45000.25);
});

test('the whole amount must be valid; invalid input cannot become a partial amount', () => {
  for (const input of [null, undefined, '', ' ', 0, -12, '-12', '12abc', '12R34',
    '45,00', '1 00', '1,000 000', 'NaN', NaN, 'Infinity', Infinity, '1e3', '1e308', 1e308]) {
    assert.equal(tax.parseAmount(input), 0, String(input));
  }
});

test('the accepted upper boundary annualises without overflow or unsafe integer cents', () => {
  const limit = Number.MAX_SAFE_INTEGER / (100 * 12);
  const accepted = tax.parseAmount(limit);
  assert.ok(accepted > 0);
  assert.ok(Number.isFinite(accepted * 12));
  assert.ok(accepted * 12 * 100 <= Number.MAX_SAFE_INTEGER);
  assert.equal(tax.parseAmount(limit + 1), 0);
  assert.equal(tax.parseAmount('999999999999999999999999999999999999999999999999'), 0);
  const result = tax.annualTax({ gross: accepted * 12, ageBand: 'under65' }, tax.ratesFor('2025/26'));
  for (const value of Object.values(result)) {
    if (typeof value === 'number') assert.ok(Number.isFinite(value));
  }
});

test('historical independent fixture and representative gross/net round trips remain stable', () => {
  // SARS 2025/26: 42678 + (300000 - 237100) * 26% - 17235 = R41797.
  // Fixture source: https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/
  const rates = tax.ratesFor('2025/26');
  assert.equal(tax.annualTax({ gross: 300000, ageBand: 'under65' }, rates).tax, 41797);
  for (const gross of [60000, 300000, 1200000, 5000000]) {
    for (const ageBand of ['under65', '65', '75']) {
      const options = { ageBand, includeUif: true, retirement: 0, medicalMembers: 0 };
      const net = tax.netForGross(gross, options, rates);
      assert.ok(Math.abs(tax.grossForNet(net, options, rates) - gross) < .01);
    }
  }
});
