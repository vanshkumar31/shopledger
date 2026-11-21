'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const pricing = require('../lib/pricing');
const invoice = require('../lib/invoice');
const reports = require('../lib/reports');

function orderFrom(items, coupon) {
  const totals = pricing.computeTotals(items, coupon || '');
  return {
    id: 42,
    date: '21/11/2026',
    customer: 'In-memory customer',
    paymentMode: 'cash',
    status: 'completed',
    items: items,
    coupon: coupon || '',
    subtotal: totals.subtotal,
    discount: totals.discount,
    tax: totals.tax,
    total: totals.total
  };
}

test('CURRENT BEHAVIOUR: pricing applies the HSN slab, invoice falls back to default GST', function () {
  const order = orderFrom([{ id: 1, name: 'Rice', hsn: '1006', price: 100, qty: 1 }]);
  const billed = pricing.computeTotals(order.items, '');
  const invoiced = invoice.computeInvoiceFigures(order);

  assert.equal(billed.tax, 5);
  assert.equal(billed.total, 105);
  assert.equal(invoiced.tax, 5);
  assert.equal(invoiced.total, 105);
});

test('CURRENT BEHAVIOUR: invoice GST ignores discount-apportioned taxable value', function () {
  const items = [{ id: 1, name: 'Rice', hsn: '1006', price: 600, qty: 1 }];
  const order = orderFrom(items, 'SAVE10');
  const billed = pricing.computeTotals(items, 'SAVE10');
  const invoiced = invoice.computeInvoiceFigures(order);

  assert.equal(billed.discount, 60);
  assert.equal(billed.tax, 27);
  assert.equal(billed.total, 567);
  assert.equal(invoiced.tax, 27);
  assert.equal(invoiced.discount, 60);
  assert.equal(invoiced.total, 567);
});

test('CURRENT BEHAVIOUR: invoice applies flat coupon only after eligibility validation on billed order', function () {
  const items = [{ id: 2, name: 'Poha', hsn: '1104', price: 100, qty: 1 }];
  const order = orderFrom(items, 'FLAT50');
  const invoiced = invoice.computeInvoiceFigures(order);

  assert.equal(order.discount, 0);
  assert.equal(invoiced.discount, 0);
  assert.equal(invoiced.total, 105);
});

test('CURRENT BEHAVIOUR: reconciliation compares independently computed invoice figures to stored billed totals', function () {
  const order = orderFrom([{ id: 3, name: 'Ghee', hsn: '0405', price: 100, qty: 1 }]);
  const result = reports.getGstReconciliation({ orders: [order], products: [], customers: [] });

  assert.equal(result.totalChecked, 1);
  assert.equal(result.mismatchCount, 0);
  assert.equal(result.rows[0].ledgerTax, 12);
  assert.equal(result.rows[0].invoiceTax, 12);
  assert.equal(result.rows[0].ledgerTotal, 112);
  assert.equal(result.rows[0].invoiceTotal, 112);
  assert.equal(result.rows[0].delta, 0);
  assert.equal(result.rows[0].matched, true);
});

test('CURRENT BEHAVIOUR: invoice render reports the recomputed total mismatch', function () {
  const order = orderFrom([{ id: 4, name: 'Rice', hsn: '1006', price: 100, qty: 1 }]);
  const html = invoice.render(order);

  assert.doesNotMatch(html, /Accountant Reconciliation Notice/);
});

test('invoice figures match billed GST and coupon totals for each line', function () {
  const items = [
    { id: 5, name: 'Rice', sku: 'GRN-1', hsn: '1006', price: 600, qty: 1 },
    { id: 6, name: 'Ghee', sku: 'DAI-1', hsn: '0405', price: 450, qty: 1 }
  ];
  const order = orderFrom(items, 'SAVE10');
  const billed = pricing.computeTotals(items, 'SAVE10');
  const invoiced = invoice.computeInvoiceFigures(order);

  assert.equal(invoiced.subtotal, billed.subtotal);
  assert.equal(invoiced.discount, billed.discount);
  assert.equal(invoiced.tax, billed.tax);
  assert.equal(invoiced.total, billed.total);
  assert.deepEqual(invoiced.rows.map(function (line) { return line.lineTax; }), billed.lines.map(function (line) { return line.tax; }));
});
