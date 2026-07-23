// server/tests/paymentInvoice.test.js
const test = require("node:test");
const assert = require("node:assert/strict");

// Helper function logic matching frontend getInvoiceNumbers
const getInvoiceNumbers = (bill) => {
  if (!bill) return ["N/A"];
  const invoices = [];
  if (bill.packingInvoiceNumbers && bill.packingInvoiceNumbers.length > 0) {
    for (const inv of bill.packingInvoiceNumbers) {
      if (inv && !invoices.includes(inv)) invoices.push(inv);
    }
  }
  if (invoices.length === 0 && bill.invoiceNumber) {
    invoices.push(bill.invoiceNumber);
  }
  if (invoices.length === 0 && bill.orders && bill.orders.length > 0) {
    for (const order of bill.orders) {
      if (order.invoiceHistory && order.invoiceHistory.length > 0) {
        for (const inv of order.invoiceHistory) {
          if (inv.invoiceNumber && !invoices.includes(inv.invoiceNumber)) {
            invoices.push(inv.invoiceNumber);
          }
        }
      }
      if (order.invoiceNumber && !invoices.includes(order.invoiceNumber)) {
        invoices.push(order.invoiceNumber);
      }
    }
  }
  if (invoices.length > 0) {
    return [...new Set(invoices)].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    );
  }
  return ["N/A"];
};

// Logic matching deliverOrder matching of delivered items to packing invoices
const matchDeliveryInvoices = (orderInvoiceHistory, deliveredItems) => {
  const packingInvoiceMap = new Map();
  if (orderInvoiceHistory && orderInvoiceHistory.length > 0) {
    const deliveryRemaining = {};
    for (const dItem of deliveredItems) {
      const pid = String(dItem.product);
      deliveryRemaining[pid] = (deliveryRemaining[pid] || 0) + Number(dItem.quantity);
    }

    const sortedHistory = [...orderInvoiceHistory].sort(
      (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
    );
    for (const histEntry of sortedHistory) {
      if (!histEntry.items || histEntry.items.length === 0) continue;
      let matched = false;
      for (const hItem of histEntry.items) {
        const pid = String(hItem.product);
        const invRemaining = (hItem.quantity || 0) - (hItem.deliveredQuantity || 0);
        if (invRemaining > 0 && deliveryRemaining[pid] > 0) {
          matched = true;
          break;
        }
      }
      if (matched) {
        packingInvoiceMap.set(histEntry.invoiceNumber, true);
        for (const hItem of histEntry.items) {
          const pid = String(hItem.product);
          const invRemaining = (hItem.quantity || 0) - (hItem.deliveredQuantity || 0);
          if (invRemaining > 0 && deliveryRemaining[pid] > 0) {
            const consumed = Math.min(invRemaining, deliveryRemaining[pid]);
            hItem.deliveredQuantity = (hItem.deliveredQuantity || 0) + consumed;
            deliveryRemaining[pid] -= consumed;
            if (deliveryRemaining[pid] <= 0) delete deliveryRemaining[pid];
          }
        }
      }
      if (Object.keys(deliveryRemaining).length === 0) break;
    }
  }
  return [...packingInvoiceMap.keys()];
};

test("Test A: One invoice - single pack & single delivery", () => {
  const invoiceHistory = [
    {
      invoiceNumber: "INV-001",
      createdAt: new Date("2026-07-21T10:00:00Z"),
      items: [{ product: "p1", quantity: 5, deliveredQuantity: 0 }],
    },
  ];
  const deliveredItems = [{ product: "p1", quantity: 5 }];

  const relevantInvoices = matchDeliveryInvoices(invoiceHistory, deliveredItems);
  assert.deepEqual(relevantInvoices, ["INV-001"]);

  const bill = { packingInvoiceNumbers: relevantInvoices };
  assert.deepEqual(getInvoiceNumbers(bill), ["INV-001"]);
});

test("Test B: Two invoices, one delivery - multiple packs delivered together", () => {
  const invoiceHistory = [
    {
      invoiceNumber: "INV-001",
      createdAt: new Date("2026-07-21T10:00:00Z"),
      items: [{ product: "p1", quantity: 3, deliveredQuantity: 0 }],
    },
    {
      invoiceNumber: "INV-002",
      createdAt: new Date("2026-07-21T10:30:00Z"),
      items: [{ product: "p1", quantity: 2, deliveredQuantity: 0 }],
    },
  ];
  const deliveredItems = [{ product: "p1", quantity: 5 }];

  const relevantInvoices = matchDeliveryInvoices(invoiceHistory, deliveredItems);
  assert.deepEqual(relevantInvoices, ["INV-001", "INV-002"]);

  const bill = { packingInvoiceNumbers: relevantInvoices };
  assert.deepEqual(getInvoiceNumbers(bill), ["INV-001", "INV-002"]);
});

test("Test C: Two invoices, two deliveries - partial packing and partial delivery", () => {
  const invoiceHistory = [
    {
      invoiceNumber: "INV-001",
      createdAt: new Date("2026-07-21T10:00:00Z"),
      items: [{ product: "p1", quantity: 3, deliveredQuantity: 0 }],
    },
  ];

  // Delivery 1 (3 items)
  const delivered1 = [{ product: "p1", quantity: 3 }];
  const bill1Invoices = matchDeliveryInvoices(invoiceHistory, delivered1);
  assert.deepEqual(bill1Invoices, ["INV-001"]);

  // Later, Storekeeper packs remaining 2 items
  invoiceHistory.push({
    invoiceNumber: "INV-002",
    createdAt: new Date("2026-07-21T11:00:00Z"),
    items: [{ product: "p1", quantity: 2, deliveredQuantity: 0 }],
  });

  // Delivery 2 (2 items)
  const delivered2 = [{ product: "p1", quantity: 2 }];
  const bill2Invoices = matchDeliveryInvoices(invoiceHistory, delivered2);
  assert.deepEqual(bill2Invoices, ["INV-002"]);

  const bill1 = { packingInvoiceNumbers: bill1Invoices };
  const bill2 = { packingInvoiceNumbers: bill2Invoices };

  assert.deepEqual(getInvoiceNumbers(bill1), ["INV-001"]);
  assert.deepEqual(getInvoiceNumbers(bill2), ["INV-002"]);
});

test("Test D: No duplicates - multiple items referencing same invoice", () => {
  const invoiceHistory = [
    {
      invoiceNumber: "INV-001",
      createdAt: new Date("2026-07-21T10:00:00Z"),
      items: [
        { product: "p1", quantity: 2, deliveredQuantity: 0 },
        { product: "p2", quantity: 3, deliveredQuantity: 0 },
      ],
    },
  ];

  const delivered = [
    { product: "p1", quantity: 2 },
    { product: "p2", quantity: 3 },
  ];

  const relevantInvoices = matchDeliveryInvoices(invoiceHistory, delivered);
  assert.deepEqual(relevantInvoices, ["INV-001"]);

  const bill = { packingInvoiceNumbers: relevantInvoices };
  assert.deepEqual(getInvoiceNumbers(bill), ["INV-001"]);
});

test("Test E: Separate orders - invoices from another order must never leak", () => {
  const order1Bill = { packingInvoiceNumbers: ["INV-001"] };
  const order2Bill = { packingInvoiceNumbers: ["INV-002"] };

  assert.deepEqual(getInvoiceNumbers(order1Bill), ["INV-001"]);
  assert.deepEqual(getInvoiceNumbers(order2Bill), ["INV-002"]);
});

// Helper for test to match our new delivered invoice splitting logic
const generateDeliveredInvoices = (orderInvoiceHistory, deliveredItems) => {
  const invoiceDeliveries = new Map();
  const deliveryRemaining = {};
  for (const dItem of deliveredItems) {
    const pid = String(dItem.product);
    deliveryRemaining[pid] = (deliveryRemaining[pid] || 0) + Number(dItem.quantity);
  }

  const sortedHistory = [...orderInvoiceHistory].sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
  );

  for (const histEntry of sortedHistory) {
    if (!histEntry.items || histEntry.items.length === 0) continue;
    let matched = false;
    for (const hItem of histEntry.items) {
      const pid = String(hItem.product);
      const invRemaining = (hItem.quantity || 0) - (hItem.deliveredQuantity || 0);
      if (invRemaining > 0 && deliveryRemaining[pid] > 0) {
        matched = true;
        break;
      }
    }
    if (matched) {
      const deliveredUnderThisInvoice = [];
      for (const hItem of histEntry.items) {
        const pid = String(hItem.product);
        const invRemaining = (hItem.quantity || 0) - (hItem.deliveredQuantity || 0);
        if (invRemaining > 0 && deliveryRemaining[pid] > 0) {
          const consumed = Math.min(invRemaining, deliveryRemaining[pid]);
          hItem.deliveredQuantity = (hItem.deliveredQuantity || 0) + consumed;
          deliveryRemaining[pid] -= consumed;
          if (deliveryRemaining[pid] <= 0) delete deliveryRemaining[pid];

          deliveredUnderThisInvoice.push({
            product: hItem.product,
            quantity: consumed,
            price: hItem.price || 10,
          });
        }
      }
      if (deliveredUnderThisInvoice.length > 0) {
        invoiceDeliveries.set(histEntry.invoiceNumber, deliveredUnderThisInvoice);
      }
    }
    if (Object.keys(deliveryRemaining).length === 0) break;
  }

  const deliveredInvoices = [];
  for (const [invNo, itemsList] of invoiceDeliveries.entries()) {
    deliveredInvoices.push({
      invoiceNumber: invNo,
      quantity: itemsList.reduce((sum, item) => sum + item.quantity, 0),
      items: itemsList,
    });
  }
  return deliveredInvoices;
};

test("Test F: 5 qty total - pack 3 then 2, deliver both at once", () => {
  const invoiceHistory = [
    {
      invoiceNumber: "DEL-01",
      createdAt: new Date("2026-07-21T10:00:00Z"),
      items: [{ product: "p1", quantity: 3, price: 10, deliveredQuantity: 0 }],
    },
    {
      invoiceNumber: "DEL-02",
      createdAt: new Date("2026-07-21T10:30:00Z"),
      items: [{ product: "p1", quantity: 2, price: 10, deliveredQuantity: 0 }],
    },
  ];
  const deliveredItems = [{ product: "p1", quantity: 5 }];

  const deliveredInvoices = generateDeliveredInvoices(invoiceHistory, deliveredItems);

  assert.equal(deliveredInvoices.length, 2);
  assert.equal(deliveredInvoices[0].invoiceNumber, "DEL-01");
  assert.equal(deliveredInvoices[0].quantity, 3);
  assert.equal(deliveredInvoices[1].invoiceNumber, "DEL-02");
  assert.equal(deliveredInvoices[1].quantity, 2);
});

test("Test G: 5 qty total - pack 3 then deliver 3, pack 2 then deliver 2", () => {
  const invoiceHistory = [
    {
      invoiceNumber: "DEL-01",
      createdAt: new Date("2026-07-21T10:00:00Z"),
      items: [{ product: "p1", quantity: 3, price: 10, deliveredQuantity: 0 }],
    },
  ];

  // Delivery 1 (3 qty)
  const deliveredItems1 = [{ product: "p1", quantity: 3 }];
  const deliveredInvoices1 = generateDeliveredInvoices(invoiceHistory, deliveredItems1);

  assert.equal(deliveredInvoices1.length, 1);
  assert.equal(deliveredInvoices1[0].invoiceNumber, "DEL-01");
  assert.equal(deliveredInvoices1[0].quantity, 3);

  // Now, storekeeper packs 2 more
  invoiceHistory.push({
    invoiceNumber: "DEL-02",
    createdAt: new Date("2026-07-21T11:00:00Z"),
    items: [{ product: "p1", quantity: 2, price: 10, deliveredQuantity: 0 }],
  });

  // Delivery 2 (2 qty)
  const deliveredItems2 = [{ product: "p1", quantity: 2 }];
  const deliveredInvoices2 = generateDeliveredInvoices(invoiceHistory, deliveredItems2);

  assert.equal(deliveredInvoices2.length, 1);
  assert.equal(deliveredInvoices2[0].invoiceNumber, "DEL-02");
  assert.equal(deliveredInvoices2[0].quantity, 2);
});

