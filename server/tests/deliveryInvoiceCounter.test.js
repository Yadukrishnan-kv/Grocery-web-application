// server/tests/deliveryInvoiceCounter.test.js
const test = require("node:test");
const assert = require("node:assert/strict");

// Logic matching orderController.computeDeliveryInvoiceRolloverCount:
// decides the next deliveredInvoiceCount given the counter's saved state
// and the current calendar year.
const computeDeliveryInvoiceRolloverCount = (savedYear, savedCount, currentYear) => {
  if (savedYear == null) {
    return (savedCount || 0) + 1;
  }
  if (savedYear !== currentYear) {
    return 1;
  }
  return (savedCount || 0) + 1;
};

const invoiceNumberFor = (count, year) => `DDFT/${101000 + count}/${String(year).slice(-2)}`;

test("Test A: brand new counter starts the sequence at 101001", () => {
  const nextCount = computeDeliveryInvoiceRolloverCount(null, 0, 2026);
  assert.equal(nextCount, 1);
  assert.equal(invoiceNumberFor(nextCount, 2026), "DDFT/101001/26");
});

test("Test B: same year keeps incrementing the sequence", () => {
  let count = 0;
  let year = null;
  for (let i = 0; i < 1222; i++) {
    count = computeDeliveryInvoiceRolloverCount(year, count, 2026);
    year = 2026;
  }
  assert.equal(count, 1222);
  assert.equal(invoiceNumberFor(count, 2026), "DDFT/102222/26");
});

test("Test C: legacy counter (no tracked year yet) keeps its existing sequence and starts tracking the year", () => {
  // Simulates a counter that was already at 1222 before deliveredInvoiceYear existed.
  const nextCount = computeDeliveryInvoiceRolloverCount(undefined, 1222, 2026);
  assert.equal(nextCount, 1223);
  assert.equal(invoiceNumberFor(nextCount, 2026), "DDFT/102223/26");
});

test("Test D: year rollover resets the sequence to 101001 with the new year suffix", () => {
  // Dec 31, 2026 left the counter at 1222/2026. Jan 1, 2027 the first invoice
  // of the new year must be DDFT/101001/27, not a continuation of 2026's count.
  const nextCount = computeDeliveryInvoiceRolloverCount(2026, 1222, 2027);
  assert.equal(nextCount, 1);
  assert.equal(invoiceNumberFor(nextCount, 2027), "DDFT/101001/27");
});

test("Test E: second invoice of the new year continues from 101002/27", () => {
  const first = computeDeliveryInvoiceRolloverCount(2026, 1222, 2027);
  const second = computeDeliveryInvoiceRolloverCount(2027, first, 2027);
  assert.equal(second, 2);
  assert.equal(invoiceNumberFor(second, 2027), "DDFT/101002/27");
});

test("Test F: rollover is independent of how large the previous year's count was", () => {
  const nextCount = computeDeliveryInvoiceRolloverCount(2026, 987654, 2027);
  assert.equal(nextCount, 1);
  assert.equal(invoiceNumberFor(nextCount, 2027), "DDFT/101001/27");
});
