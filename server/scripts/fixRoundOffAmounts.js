// One-off data-correction script for the round-off credit bug (see
// server/controllers/orderController.js packOrder / deliverOrder and
// server/controllers/billController.js).
//
// Background: packOrder used to deduct customer credit using the unrounded
// VAT-inclusive Sub Total of each partial-pack invoice instead of the
// Grand Total actually printed on the invoice (Sub Total + Round Off =
// Grand Total, rounded to the nearest whole AED). deliverOrder and the bill
// creation logic had the same gap. That was fixed in code going forward;
// this script corrects records written by the OLD logic:
//   - Order.invoiceHistory[].amount   (per packing-invoice Grand Total)
//   - Order.deliveredInvoiceHistory[].amount (per delivery event's share)
//   - Order.creditLimitUsed           (cumulative credit actually owed)
//   - Customer.balanceCreditLimit     (live available credit)
//   - Bill.totalUsed / amountDue / grandTotal, ONLY when nothing has been
//     paid against the bill yet (paidAmount === 0) — bills with any payment
//     recorded are left untouched and reported instead, since silently
//     rewriting a bill customers may have already settled against is a
//     business decision, not a data-correction one.
//   - PaymentTransaction records are NEVER modified — only reported.
//
// Usage:
//   node scripts/fixRoundOffAmounts.js            # dry run — report only
//   node scripts/fixRoundOffAmounts.js --apply    # write the corrections
//
// Safe to re-run: orders/bills already corrected produce zero delta and are
// skipped, so running it again after --apply is a no-op.

require("dotenv").config();
const mongoose = require("mongoose");
const Order = require("../models/Order");
const Customer = require("../models/Customer");
const Bill = require("../models/Bill");

const APPLY = process.argv.includes("--apply");
const EPSILON = 0.005;

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Recompute an invoice-history entry's true VAT-inclusive Sub Total from its
// line items, using the parent order's CURRENT price/VAT% for each product
// (invoiceHistory.items never stored those — same fallback the printed
// invoice/PDF generation already uses).
function recomputeSubTotal(entryItems, orderItems) {
  let subTotal = 0;
  for (const item of entryItems) {
    const pid = String(item.product);
    const orderItem = orderItems.find((oi) => String(oi.product) === pid);
    const vatPct = orderItem ? (orderItem.vatPercentage ?? 5) : 5;
    const price = item.price ?? (orderItem ? orderItem.price : 0);
    subTotal += (item.quantity || 0) * price * (1 + vatPct / 100);
  }
  return subTotal;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URL);
  console.log(`Connected. Mode: ${APPLY ? "APPLY (writing changes)" : "DRY RUN (report only)"}\n`);

  const orders = await Order.find({ "invoiceHistory.0": { $exists: true } });
  console.log(`Found ${orders.length} order(s) with invoiceHistory.\n`);

  const customerDeltas = new Map(); // customerId -> total AED to further deduct (+) or refund (-)
  let ordersTouched = 0;
  let billsCorrected = 0;
  let billsFlagged = 0;

  for (const order of orders) {
    let orderInvoiceDelta = 0;
    const correctedByInvoiceNumber = new Map(); // invoiceNumber -> corrected Grand Total
    const report = [];

    for (const entry of order.invoiceHistory) {
      const subTotal = recomputeSubTotal(entry.items, order.orderItems);
      const correctAmount = Math.round(subTotal);
      const oldAmount = entry.amount || 0;
      const delta = round2(correctAmount - oldAmount);
      correctedByInvoiceNumber.set(entry.invoiceNumber, correctAmount);

      if (Math.abs(delta) > EPSILON) {
        report.push(
          `    invoiceHistory ${entry.invoiceNumber}: ${oldAmount.toFixed(2)} -> ${correctAmount.toFixed(2)} (delta ${delta >= 0 ? "+" : ""}${delta.toFixed(2)})`
        );
        orderInvoiceDelta = round2(orderInvoiceDelta + delta);
        if (APPLY) entry.amount = correctAmount;
      }
    }

    // deliveredInvoiceHistory: split each invoice's corrected Grand Total
    // across its (possibly multiple) delivery events using the same
    // before/after cumulative-quantity rule the runtime code now applies,
    // so partial deliveries still sum exactly to the invoice's Grand Total.
    const byInvoice = new Map(); // invoiceNumber -> deliveredInvoiceHistory entries, in order
    for (const dEntry of order.deliveredInvoiceHistory || []) {
      if (!byInvoice.has(dEntry.invoiceNumber)) byInvoice.set(dEntry.invoiceNumber, []);
      byInvoice.get(dEntry.invoiceNumber).push(dEntry);
    }

    for (const [invNo, dEntries] of byInvoice.entries()) {
      const histEntry = order.invoiceHistory.find((h) => h.invoiceNumber === invNo);
      const correctedTotal = correctedByInvoiceNumber.get(invNo);
      if (!histEntry || correctedTotal === undefined) continue; // no matching packing invoice found — leave as-is

      const totalQtyOfInvoice = histEntry.items.reduce((s, i) => s + (i.quantity || 0), 0);
      dEntries.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

      let cumulativeQty = 0;
      let amountBefore = 0;
      for (const dEntry of dEntries) {
        const dQty = dEntry.quantity || 0;
        cumulativeQty += dQty;
        const amountAfter =
          cumulativeQty >= totalQtyOfInvoice ? correctedTotal : round2((correctedTotal * cumulativeQty) / totalQtyOfInvoice);
        const thisEventAmount = round2(amountAfter - amountBefore);
        amountBefore = amountAfter;

        const oldAmount = dEntry.amount || 0;
        const delta = round2(thisEventAmount - oldAmount);
        if (Math.abs(delta) > EPSILON) {
          report.push(
            `    deliveredInvoiceHistory ${invNo} (${dEntry.createdAt.toISOString()}): ${oldAmount.toFixed(2)} -> ${thisEventAmount.toFixed(2)} (delta ${delta >= 0 ? "+" : ""}${delta.toFixed(2)})`
          );
          if (APPLY) dEntry.amount = thisEventAmount;
        }
      }
    }

    if (report.length > 0) {
      ordersTouched++;
      console.log(`Order ${order._id} (payment=${order.payment}, creditLimitUsed=${(order.creditLimitUsed || 0).toFixed(2)}, returnBalanceUsed=${(order.returnBalanceUsed || 0).toFixed(2)}):`);
      report.forEach((line) => console.log(line));

      if (Math.abs(orderInvoiceDelta) > EPSILON && order.payment === "credit") {
        if ((order.returnBalanceUsed || 0) > 0) {
          console.log(
            `    ⚠ order has returnBalanceUsed=${order.returnBalanceUsed.toFixed(2)} — this script attributes the full delta (${orderInvoiceDelta >= 0 ? "+" : ""}${orderInvoiceDelta.toFixed(2)}) to creditLimitUsed/balanceCreditLimit; review manually if store credit should absorb part of it.`
          );
        }
        console.log(
          `    creditLimitUsed: ${(order.creditLimitUsed || 0).toFixed(2)} -> ${round2((order.creditLimitUsed || 0) + orderInvoiceDelta).toFixed(2)}`
        );
        if (APPLY) {
          order.creditLimitUsed = round2((order.creditLimitUsed || 0) + orderInvoiceDelta);
        }
        const custId = String(order.customer);
        customerDeltas.set(custId, round2((customerDeltas.get(custId) || 0) + orderInvoiceDelta));
      }
      console.log("");

      if (APPLY) await order.save();
    }

    // Bills tied to this order
    const bills = await Bill.find({ orders: order._id });
    for (const bill of bills) {
      const relevantInvoices = bill.packingInvoiceNumbers?.length ? bill.packingInvoiceNumbers : [bill.invoiceNumber];
      let correctedBillTotal = 0;
      let anyMatch = false;
      for (const invNo of relevantInvoices) {
        const c = correctedByInvoiceNumber.get(invNo);
        if (c !== undefined) {
          correctedBillTotal = round2(correctedBillTotal + c);
          anyMatch = true;
        }
      }
      if (!anyMatch) continue;
      const billDelta = round2(correctedBillTotal - (bill.amountDue || 0));
      if (Math.abs(billDelta) <= EPSILON) continue;

      if ((bill.paidAmount || 0) > 0) {
        billsFlagged++;
        console.log(
          `  ⚠ Bill ${bill._id} (invoice ${bill.invoiceNumber}) has paidAmount=${bill.paidAmount.toFixed(2)} — amountDue should be ${bill.amountDue.toFixed(2)} -> ${correctedBillTotal.toFixed(2)} (delta ${billDelta >= 0 ? "+" : ""}${billDelta.toFixed(2)}) but was NOT changed. Review manually.\n`
        );
        continue;
      }

      billsCorrected++;
      console.log(
        `  Bill ${bill._id} (invoice ${bill.invoiceNumber}): amountDue ${bill.amountDue.toFixed(2)} -> ${correctedBillTotal.toFixed(2)} (delta ${billDelta >= 0 ? "+" : ""}${billDelta.toFixed(2)})\n`
      );
      if (APPLY) {
        bill.totalUsed = correctedBillTotal;
        bill.amountDue = correctedBillTotal;
        bill.grandTotal = correctedBillTotal;
        await bill.save();
      }
    }
  }

  console.log("──────────────────────────────────────────────");
  console.log(`Orders with corrections: ${ordersTouched}`);
  console.log(`Bills corrected: ${billsCorrected}`);
  console.log(`Bills flagged for manual review (already paid): ${billsFlagged}`);
  console.log("");

  if (customerDeltas.size > 0) {
    console.log("Customer balanceCreditLimit adjustments:");
    for (const [custId, delta] of customerDeltas.entries()) {
      const customer = await Customer.findById(custId);
      if (!customer) continue;
      const newBalance = round2(customer.balanceCreditLimit - delta);
      console.log(
        `  Customer ${custId} (${customer.name || ""}): ${customer.balanceCreditLimit.toFixed(2)} -> ${newBalance.toFixed(2)} (${delta >= 0 ? "additional deduction" : "refund"} of ${Math.abs(delta).toFixed(2)})`
      );
      if (newBalance < 0) {
        console.log(`    ⚠ would go negative — review manually, not applied automatically.`);
        continue;
      }
      if (APPLY) {
        customer.balanceCreditLimit = newBalance;
        await customer.save();
      }
    }
  } else {
    console.log("No customer balanceCreditLimit adjustments needed.");
  }

  if (!APPLY) {
    console.log("\nDry run only — no changes written. Re-run with --apply to write these corrections.");
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
