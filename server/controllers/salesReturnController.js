// controllers/salesReturnController.js
const SalesReturn = require("../models/SalesReturn");
const Order = require("../models/Order");
const Customer = require("../models/Customer");
const Bill = require("../models/Bill");
const InvoiceCounter = require("../models/InvoiceCounter");
const CompanySettings = require("../models/CompanySettings");
const PDFDocument = require("pdfkit");

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getNextReturnInvoiceNumber = async () => {
  const counter = await InvoiceCounter.findOneAndUpdate(
    {},
    { $inc: { returnCount: 1 } },
    { new: true, upsert: true }
  );
  const num = String(counter.returnCount).padStart(4, "0");
  return `RET-${num}`;
};

const buildPDFBuffer = (generateFn) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    generateFn(doc)
      .then(() => doc.end())
      .catch(reject);
  });
};

const numberToWords = (num) => {
  if (num === 0) return "Zero";
  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const convertGroup = (n) => {
    if (n === 0) return "";
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
    return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " and " + convertGroup(n % 100) : "");
  };
  const parts = [];
  const million = Math.floor(num / 1_000_000);
  const thousand = Math.floor((num % 1_000_000) / 1_000);
  const remainder = Math.floor(num % 1_000);
  if (million) parts.push(convertGroup(million) + " Million");
  if (thousand) parts.push(convertGroup(thousand) + " Thousand");
  if (remainder) parts.push(convertGroup(remainder));
  return parts.join(" ") || "Zero";
};

const amountToWords = (amount) => {
  const whole = Math.floor(Math.abs(amount));
  const fils = Math.round((Math.abs(amount) - whole) * 100);
  let words = "UAE Dirham " + numberToWords(whole);
  if (fils > 0) words += " and " + numberToWords(fils) + " Fils";
  return words + " Only";
};

// ─── Create Return Request ────────────────────────────────────────────────────

const createSalesReturn = async (req, res) => {
  try {
    const { orderId, returnItems, returnReason } = req.body;

    if (!orderId || !returnItems || returnItems.length === 0) {
      return res.status(400).json({ message: "orderId and returnItems are required" });
    }

    const order = await Order.findById(orderId).populate(
      "orderItems.product",
      "productName unit price"
    );
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (!["delivered", "partial_delivered"].includes(order.status)) {
      return res.status(400).json({ message: "Only delivered orders can be returned" });
    }

    // 5-day window check
    const daysSinceDelivery =
      (Date.now() - new Date(order.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceDelivery > 5) {
      return res.status(400).json({
        message: `Return window expired. Returns must be made within 5 days of delivery (${Math.floor(daysSinceDelivery)} days ago).`,
      });
    }

    // Validate and build return items
    const processedItems = [];
    for (const ri of returnItems) {
      const orderItem = order.orderItems.find(
        (oi) => oi.product._id.toString() === ri.productId.toString()
      );
      if (!orderItem) {
        return res.status(400).json({
          message: `Product ${ri.productId} not found in original order`,
        });
      }
      const qty = parseInt(ri.returnedQuantity);
      if (!qty || qty <= 0) continue;
      if (qty > (orderItem.deliveredQuantity || 0)) {
        return res.status(400).json({
          message: `Return qty (${qty}) exceeds delivered qty (${orderItem.deliveredQuantity}) for "${orderItem.product?.productName || "product"}"`,
        });
      }
      const exclVatAmount = parseFloat((qty * orderItem.price).toFixed(2));
      const vatPercent = orderItem.vatPercentage || 5;
      const vatAmount = parseFloat(((exclVatAmount * vatPercent) / 100).toFixed(2));
      const totalAmount = parseFloat((exclVatAmount + vatAmount).toFixed(2));

      processedItems.push({
        product: orderItem.product._id,
        unit: orderItem.unit || orderItem.product?.unit || "",
        returnedQuantity: qty,
        price: orderItem.price,
        vatPercentage: vatPercent,
        exclVatAmount,
        vatAmount,
        totalAmount,
        reason: ri.reason || "",
      });
    }

    if (processedItems.length === 0) {
      return res.status(400).json({ message: "No valid return quantities provided" });
    }

    const salesReturn = await SalesReturn.create({
      order: orderId,
      customer: order.customer,
      returnItems: processedItems,
      returnReason: returnReason || "",
      status: "pending_admin_approval",
      createdBy: req.user._id,
    });

    const populated = await SalesReturn.findById(salesReturn._id)
      .populate("order", "invoiceNumber orderDate")
      .populate("customer", "name phoneNumber")
      .populate("returnItems.product", "productName unit")
      .populate("createdBy", "username");

    res.status(201).json({ message: "Return request created successfully", salesReturn: populated });
  } catch (error) {
    console.error("createSalesReturn error:", error);
    res.status(500).json({ message: "Server error: " + error.message });
  }
};

// ─── Get All Returns (Admin) ──────────────────────────────────────────────────

const getAllSalesReturns = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    const returns = await SalesReturn.find(filter)
      .populate("order", "invoiceNumber orderDate status payment")
      .populate("customer", "name phoneNumber address")
      .populate("returnItems.product", "productName unit")
      .populate("assignedTo", "username")
      .populate("createdBy", "username")
      .sort({ createdAt: -1 });

    res.json(returns);
  } catch (error) {
    res.status(500).json({ message: "Server error: " + error.message });
  }
};

// ─── Get By Id ────────────────────────────────────────────────────────────────

const getSalesReturnById = async (req, res) => {
  try {
    const sr = await SalesReturn.findById(req.params.id)
      .populate("order", "invoiceNumber orderDate status payment")
      .populate("customer", "name phoneNumber address")
      .populate("returnItems.product", "productName unit")
      .populate("assignedTo", "username")
      .populate("createdBy", "username")
      .populate("relatedBill", "invoiceNumber amountDue status");

    if (!sr) return res.status(404).json({ message: "Sales return not found" });
    res.json(sr);
  } catch (error) {
    res.status(500).json({ message: "Server error: " + error.message });
  }
};

// ─── Admin: Approve ───────────────────────────────────────────────────────────

const approveSalesReturn = async (req, res) => {
  try {
    const { adminRemarks, deliveryManId } = req.body;
    const sr = await SalesReturn.findById(req.params.id);
    if (!sr) return res.status(404).json({ message: "Sales return not found" });
    if (sr.status !== "pending_admin_approval") {
      return res.status(400).json({ message: "Only pending returns can be approved" });
    }

    sr.adminRemarks = adminRemarks || "";
    sr.adminApprovedAt = new Date();

    if (deliveryManId) {
      sr.assignedTo = deliveryManId;
      sr.assignedAt = new Date();
      sr.status = "pickup_assigned";
    } else {
      sr.status = "approved";
    }
    await sr.save();

    const populated = await SalesReturn.findById(sr._id)
      .populate("order", "invoiceNumber")
      .populate("customer", "name phoneNumber")
      .populate("assignedTo", "username");

    res.json({ message: "Sales return approved successfully", salesReturn: populated });
  } catch (error) {
    res.status(500).json({ message: "Server error: " + error.message });
  }
};

// ─── Admin: Reject ────────────────────────────────────────────────────────────

const rejectSalesReturn = async (req, res) => {
  try {
    const { adminRemarks } = req.body;
    const sr = await SalesReturn.findById(req.params.id);
    if (!sr) return res.status(404).json({ message: "Sales return not found" });
    if (sr.status !== "pending_admin_approval") {
      return res.status(400).json({ message: "Only pending returns can be rejected" });
    }

    sr.status = "rejected";
    sr.adminRemarks = adminRemarks || "";
    sr.adminRejectedAt = new Date();
    await sr.save();

    res.json({ message: "Sales return rejected", salesReturn: sr });
  } catch (error) {
    res.status(500).json({ message: "Server error: " + error.message });
  }
};

// ─── Admin: Assign Delivery Man ───────────────────────────────────────────────

const assignReturnPickup = async (req, res) => {
  try {
    const { deliveryManId } = req.body;
    const sr = await SalesReturn.findById(req.params.id);
    if (!sr) return res.status(404).json({ message: "Sales return not found" });
    if (sr.status !== "approved") {
      return res.status(400).json({ message: "Return must be approved before assigning pickup" });
    }
    if (!deliveryManId) {
      return res.status(400).json({ message: "deliveryManId is required" });
    }

    sr.assignedTo = deliveryManId;
    sr.assignedAt = new Date();
    sr.status = "pickup_assigned";
    await sr.save();

    const populated = await SalesReturn.findById(sr._id).populate("assignedTo", "username");
    res.json({ message: "Delivery man assigned for pickup", salesReturn: populated });
  } catch (error) {
    res.status(500).json({ message: "Server error: " + error.message });
  }
};

// ─── Cancel Return ────────────────────────────────────────────────────────────

const cancelSalesReturn = async (req, res) => {
  try {
    const sr = await SalesReturn.findById(req.params.id);
    if (!sr) return res.status(404).json({ message: "Sales return not found" });
    if (!["pending_admin_approval", "approved"].includes(sr.status)) {
      return res.status(400).json({ message: "Only pending or approved returns can be cancelled" });
    }
    sr.status = "cancelled";
    await sr.save();
    res.json({ message: "Sales return cancelled", salesReturn: sr });
  } catch (error) {
    res.status(500).json({ message: "Server error: " + error.message });
  }
};

// ─── Delivery Man: Confirm Pickup ─────────────────────────────────────────────

const confirmPickup = async (req, res) => {
  try {
    const sr = await SalesReturn.findById(req.params.id);
    if (!sr) return res.status(404).json({ message: "Sales return not found" });
    if (sr.status !== "pickup_assigned") {
      return res.status(400).json({ message: "This return is not assigned for pickup" });
    }
    if (sr.assignedTo.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You are not assigned to this pickup" });
    }

    sr.status = "picked_up";
    sr.pickedUpAt = new Date();
    await sr.save();

    res.json({ message: "Pickup confirmed. Return is on its way to the store.", salesReturn: sr });
  } catch (error) {
    res.status(500).json({ message: "Server error: " + error.message });
  }
};

// ─── Storekeeper: Confirm Received & Complete ─────────────────────────────────

const confirmReturnReceived = async (req, res) => {
  try {
    const { refundMethod } = req.body;

    const sr = await SalesReturn.findById(req.params.id);
    if (!sr) return res.status(404).json({ message: "Sales return not found" });
    if (sr.status !== "picked_up") {
      return res.status(400).json({ message: "Goods must be picked up before confirming receipt" });
    }

    const order = await Order.findById(sr.order);
    const totalReturnAmount = sr.returnItems.reduce((s, i) => s + (i.totalAmount || 0), 0);

    // Restore customer credit balance if credit order
    if (order && order.payment === "credit") {
      await Customer.findByIdAndUpdate(sr.customer, {
        $inc: { balanceCreditLimit: totalReturnAmount },
      });
    }

    // Adjust or cancel related bill
    let billAdjusted = false;
    let relatedBillId = null;

    if (order) {
      const bills = await Bill.find({
        orders: order._id,
        status: { $nin: ["paid", "cancelled"] },
      }).sort({ createdAt: -1 });

      if (bills.length > 0) {
        const bill = bills[0];
        const newAmountDue = Math.max(0, bill.amountDue - totalReturnAmount);
        bill.amountDue = newAmountDue;
        if (bill.grandTotal !== undefined) {
          bill.grandTotal = Math.max(0, bill.grandTotal - totalReturnAmount);
        }
        if (bill.totalExclVat !== undefined) {
          bill.totalExclVat = Math.max(0, bill.totalExclVat - sr.returnItems.reduce((s, i) => s + (i.exclVatAmount || 0), 0));
        }
        if (newAmountDue === 0) bill.status = "paid";
        await bill.save();
        relatedBillId = bill._id;
        billAdjusted = true;
      }
    }

    // Generate return invoice number
    const returnInvoiceNumber = await getNextReturnInvoiceNumber();

    sr.status = "completed";
    sr.completedAt = new Date();
    sr.billAdjusted = billAdjusted;
    sr.relatedBill = relatedBillId;
    sr.refundMethod = refundMethod || "none";
    sr.refundAmount = totalReturnAmount;
    sr.refundStatus = refundMethod && refundMethod !== "none" ? "pending" : "processed";
    sr.returnInvoiceNumber = returnInvoiceNumber;
    await sr.save();

    const populated = await SalesReturn.findById(sr._id)
      .populate("order", "invoiceNumber")
      .populate("customer", "name phoneNumber");

    res.json({
      message: `Return completed. Invoice: ${returnInvoiceNumber}. Bill ${billAdjusted ? "adjusted" : "not found/already paid"}.`,
      salesReturn: populated,
      returnInvoiceNumber,
    });
  } catch (error) {
    console.error("confirmReturnReceived error:", error);
    res.status(500).json({ message: "Server error: " + error.message });
  }
};

// ─── Delivery Man: My Assigned Pickups ────────────────────────────────────────

const getMyReturnPickups = async (req, res) => {
  try {
    const returns = await SalesReturn.find({
      assignedTo: req.user._id,
      status: { $in: ["pickup_assigned", "picked_up"] },
    })
      .populate("order", "invoiceNumber orderDate")
      .populate("customer", "name phoneNumber address")
      .populate("returnItems.product", "productName unit")
      .sort({ createdAt: -1 });
    res.json(returns);
  } catch (error) {
    res.status(500).json({ message: "Server error: " + error.message });
  }
};

// ─── Storekeeper: Picked Up Returns Awaiting Receipt ─────────────────────────

const getPickedUpReturns = async (req, res) => {
  try {
    const returns = await SalesReturn.find({ status: "picked_up" })
      .populate("order", "invoiceNumber orderDate")
      .populate("customer", "name phoneNumber address")
      .populate("returnItems.product", "productName unit")
      .populate("assignedTo", "username")
      .sort({ pickedUpAt: -1 });
    res.json(returns);
  } catch (error) {
    res.status(500).json({ message: "Server error: " + error.message });
  }
};

// ─── Delivered Orders Eligible for Return (last 5 days) ──────────────────────

const getDeliveredOrdersForReturn = async (req, res) => {
  try {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const orders = await Order.find({
      status: { $in: ["delivered", "partial_delivered"] },
      updatedAt: { $gte: fiveDaysAgo },
    })
      .populate("customer", "name phoneNumber")
      .populate("orderItems.product", "productName unit price")
      .sort({ updatedAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: "Server error: " + error.message });
  }
};

// ─── Returns for a Specific Order ────────────────────────────────────────────

const getSalesReturnsByOrder = async (req, res) => {
  try {
    const returns = await SalesReturn.find({ order: req.params.orderId })
      .populate("returnItems.product", "productName unit")
      .populate("assignedTo", "username")
      .sort({ createdAt: -1 });
    res.json(returns);
  } catch (error) {
    res.status(500).json({ message: "Server error: " + error.message });
  }
};

// ─── PDF: Return Invoice ──────────────────────────────────────────────────────

const generateReturnInvoicePDF = async (doc, sr, settings) => {
  const pageW = doc.page.width;
  const margin = 40;
  const cw = pageW - margin * 2;

  // Header
  doc.rect(0, 0, pageW, 130).fill("#1e3a5f");
  doc.fillColor("white").fontSize(22).font("Helvetica-Bold")
    .text(settings?.companyName || "Company", margin, 25, { width: cw - 170 });
  doc.fillColor("#7dd3fc").fontSize(10).font("Helvetica")
    .text("SALES RETURN CREDIT NOTE", margin, 55, { width: cw - 170 });

  // Invoice number box
  doc.roundedRect(pageW - 195, 18, 160, 65, 8).fill("#ffffff1a");
  doc.fillColor("#94a3b8").fontSize(8).font("Helvetica").text("RETURN INVOICE #", pageW - 188, 28);
  doc.fillColor("white").fontSize(17).font("Helvetica-Bold")
    .text(sr.returnInvoiceNumber || "RET-XXXX", pageW - 188, 43, { width: 148 });

  // Info strip
  doc.rect(0, 130, pageW, 28).fill("#16325c");
  const infoLine = [settings?.phone, settings?.email, settings?.address]
    .filter(Boolean)
    .join("   |   ");
  doc.fillColor("#cbd5e1").fontSize(8).font("Helvetica")
    .text(infoLine || " ", margin, 140, { width: cw, align: "center" });

  // Red return badge
  doc.rect(0, 158, pageW, 22).fill("#dc2626");
  doc.fillColor("white").fontSize(9).font("Helvetica-Bold")
    .text("SALES RETURN — CREDIT NOTE", margin, 164, { width: cw, align: "center" });

  let y = 195;

  // Bill-to + Return Details cards
  const halfW = (cw - 16) / 2;

  doc.roundedRect(margin, y, halfW, 105, 6).fill("#f8fafc").stroke("#e2e8f0");
  doc.fillColor("#64748b").fontSize(8).font("Helvetica-Bold").text("BILL TO", margin + 12, y + 10);
  doc.fillColor("#0f172a").fontSize(11).font("Helvetica-Bold")
    .text(sr.customer?.name || "Customer", margin + 12, y + 26, { width: halfW - 24 });
  doc.fillColor("#475569").fontSize(9).font("Helvetica")
    .text(sr.customer?.phoneNumber || "", margin + 12, y + 46, { width: halfW - 24 })
    .text(sr.customer?.address || "", margin + 12, y + 62, { width: halfW - 24 });

  const rx = margin + halfW + 16;
  doc.roundedRect(rx, y, halfW, 105, 6).fill("#fef9c3").stroke("#fde68a");
  doc.fillColor("#92400e").fontSize(8).font("Helvetica-Bold").text("RETURN DETAILS", rx + 12, y + 10);

  const dets = [
    ["Return Invoice", sr.returnInvoiceNumber || "-"],
    ["Original Order", sr.order?.invoiceNumber || sr.order?._id?.toString().slice(-8) || "-"],
    ["Return Date", new Date(sr.completedAt || sr.createdAt).toLocaleDateString("en-GB")],
    ["Reason", (sr.returnReason || "Not specified").slice(0, 38)],
  ];
  let dy = y + 26;
  dets.forEach(([lbl, val]) => {
    doc.fillColor("#78350f").fontSize(8).font("Helvetica-Bold")
      .text(lbl + ": ", rx + 12, dy, { continued: true });
    doc.fillColor("#1c1917").font("Helvetica").text(val, { width: halfW - 24 });
    dy += 16;
  });

  y += 120;

  // Items table header
  const cols = {
    no: margin, product: margin + 28, unit: margin + 256, qty: margin + 308,
    price: margin + 355, vat: margin + 410, total: margin + 460,
  };

  doc.rect(margin, y, cw, 24).fill("#1e3a5f");
  doc.fillColor("white").fontSize(8.5).font("Helvetica-Bold");
  doc.text("#", cols.no + 4, y + 8)
    .text("Product", cols.product + 4, y + 8)
    .text("Unit", cols.unit + 4, y + 8)
    .text("Qty", cols.qty + 4, y + 8)
    .text("Price", cols.price + 4, y + 8)
    .text("VAT%", cols.vat + 4, y + 8)
    .text("Total", cols.total + 4, y + 8);
  y += 24;

  // Items rows
  sr.returnItems.forEach((item, idx) => {
    const rh = 22;
    doc.rect(margin, y, cw, rh).fill(idx % 2 === 0 ? "#ffffff" : "#f8fafc").stroke("#e2e8f0");
    doc.fillColor("#0f172a").fontSize(8.5).font("Helvetica");
    doc.text(String(idx + 1), cols.no + 4, y + 7)
      .text((item.product?.productName || "Product").slice(0, 32), cols.product + 4, y + 7, { width: 220 })
      .text(item.unit || "-", cols.unit + 4, y + 7)
      .text(String(item.returnedQuantity), cols.qty + 4, y + 7)
      .text(`AED ${(item.price || 0).toFixed(2)}`, cols.price + 4, y + 7)
      .text(`${item.vatPercentage || 5}%`, cols.vat + 4, y + 7)
      .text(`AED ${(item.totalAmount || 0).toFixed(2)}`, cols.total + 4, y + 7);
    y += rh;
  });

  y += 14;

  // Totals
  const totalExcl = sr.returnItems.reduce((s, i) => s + (i.exclVatAmount || 0), 0);
  const totalVat = sr.returnItems.reduce((s, i) => s + (i.vatAmount || 0), 0);
  const totalAmt = sr.returnItems.reduce((s, i) => s + (i.totalAmount || 0), 0);

  const sx = margin + cw - 250;
  const sumRows = [
    ["Subtotal (Excl. VAT)", `AED ${totalExcl.toFixed(2)}`],
    ["VAT Amount", `AED ${totalVat.toFixed(2)}`],
    ["Total Return Amount", `AED ${totalAmt.toFixed(2)}`],
  ];

  sumRows.forEach(([label, val], i) => {
    const isLast = i === sumRows.length - 1;
    if (isLast) {
      doc.roundedRect(sx - 8, y - 2, 258, 26, 4).fill("#1e3a5f");
      doc.fillColor("white").fontSize(11).font("Helvetica-Bold");
    } else {
      doc.fillColor("#475569").fontSize(9).font("Helvetica");
    }
    doc.text(label, sx, y + (isLast ? 5 : 0), { width: 148 });
    doc.text(val, sx + 152, y + (isLast ? 5 : 0), { width: 96, align: "right" });
    y += isLast ? 32 : 18;
  });

  y += 10;

  // Amount in words
  doc.rect(margin, y, cw, 28).fill("#f0fdf4").stroke("#bbf7d0");
  doc.fillColor("#166534").fontSize(8.5).font("Helvetica-Bold")
    .text("Amount in Words: ", margin + 10, y + 9, { continued: true });
  doc.font("Helvetica").fillColor("#14532d")
    .text(amountToWords(totalAmt), { width: cw - 20 });
  y += 40;

  // Refund information
  doc.roundedRect(margin, y, cw, 40, 6).fill("#fef9c3").stroke("#fde68a");
  doc.fillColor("#92400e").fontSize(9).font("Helvetica-Bold")
    .text("Refund Information", margin + 10, y + 6);
  doc.fillColor("#78350f").fontSize(8.5).font("Helvetica")
    .text(
      `Refund Method: ${(sr.refundMethod || "none").replace(/_/g, " ").toUpperCase()}   |   ` +
      `Status: ${(sr.refundStatus || "pending").toUpperCase()}   |   ` +
      `Amount: AED ${(sr.refundAmount || totalAmt).toFixed(2)}`,
      margin + 10, y + 22, { width: cw - 20 }
    );
  y += 52;

  // Footer
  const footerY = doc.page.height - 50;
  doc.rect(0, footerY, pageW, 50).fill("#1e3a5f");
  doc.fillColor("#94a3b8").fontSize(8).font("Helvetica")
    .text("This is a computer-generated Sales Return Credit Note.", margin, footerY + 9, {
      width: cw, align: "center",
    });
  doc.fillColor("white").fontSize(8.5).font("Helvetica-Bold")
    .text(settings?.companyName || "Company", margin, footerY + 26, {
      width: cw, align: "center",
    });
};

const getReturnInvoice = async (req, res) => {
  try {
    const sr = await SalesReturn.findById(req.params.id)
      .populate("order", "invoiceNumber orderDate payment")
      .populate("customer", "name phoneNumber address")
      .populate("returnItems.product", "productName unit");

    if (!sr) return res.status(404).json({ message: "Sales return not found" });
    if (!sr.returnInvoiceNumber) {
      return res.status(400).json({
        message: "Return invoice not generated yet. Complete the return first.",
      });
    }

    const settings = await CompanySettings.findOne();
    const pdfBuffer = await buildPDFBuffer(async (doc) => {
      await generateReturnInvoicePDF(doc, sr, settings);
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="return-${sr.returnInvoiceNumber}.pdf"`
    );
    res.setHeader("Content-Length", pdfBuffer.length);
    res.end(pdfBuffer);
  } catch (error) {
    console.error("getReturnInvoice error:", error);
    if (!res.headersSent)
      res.status(500).json({ message: "Server error: " + error.message });
  }
};

module.exports = {
  createSalesReturn,
  getAllSalesReturns,
  getSalesReturnById,
  approveSalesReturn,
  rejectSalesReturn,
  assignReturnPickup,
  cancelSalesReturn,
  confirmPickup,
  confirmReturnReceived,
  getMyReturnPickups,
  getPickedUpReturns,
  getSalesReturnsByOrder,
  getDeliveredOrdersForReturn,
  getReturnInvoice,
};
