// controllers/salesReturnController.js
const path = require("path");
const mongoose = require("mongoose");
const SalesReturn = require("../models/SalesReturn");
const Order = require("../models/Order");
const Customer = require("../models/Customer");
const Bill = require("../models/Bill");
const PaymentTransaction = require("../models/PaymentTransaction");
const InvoiceCounter = require("../models/InvoiceCounter");
const CompanySettings = require("../models/CompanySettings");
const arabicReshaper = require("arabic-reshaper");
const PDFDocument = require("pdfkit");

const formatArabicForPdf = (text) => {
  if (!text) return "";
  try {
    const reshaped = arabicReshaper.convertArabic(text);
    return Array.from(reshaped).reverse().join("");
  } catch {
    return Array.from(text).reverse().join("");
  }
};

// PDFKit (0.17+) already joins/shapes RTL Arabic glyphs correctly within
// each word on its own, so admin-entered dynamic labels only need glyph
// reshaping, NOT the manual whole-string reverse() above (that scrambles
// each word's letters — it was written for older PDFKit versions without
// any RTL support). However, PDFKit's own handling still reverses the
// ORDER of space-separated words without reordering the space itself, so a
// multi-word phrase needs its word order pre-swapped here to cancel that
// out and land back in correct reading order (a single word is unaffected).
// Kept separate from formatArabicForPdf so existing hardcoded strings
// (company name, condition/signature lines) keep their long-standing look.
const formatDynamicArabicForPdf = (text) => {
  if (!text) return "";
  try {
    const reshaped = arabicReshaper.convertArabic(text);
    return reshaped.split(" ").reverse().join(" ");
  } catch {
    return text.split(" ").reverse().join(" ");
  }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getNextReturnInvoiceNumber = async () => {
  const counter = await InvoiceCounter.findOneAndUpdate(
    {},
    { $inc: { returnCount: 1 } },
    { new: true, upsert: true }
  );
  const num = String(counter.returnCount).padStart(4, "0");
  return `CRN-${num}`;
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

    // 30-day window check
    const daysSinceDelivery =
      (Date.now() - new Date(order.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceDelivery > 30) {
      return res.status(400).json({
        message: `Return window expired. Returns must be made within 30 days of delivery (${Math.floor(daysSinceDelivery)} days ago).`,
      });
    }

    // Validate and build return items
    // First, compute already-returned quantities for this order (non-cancelled, non-rejected)
    const existingReturns = await SalesReturn.find({
      order: orderId,
      status: { $nin: ["cancelled", "rejected"] },
    }).select("returnItems");
    const alreadyReturnedQty = {};
    for (const sr of existingReturns) {
      for (const ri of sr.returnItems) {
        const prodId = ri.product.toString();
        alreadyReturnedQty[prodId] = (alreadyReturnedQty[prodId] || 0) + ri.returnedQuantity;
      }
    }

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
      const alreadyReturned = alreadyReturnedQty[orderItem.product._id.toString()] || 0;
      const maxReturnable = (orderItem.deliveredQuantity || 0) - alreadyReturned;
      if (qty > maxReturnable) {
        return res.status(400).json({
          message: `Return qty (${qty}) exceeds remaining returnable qty (${maxReturnable}) for "${orderItem.product?.productName || "product"}"`,
        });
      }
      const vatPercent = orderItem.vatPercentage || 5;

      // Use proportional slice of orderItem.totalAmount (VAT-inclusive) — same logic
      // as packOrder and deliverOrder: totalAmount * (returnedQty / orderedQty)
      const ratio = orderItem.orderedQuantity > 0 ? qty / orderItem.orderedQuantity : 0;

      const exclVatAmount = orderItem.exclVatAmount
        ? parseFloat((orderItem.exclVatAmount * ratio).toFixed(2))
        : parseFloat((qty * orderItem.price).toFixed(2));
      const vatAmount = orderItem.vatAmount
        ? parseFloat((orderItem.vatAmount * ratio).toFixed(2))
        : parseFloat(((qty * orderItem.price * vatPercent) / 100).toFixed(2));
      const totalAmount = orderItem.totalAmount
        ? parseFloat((orderItem.totalAmount * ratio).toFixed(2))
        : parseFloat((exclVatAmount + vatAmount).toFixed(2));

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

    // If user is a customer, restrict to their returns only
    if (req.user && req.user.role === "Customer") {
      const customer = await Customer.findOne({ user: req.user._id }).select("_id");
      if (!customer) {
        return res.json([]);
      }
      filter.customer = customer._id;
    } 
    // If user is a salesman, restrict to their customers' returns only
    else if (req.user && req.user.role === "Sales man") {
      const myCustomers = await Customer.find({ salesman: req.user._id }).select("_id");
      filter.customer = { $in: myCustomers.map((c) => c._id) };
    }
    // If user is admin: no additional filter (see all returns)

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
    // Only Admin and Sales Manager can assign returns
    if (!req.user || !["Admin", "Manager", "Sales Manager"].includes(req.user.role)) {
      return res.status(403).json({ message: "Only Admin and Sales Manager can assign returns for pickup" });
    }

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

    const order = await Order.findById(sr.order);
    const totalReturnAmount = sr.returnItems.reduce((s, i) => s + (i.totalAmount || 0), 0);

    // Determine how the order was actually settled at delivery:
    // If a cash/cheque PaymentTransaction exists → customer paid cash at delivery
    // (even if order.payment === "credit", credit was already restored at delivery time)
    // → return amount goes to returnCreditBalance (store credit for next order)
    // If no cash/cheque transaction → true credit purchase (bill still open)
    // → restore balanceCreditLimit + reduce unpaid bill
    if (order) {
      const cashPaid = await PaymentTransaction.findOne({
        order: order._id,
        method: { $in: ["cash", "cheque"] },
      });

      const wasPaidWithCash = !!cashPaid || order.payment !== "credit";

      if (wasPaidWithCash) {
        // Cash/cheque was collected at delivery — no credit to restore, use return wallet
        await Customer.findByIdAndUpdate(sr.customer, {
          $inc: { returnCreditBalance: totalReturnAmount },
        });
      } else {
        // True credit purchase — check for unpaid bill
        const bills = await Bill.find({
          orders: order._id,
          status: { $nin: ["paid", "cancelled"] },
        }).sort({ createdAt: -1 });
        if (bills.length > 0) {
          // Unpaid bill exists: restore credit limit and reduce bill
          await Customer.findByIdAndUpdate(sr.customer, {
            $inc: { balanceCreditLimit: totalReturnAmount },
          });
        } else {
          // No unpaid bill: goes to returnCreditBalance
          await Customer.findByIdAndUpdate(sr.customer, {
            $inc: { returnCreditBalance: totalReturnAmount },
          });
        }
      }
    }

    // For true credit orders: reduce the unpaid bill's amountDue
    let billAdjusted = false;
    let relatedBillId = sr.relatedBill || null;

    if (order && order.payment === "credit") {
      const cashPaid = await PaymentTransaction.findOne({
        order: order._id,
        method: { $in: ["cash", "cheque"] },
      });

      if (!cashPaid && !sr.billAdjusted) {
        const bills = await Bill.find({
          orders: order._id,
          status: { $nin: ["paid", "cancelled"] },
        }).sort({ createdAt: -1 });

        if (bills.length > 0) {
          const bill = bills[0];
          bill.amountDue = Math.max(0, bill.amountDue - totalReturnAmount);
          if (bill.amountDue <= 0) {
            bill.amountDue = 0;
            bill.status = "paid";
          }
          await bill.save();
          relatedBillId = bill._id;
          billAdjusted = true;
        }
      }
    }

    sr.status = "picked_up";
    sr.pickedUpAt = new Date();
    // Always mark billAdjusted=true so confirmReturnReceived never double-counts
    sr.billAdjusted = true;
    if (relatedBillId) sr.relatedBill = relatedBillId;
    await sr.save();

    res.json({ message: "Pickup confirmed. Bill and credit limit updated.", salesReturn: sr });
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

    // sr.billAdjusted is always set to true by confirmPickup, so this block
    // only runs if somehow confirmReturnReceived is called without a prior confirmPickup
    // (edge case guard — should not happen in normal flow)
    let billAdjusted = sr.billAdjusted || false;
    let relatedBillId = sr.relatedBill || null;

    if (order && !sr.billAdjusted) {
      const cashPaid = await PaymentTransaction.findOne({
        order: order._id,
        method: { $in: ["cash", "cheque"] },
      });
      const wasPaidWithCash = !!cashPaid || order.payment !== "credit";

      if (wasPaidWithCash) {
        await Customer.findByIdAndUpdate(sr.customer, {
          $inc: { returnCreditBalance: totalReturnAmount },
        });
      } else {
        await Customer.findByIdAndUpdate(sr.customer, {
          $inc: { balanceCreditLimit: totalReturnAmount },
        });
        // Reduce unpaid bill
        const bills = await Bill.find({
          orders: order._id,
          status: { $nin: ["paid", "cancelled"] },
        }).sort({ createdAt: -1 });
        if (bills.length > 0) {
          const bill = bills[0];
          bill.amountDue = Math.max(0, bill.amountDue - totalReturnAmount);
          if (bill.amountDue <= 0) { bill.amountDue = 0; bill.status = "paid"; }
          await bill.save();
          relatedBillId = bill._id;
          billAdjusted = true;
        }
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
      status: { $in: ["pickup_assigned", "picked_up", "completed"] },
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
    const returns = await SalesReturn.find({ status: { $in: ["picked_up", "completed"] } })
      .populate("order", "invoiceNumber orderDate")
      .populate("customer", "name phoneNumber address")
      .populate("returnItems.product", "productName unit")
      .populate("assignedTo", "username")
      .sort({ updatedAt: -1 });
    res.json(returns);
  } catch (error) {
    res.status(500).json({ message: "Server error: " + error.message });
  }
};

// ─── Delivered Orders Eligible for Return (last 5 days) ──────────────────────

const getDeliveredOrdersForReturn = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Build base query
    const query = {
      status: { $in: ["delivered", "partial_delivered"] },
      $or: [
        { deliveredAt: { $gte: thirtyDaysAgo } },
        { deliveredAt: null, updatedAt: { $gte: thirtyDaysAgo } },
      ],
    };

    const userRole = String(req.user?.role || "").trim().toLowerCase();

    // Filter based on user role
    if (userRole === "customer") {
      // Customer role: only their own orders (ignore customerId query param for security)
      const customer = await Customer.findOne({ user: req.user._id }).select("_id");
      if (!customer) {
        return res.json([]);
      }
      query.customer = customer._id;
    } else if (userRole === "sales man" || userRole === "salesman" || userRole === "sales") {
      // Salesman: only their customers' orders
      const myCustomers = await Customer.find({ salesman: req.user._id }).select("_id");
      const myCustomerIds = myCustomers.map((c) => c._id);
      query.customer = { $in: myCustomerIds };
      
      // If salesman filters by specific customer, apply that filter too (must be one of their customers)
      if (req.query.customerId) {
        try {
          query.customer = new mongoose.Types.ObjectId(req.query.customerId);
        } catch (e) {
          return res.status(400).json({ message: "Invalid customer ID format" });
        }
      }
    } else if (userRole === "admin") {
      // Admin: optionally filter by specific customer if provided
      if (req.query.customerId) {
        try {
          query.customer = new mongoose.Types.ObjectId(req.query.customerId);
        } catch (e) {
          return res.status(400).json({ message: "Invalid customer ID format" });
        }
      }
    }
    // For any other role: no customer filter

    const orders = await Order.find(query)
      .populate("customer", "name phoneNumber")
      .populate("orderItems.product", "productName unit price")
      .sort({ updatedAt: -1 });

    // Build map of already-returned quantities per order per product
    const orderIds = orders.map((o) => o._id);
    const existingReturns = await SalesReturn.find({
      order: { $in: orderIds },
      status: { $nin: ["cancelled", "rejected"] },
    }).select("order returnItems");

    // returnedQtyMap: orderId -> productId -> qty already returned
    const returnedQtyMap = {};
    for (const sr of existingReturns) {
      const orderId = sr.order.toString();
      if (!returnedQtyMap[orderId]) returnedQtyMap[orderId] = {};
      for (const ri of sr.returnItems) {
        const prodId = ri.product.toString();
        returnedQtyMap[orderId][prodId] = (returnedQtyMap[orderId][prodId] || 0) + ri.returnedQuantity;
      }
    }

    // Only include orders where at least one item still has remaining returnable qty
    const filteredOrders = orders
      .map((o) => {
        const obj = o.toObject();
        obj.alreadyReturnedQty = returnedQtyMap[o._id.toString()] || {};
        return obj;
      })
      .filter((o) =>
        (o.orderItems || []).some((item) => {
          const deliveredQty = item.deliveredQuantity || 0;
          const prodId = item.product?._id?.toString() || item.product?.toString();
          const alreadyReturned = o.alreadyReturnedQty[prodId] || 0;
          return deliveredQty - alreadyReturned > 0;
        })
      );

    // Debug logging for troubleshooting
    console.log("[DEBUG] getDeliveredOrdersForReturn: Returned Orders:");
    filteredOrders.forEach((order) => {
      console.log(`OrderID: ${order._id}, CustomerID: ${order.customer?._id || order.customer}, Invoice: ${order.invoiceNumber}`);
      (order.orderItems || []).forEach((item) => {
        console.log(`  ProductID: ${item.product?._id || item.product}, DeliveredQty: ${item.deliveredQuantity}, AlreadyReturned: ${(order.alreadyReturnedQty || {})[item.product?._id?.toString() || item.product?.toString()] || 0}`);
      });
    });

    res.json(filteredOrders);
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

// ─── PDF: Return Invoice (Daddy's Design) ─────────────────────────────────────

const generateDaddysReturnInvoicePDF = async (doc, sr, settings, designType = "normal") => {
  const fs = require("fs");
  const company = settings || {};
  const companyName = company.companyName || "DADDYS FOODSTUFF TR. L.L.C.";
  const companyNameArabic = company.companyNameArabic || "";
  const companyAddress = company.companyAddress || "No.6, Jurf Industrial Zone, Ajman - U.A.E.";
  const companyPhone = company.companyPhone || "06 6786779";
  const companyTel = company.companyTel || "";
  const companyEmail = company.companyEmail || "daddyskitchenmasala@gmail.com";
  const companyWebsite = company.companyWebsite || "www.daddyskitchenmasala.com";

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;

  // Footer block position — computed from page constants only (not from any
  // loop/content state), so it's the same on every page. Used both to place
  // the totals/signature footer on the last page, and to decide how many
  // items fit on earlier pages (see the item loop below).
  const sigBoxW = 131.32;
  const sigBoxH = 75;
  const sigY = pageHeight - margin - sigBoxH - 10;
  const chequeY = sigY - 18 - 5;
  const totalsY = chequeY - 60 - 5;

  // Colors
  const navyColor = "#002D62";
  const redColor = "#D21F3C";
  const gray = "#999999";
  const darkGray = "#333333";
  const headerBg = "#d9d9d9";

  const creditNoteArabicLabel = company.creditNoteArabicLabel || "مردودات المبيعات";
  // Dynamic label uses word-order-swap only (see formatDynamicArabicForPdf);
  // WORD_GAP widens the inter-word gap the same way the delivery invoice's
  // tax invoice label does, since a plain space renders too narrow here.
  const CREDIT_NOTE_ARABIC = formatDynamicArabicForPdf(creditNoteArabicLabel);
  const WORD_GAP = "   ";
  const CREDIT_NOTE_ARABIC_SPACED = CREDIT_NOTE_ARABIC.split(" ").join(WORD_GAP);
  const CONDITION_TEXT_ARABIC = formatArabicForPdf("استلمنا البضاعة المذكورة في حالة جيدة");
  const RECEIVER_SIGNATURE_ARABIC = formatArabicForPdf("توقيع المستلم");
  const CONDITION_TEXT_ARABIC_SPACED = CONDITION_TEXT_ARABIC.split(" ").join(WORD_GAP);
  const RECEIVER_SIGNATURE_ARABIC_SPACED = RECEIVER_SIGNATURE_ARABIC.split(" ").join(WORD_GAP);

  // Date formatting
  const date = new Date(sr.completedAt || sr.createdAt || Date.now());
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const formattedDate = `${date.getDate()}-${monthNames[date.getMonth()]}-${String(date.getFullYear()).slice(-2)}`;

  // Font registration (RTL Arabic support)
  // Arial's Arabic Presentation Forms glyph coverage renders
  // arabic-reshaper's pre-shaped/reversed output correctly; NotoSansArabic
  // lacks glyphs for those presentation-form codepoints and drops letters.
  let fontRegistered = false;
  try {
    const fontPaths = [
      "C:/Windows/Fonts/arial.ttf",
      "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
      "/usr/share/fonts/truetype/msttcorefonts/Arial.ttf",
      "/usr/share/fonts/liberation/LiberationSans-Regular.ttf",
    ];
    let fontPath = null;
    for (const p of fontPaths) {
      if (fs.existsSync(p)) {
        fontPath = p;
        break;
      }
    }
    if (fontPath) {
      doc.registerFont("ArabicFont", fontPath);
      fontRegistered = true;
    }
  } catch (e) {
    console.error("Font registration error:", e);
  }

  // Helper to draw outer border (removed)
  const drawOuterBorder = () => {
  };

  // Helper to draw watermark
  const drawWatermark = () => {
  };

  const createNewPage = () => {
    doc.addPage({ size: "A4", margin: 0 });
    drawOuterBorder();
    drawWatermark();
  };

  // Draw initial page decoration
  drawOuterBorder();
  drawWatermark();

  // Wrapped in a function (rather than inline) so it can be redrawn on each
  // new page when a large return's items spill past one page — every split
  // page repeats the same CRN number/date/customer details, so each page
  // reads as a complete invoice on its own.
  const drawHeaderSection = () => {
  let y = 10;

  // ===== HEADER =====
  const logoX = margin + 10;
  const logoY = y;

  if (designType !== "preprinted") {
    // Logo image
    const logoPath = require("path").join(__dirname, "../uploads/logos/LOGO.jpg");
    doc.image(logoPath, logoX, logoY, { width: 80 });

    // Dynamic Company details on the right
    const rightColX = margin + 220;
    const rightColWidth = contentWidth - 230;

    if (fontRegistered) {
      try {
        doc.font("ArabicFont").fontSize(25).fillColor(redColor);
        doc.text(formatArabicForPdf(companyNameArabic), 0, y + 5, { width: pageWidth, align: "center" });
        doc.font("Helvetica-Bold").fontSize(25).fillColor("#000000");
        doc.text(companyName.toUpperCase(), 0, y + 40, { width: pageWidth, align: "center" });
        const haccpPath = require("path").join(__dirname, "../uploads/logos/HACCP.png");
        doc.image(haccpPath, margin + 100, y + 66, { width: 36 });
        doc.fillColor("#333333").font("Helvetica").fontSize(7.5);
        doc.text(`Tel.: ${companyTel}${companyPhone ? `, Mob.: ${companyPhone}` : ""}`, 0, y + 70, { width: pageWidth, align: "center" });
        doc.text(companyAddress, 0, y + 79, { width: pageWidth, align: "center" });
        doc.text(`E-mail: ${companyEmail}`, 0, y + 88, { width: pageWidth, align: "center" });
        if (companyWebsite) {
          doc.text(companyWebsite, 0, y + 96, { width: pageWidth, align: "center" });
        }
      } catch (e) {
        console.error("Failed to render Arabic header:", e);
      }
    }

    doc.fillColor(redColor).font("Helvetica-Bold").fontSize(10);
    doc.text("TRN: 100577923400003", rightColX, y + 72, { width: rightColWidth, align: "right" });
  }

  // Preprinted paper already has the letterhead printed further down than the
  // normal digital header, so it needs extra blank space here to avoid the
  // "To."/invoice detail boxes overlapping the pre-printed letterhead.
  y += designType === "preprinted" ? 130 : 95;

  // ===== CREDIT NOTE TITLE =====
  // Preprinted: plain centered text above the row, with the To. box widened
  // into the space the old center box used to occupy. Normal invoice is
  // untouched — it keeps the original filled navy "CREDIT NOTE" box between
  // the To. box and the Details box (drawn further below), at its original
  // width and position.
  let toBoxWidth = 200;
  if (designType === "preprinted") {
    const titleEnglishWithSlash = "Credit Note / ";
    doc.font("Helvetica-Bold").fontSize(12);
    const titleEnglishWidth = doc.widthOfString(titleEnglishWithSlash);
    let titleArabicWidth = 0;
    if (fontRegistered) {
      doc.font("ArabicFont").fontSize(12);
      titleArabicWidth = doc.widthOfString(CREDIT_NOTE_ARABIC_SPACED);
    }
    const titleStartX = margin + (contentWidth - (titleEnglishWidth + titleArabicWidth)) / 2;
    doc.font("Helvetica-Bold").fontSize(12).fillColor(navyColor)
       .text(titleEnglishWithSlash, titleStartX, y, { lineBreak: false });
    if (fontRegistered) {
      try {
        doc.font("ArabicFont").fontSize(12).fillColor(navyColor)
           .text(CREDIT_NOTE_ARABIC_SPACED, titleStartX + titleEnglishWidth, y, { lineBreak: false });
      } catch (e) {
        console.error("Failed to render Arabic credit note title:", e);
      }
    }
    y += 22;
    toBoxWidth = (margin + contentWidth - 180) - margin - 15;
  }

  // ===== CUSTOMER & INVOICE DETAILS ROW =====
  // Left: To. Box
  const toTextWidth = toBoxWidth - 16;
  const customerName = sr.customer?.name || "N/A";
  const customerAddress = sr.customer?.address || "";

  // Measure name/address height first so the box (normal invoice only — see
  // designType check below) can grow to fit a long address instead of the
  // text running past the box's bottom edge. Preprinted keeps the original
  // fixed 75pt box untouched.
  doc.font("Helvetica-Bold").fontSize(9.5);
  const nameHeight = doc.heightOfString(customerName, { width: toTextWidth });
  let addressHeight = 0;
  if (customerAddress) {
    doc.font("Helvetica").fontSize(7.5);
    addressHeight = doc.heightOfString(customerAddress, { width: toTextWidth });
  }
  let toBoxH = 75;
  if (designType !== "preprinted") {
    // 16 (top offset to name) + name + 2 (gap) + address (+2 gap if present)
    // + 10 (mobile line) + 8 (TRN line) + 8 (bottom padding)
    const toContentHeight = 16 + nameHeight + 2 + (customerAddress ? addressHeight + 2 : 0) + 10 + 8 + 8;
    toBoxH = Math.max(75, toContentHeight);
  }

  doc.roundedRect(margin, y, toBoxWidth, toBoxH, 4).lineWidth(1).strokeColor(navyColor).stroke();
  doc.fillColor(navyColor).font("Helvetica-Bold").fontSize(9).text("To.", margin + 8, y + 5);

  doc.font("Helvetica-Bold").fontSize(9.5);
  doc.fillColor("#333333").text(customerName, margin + 8, y + 16, { width: toTextWidth });

  let toY = y + 16 + nameHeight + 2;
  if (customerAddress) {
    doc.font("Helvetica").fontSize(7.5);
    doc.text(customerAddress, margin + 8, toY, { width: toTextWidth });
    toY += addressHeight + 2;
  }
  doc.font("Helvetica").fontSize(7.5).text(`Mob: ${sr.customer?.phoneNumber || "N/A"}`, margin + 8, toY);
  toY += 10;
  doc.font("Helvetica-Bold").fontSize(8).text(`TRN: ${sr.customer?.pincode || "N/A"}`, margin + 8, toY);

  if (designType !== "preprinted") {
    // Center: CREDIT NOTE Box (original filled navy box, normal invoice only)
    doc.fillColor(navyColor).roundedRect(margin + 225, y + 18, 125, 30, 4).fill();
    if (fontRegistered) {
      try {
        // Box width/height are fixed, but the label is now admin-editable
        // (Company Settings) and can differ from the original hardcoded
        // text — shrink until both the width fits AND the line height
        // leaves clearance for the "CREDIT NOTE" line drawn 11pt below,
        // instead of assuming a fixed size fits.
        doc.font("ArabicFont");
        let arabicBoxFontSize = 8;
        while (
          arabicBoxFontSize > 4 &&
          (doc.fontSize(arabicBoxFontSize).widthOfString(CREDIT_NOTE_ARABIC_SPACED) > 115 ||
            doc.currentLineHeight() > 10)
        ) {
          arabicBoxFontSize -= 0.5;
        }
        doc.font("ArabicFont").fontSize(arabicBoxFontSize).fillColor("#FFFFFF");
        doc.text(CREDIT_NOTE_ARABIC_SPACED, margin + 225, y + 25, { width: 125, align: "center", lineBreak: false });
      } catch (e) {
        console.error("Failed to render Arabic title:", e);
      }
    }
    doc.font("Helvetica-Bold").fontSize(7).fillColor("#FFFFFF").text("CREDIT NOTE", margin + 225, y + 36, { width: 125, align: "center" });
  }

  // Right: Details Box
  const detailsBoxY = y;
  const detailsBoxH = 56;
  const detailsRowH = 18.67;
  const detailsBoxX = margin + contentWidth - 180;
  doc.roundedRect(detailsBoxX, detailsBoxY, 180, detailsBoxH, 4).lineWidth(1).strokeColor(navyColor).stroke();

  // Grid lines
  doc.lineWidth(0.5).strokeColor(navyColor);
  doc.moveTo(detailsBoxX, detailsBoxY + detailsRowH).lineTo(detailsBoxX + 180, detailsBoxY + detailsRowH).stroke();
  doc.moveTo(detailsBoxX, detailsBoxY + detailsRowH * 2).lineTo(detailsBoxX + 180, detailsBoxY + detailsRowH * 2).stroke();
  doc.moveTo(detailsBoxX + 60, detailsBoxY).lineTo(detailsBoxX + 60, detailsBoxY + detailsBoxH).stroke();

  const detailsLabels = ["CRN No.", "Date", "Orig. Order"];
  const detailsValues = [
    sr.returnInvoiceNumber || "N/A",
    formattedDate,
    sr.order?.invoiceNumber || "N/A"
  ];
  for (let i = 0; i < 3; i++) {
    const rY = detailsBoxY + i * detailsRowH;
    doc.fillColor(navyColor).font("Helvetica-Bold").fontSize(7.5).text(detailsLabels[i], detailsBoxX + 5, rY + 5, { width: 50 });
    doc.fillColor("#333333").font("Helvetica").fontSize(7.5).text(detailsValues[i], detailsBoxX + 65, rY + 5, { width: 110 });
  }

  // Was a fixed "y += 85" (75 box + 10 gap); now follows the To. box's
  // actual (possibly grown) height — it's always >= the fixed 56pt Details
  // box — so a longer address leaves the item table with correspondingly
  // less room, instead of the table overlapping the box.
  y += toBoxH + 10;
  return y;
  };

  let y = drawHeaderSection();

  // ===== ITEMS TABLE =====
  // Column widths sized to fit every header at 11pt (headerFontSize below)
  // with a small margin, computed from actual measured text width per
  // column — not just "S. No." anymore, since every numeric column needed
  // more room at this size. "Ret.Qty" is wider than the delivery invoice's
  // "Qty.", so "Item Name" gets somewhat less of the leftover (555.28 total
  // content width minus the other 9) here than there, but still close to
  // its original 165.28.
  const colDefs = [
    { width: 36.5, header: "S. No.", align: "center" },
    { width: 159.78, header: "Item Name", align: "left" },
    { width: 45.5, header: "Ret.Qty", align: "center" },
    { width: 27.5, header: "Unit", align: "center" },
    { width: 46.5, header: "U. Price", align: "right" },
    { width: 53.5, header: "Excl. VAT", align: "right" },
    { width: 39.5, header: "Disc%", align: "center" },
    { width: 35.5, header: "VAT%", align: "center" },
    { width: 70.5, header: "VAT Amount", align: "right" },
    { width: 40.5, header: "TOTAL", align: "right" },
  ];

  let colX = margin;
  const cols = colDefs.map((col) => {
    const result = { ...col, x: colX };
    colX += col.width;
    return result;
  });

  // Row heights/offsets match for both design types (the footer block below
  // is pinned to the bottom of the page regardless of how much vertical
  // space the item rows use, so taller preprinted rows are safe).
  const headerRowHeight = 22;
  const dataRowHeight = 18;
  const headerTextOffset = 6;
  const dataTextOffset = 5;
  const headerFontSize = 11;

  const drawTableHeader = (startY) => {
    doc.lineWidth(1).strokeColor(navyColor);
    doc.rect(margin, startY, contentWidth, headerRowHeight).stroke();
    cols.forEach((col) => {
      doc.fillColor(navyColor).font("Helvetica-Bold").fontSize(headerFontSize)
        .text(col.header, col.x + 2, startY + headerTextOffset, { width: col.width - 4, align: col.align });
      doc.moveTo(col.x, startY).lineTo(col.x, startY + headerRowHeight).stroke();
    });
    doc.moveTo(margin + contentWidth, startY).lineTo(margin + contentWidth, startY + headerRowHeight).stroke();
    return startY + headerRowHeight;
  };

  let tableStartY = y;
  y = drawTableHeader(y);

  // Data rows
  let grandTotalExclVat = 0;
  let grandTotalVat = 0;
  let grandTotalInclVat = 0;
  let totalWeight = 0;
  let serialNumber = 1;

  // Only the page that ends up holding the very last item also carries the
  // totals footer below it, so only that page's items need to stop short at
  // totalsY to leave room for it. Every other page has no footer on it at
  // all — its items can fill all the way down toward the border-closing
  // line instead of leaving a footer-sized gap blank for no reason.
  const validItems = sr.returnItems.filter((item) => (item.returnedQuantity || 0) > 0);

  validItems.forEach((item, itemIndex) => {
    const qty = item.returnedQuantity || 0;
    const isLastItem = itemIndex === validItems.length - 1;
    const overflowLimit = isLastItem ? totalsY : totalsY + 60;

    // Page overflow check — trigger right where a row would reach overflowLimit
    // (footer's start line on the last item's page, or the border-closing
    // line totalsY + 60 on every other page).
    if (y + dataRowHeight > overflowLimit) {
      // Close this page's table border right where its last item row
      // actually ends (y hasn't advanced for the item that's overflowing
      // yet) — a tight fit with no leftover blank space, since this page
      // won't carry the totals footer anyway (that lands on whichever page
      // the loop finally ends on).
      doc.lineWidth(1).strokeColor(navyColor);
      doc.rect(margin, tableStartY, contentWidth, y - tableStartY).stroke();

      createNewPage();
      // Redraw the full header (logo/company info, Credit Note title, To./
      // Details boxes) so this continuation page reads as a complete invoice
      // with the same CRN number and customer details, not a bare table.
      y = drawHeaderSection();
      y = drawTableHeader(y);
      tableStartY = y - headerRowHeight;
    }

    const vatPercentage = item.vatPercentage || 5;
    const unitPrice = item.price || 0;
    const exclVatAmount = item.exclVatAmount || unitPrice * qty;
    const vatAmount = item.vatAmount || exclVatAmount * (vatPercentage / 100);
    const itemTotal = item.totalAmount || exclVatAmount + vatAmount;

    grandTotalExclVat += exclVatAmount;
    grandTotalVat += vatAmount;
    grandTotalInclVat += itemTotal;
    totalWeight += qty;

    const unit = item.unit || item.product?.unit || "Nos";
    const rowData = [
      serialNumber.toString(),
      item.product?.productName || "Unknown Product",
      qty.toString(),
      unit,
      unitPrice.toFixed(2),
      exclVatAmount.toFixed(2),
      "0",
      vatPercentage.toString(),
      vatAmount.toFixed(2),
      itemTotal.toFixed(2),
    ];

    doc.lineWidth(0.5).strokeColor(navyColor);
    doc.moveTo(margin, y + dataRowHeight).lineTo(margin + contentWidth, y + dataRowHeight).stroke();
    cols.forEach((col, i) => {
      doc.fillColor("#333333").font("Helvetica").fontSize(7.5);
      doc.moveTo(col.x, y).lineTo(col.x, y + dataRowHeight).stroke();
      doc.text(rowData[i], col.x + 4, y + dataTextOffset, { width: col.width - 8, align: i === 1 ? "left" : col.align });
    });
    doc.moveTo(margin + contentWidth, y).lineTo(margin + contentWidth, y + dataRowHeight).stroke();

    y += dataRowHeight;
    serialNumber++;
  });

  // Check if footer sections need a new page (kept as a safety net — the
  // in-loop check above already keeps y at or under totalsY in practice)
  if (y > totalsY) {
    createNewPage();
    // Same reasoning as the item-table overflow above: this page only has
    // the totals block on it, but it should still read as a complete
    // invoice rather than a bare footer, so repeat the header here too.
    drawHeaderSection();
  }

  // ===== FOOTER DESIGN POSITIONING (Aligned at the bottom) =====
  // sigBoxW/sigBoxH/sigY/chequeY/totalsY are computed near the top of this
  // function now (needed inside the item loop above too).
  const sigGap = 10;

  // ===== TOTALS BLOCK =====
  doc.lineWidth(1).strokeColor(navyColor);
  // Row 1: Total Returned + Total Dhs.
  doc.rect(margin, totalsY, 265.28, 20).stroke();
  doc.fillColor(navyColor).font("Helvetica-Bold").fontSize(8).text("Total Returned", margin + 10, totalsY + 6);
  doc.fillColor("#333333").font("Helvetica").fontSize(8).text(totalWeight.toString(), margin + 150, totalsY + 6, { width: 105, align: "right" });

  doc.rect(margin + 265.28, totalsY, 290, 20).stroke();
  doc.fillColor(navyColor).font("Helvetica-Bold").fontSize(8).text("Total Dhs.", margin + 265.28 + 10, totalsY + 6);
  doc.fillColor("#333333").font("Helvetica-Bold").fontSize(8).text(grandTotalExclVat.toFixed(2), margin + 265.28 + 150, totalsY + 6, { width: 130, align: "right" });

  // Row 2 & 3 Left: Merged Box (Total amount in words)
  const row2Y = totalsY + 20;
  doc.rect(margin, row2Y, 265.28, 40).stroke();
  doc.fillColor(navyColor).font("Helvetica-Bold").fontSize(7.5).text("Total amount in words", margin + 10, row2Y + 5);
  doc.fillColor("#333333").font("Helvetica").fontSize(7.5).text(amountToWords(grandTotalInclVat), margin + 10, row2Y + 16, { width: 245 });

  // Row 2 Right: Vat 5%
  doc.rect(margin + 265.28, row2Y, 290, 20).stroke();
  doc.fillColor(navyColor).font("Helvetica-Bold").fontSize(8).text("Vat 5%", margin + 265.28 + 10, row2Y + 6);
  doc.fillColor("#333333").font("Helvetica-Bold").fontSize(8).text(grandTotalVat.toFixed(2), margin + 265.28 + 150, row2Y + 6, { width: 130, align: "right" });

  // Row 3 Right: Total Return Amount
  const row3Y = totalsY + 40;
  doc.rect(margin + 265.28, row3Y, 290, 20).stroke();
  doc.fillColor(navyColor).font("Helvetica-Bold").fontSize(8.5).text("Total Return Amount", margin + 265.28 + 10, row3Y + 6);
  doc.fillColor("#333333").font("Helvetica-Bold").fontSize(8.5).text(grandTotalInclVat.toFixed(2), margin + 265.28 + 150, row3Y + 6, { width: 130, align: "right" });

  // Outer border around the entire table (from S. No. header to totals)
  doc.lineWidth(1).strokeColor(navyColor);
  doc.rect(margin, tableStartY, contentWidth, (totalsY + 60) - tableStartY).stroke();

  // ===== REFUND METHOD SECTION =====
  doc.rect(margin, chequeY, contentWidth, 18).stroke();
  doc.fillColor(navyColor).font("Helvetica-Bold").fontSize(7)
    .text(`Refund via: ${(sr.refundMethod || "none").replace(/_/g, " ").toUpperCase()}`, margin, chequeY + 5, { width: contentWidth, align: "center" });

  // ===== FOOTER SIGNATURE BOXES =====
  // Box 1: Condition and Receiver's Sign
  const box1X = margin;
  doc.roundedRect(box1X, sigY, sigBoxW, sigBoxH, 4).lineWidth(1).strokeColor(navyColor).stroke();
  if (designType === "preprinted") {
    // Lines are stacked using measured heights (not fixed offsets) since the
    // correctly-shaped Arabic condition phrase wraps to 2 lines at this box
    // width and a fixed offset made it collide with the English line drawn
    // right after it. Normal invoice (below, unchanged) keeps fixed offsets.
    const box1TextWidth = sigBoxW - 10;
    let box1Y = sigY + 4;
    if (fontRegistered) {
      try {
        doc.font("ArabicFont").fontSize(6.5).fillColor(navyColor);
        doc.text(CONDITION_TEXT_ARABIC_SPACED, box1X + 5, box1Y, { width: box1TextWidth, align: "center" });
        box1Y += 16;
      } catch (e) {
        console.error("Failed to render Arabic condition line 1:", e);
      }
    }
    doc.fillColor(navyColor).font("Helvetica").fontSize(6.5);
    doc.text("Received above items in good condition.", box1X + 5, box1Y, { width: box1TextWidth, align: "center" });
    box1Y += 20;
    doc.text("....................................................", box1X + 5, box1Y, { width: box1TextWidth, align: "center" });
    box1Y += 9;
    doc.font("Helvetica-Bold").fontSize(6.5);
    doc.text("Receiver's Name & Signature", box1X + 5, box1Y, { width: box1TextWidth, align: "center" });
    box1Y += 9;
    if (fontRegistered) {
      try {
        doc.font("ArabicFont").fontSize(6.5);
        doc.text(RECEIVER_SIGNATURE_ARABIC_SPACED, box1X + 5, box1Y, { width: box1TextWidth, align: "center" });
      } catch (e) {
        console.error("Failed to render Arabic condition signature:", e);
      }
    }
  } else {
    if (fontRegistered) {
      try {
        doc.font("ArabicFont").fontSize(6.5).fillColor(navyColor);
        doc.text("\uFE94\uFEAE\uFEF2\uFEDF \uFE93\uFEAE\uFE92\uFE8E\uFE91 \uFEF2\uFEDF \uFE94\uFEAE\uFE92\uFE8E\uFE91 \uFE94\uFEA4\uFE8D\uFE94\uFE92\uFE8E\uFE91 \uFE8D\uFEAE\uFE92\uFE8E\uFE91 \uFE8E\uFEEC\uFEAE\uFE92\uFE8E\uFE91", box1X + 5, sigY + 5, { width: sigBoxW - 10, align: "center" });
      } catch (e) {
        console.error("Failed to render Arabic condition line 1:", e);
      }
    }
    doc.fillColor(navyColor).font("Helvetica").fontSize(6.5);
    doc.text("Received above items in good condition.", box1X + 5, sigY + 15, { width: sigBoxW - 10, align: "center" });
    doc.text("....................................................", box1X + 5, sigY + 40, { width: sigBoxW - 10, align: "center" });
    doc.font("Helvetica-Bold").fontSize(6.5);
    doc.text("Receiver's Name & Signature", box1X + 5, sigY + 50, { width: sigBoxW - 10, align: "center" });
    if (fontRegistered) {
      try {
        doc.font("ArabicFont").fontSize(6.5);
        doc.text("\uFE8E\uFEE4\uFEF4\uFEB4\uFEE3\uFE8E\uFE8E \uFEF4\uFEFC\uFEF2\uFEB3\uFEEE\uFEB3", box1X + 5, sigY + 60, { width: sigBoxW - 10, align: "center" });
      } catch (e) {
        console.error("Failed to render Arabic condition signature:", e);
      }
    }
  }

  // Box 2: Vehicle No. & Driver
  const box2X = margin + sigBoxW + sigGap;
  doc.roundedRect(box2X, sigY, sigBoxW, sigBoxH, 4).lineWidth(1).strokeColor(navyColor).stroke();
  doc.fillColor(navyColor).font("Helvetica-Bold").fontSize(7.5);
  doc.text("Vehicle No. & Driver", box2X + 5, sigY + 8, { width: sigBoxW - 10, align: "center" });
  doc.fillColor("#333333").font("Helvetica").fontSize(7.5);
  if (sr.assignedTo?.username) {
    doc.text(`Driver: ${sr.assignedTo.username}`, box2X + 5, sigY + 30, { width: sigBoxW - 10, align: "center" });
  } else {
    doc.text("Driver: .........................", box2X + 5, sigY + 30, { width: sigBoxW - 10, align: "center" });
  }
  doc.text("Vehicle No: .................", box2X + 5, sigY + 45, { width: sigBoxW - 10, align: "center" });

  // Box 3: Store Sign
  const box3X = margin + (sigBoxW + sigGap) * 2;
  doc.roundedRect(box3X, sigY, sigBoxW, sigBoxH, 4).lineWidth(1).strokeColor(navyColor).stroke();
  doc.fillColor(navyColor).font("Helvetica-Bold").fontSize(7.5);
  doc.text("Store Sign", box3X + 5, sigY + 8, { width: sigBoxW - 10, align: "center" });
  doc.text(".................................", box3X + 5, sigY + sigBoxH - 25, { width: sigBoxW - 10, align: "center" });

  // Box 4: DADDY'S FOODSTUFF
  const box4X = margin + (sigBoxW + sigGap) * 3;
  doc.roundedRect(box4X, sigY, sigBoxW, sigBoxH, 4).lineWidth(1).strokeColor(navyColor).stroke();
  doc.fillColor(navyColor).font("Helvetica-Bold").fontSize(7.5);
  doc.text(`for ${companyName}`, box4X + 5, sigY + sigBoxH - 18, { width: sigBoxW - 10, align: "center" });
};

// ─── PDF: Return Invoice (Legacy Styled Design) ──────────────────────────────

const generateReturnInvoicePDF = async (doc, sr, settings) => {
  const company = settings;
  if (!company) {
    throw new Error("Company invoice settings not configured.");
  }

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 25;
  const contentWidth = pageWidth - margin * 2;

  // Colors
  const purple = "#4B3B8B";
  const lightPurple = "#E8E0F0";
  const gray = "#999999";
  const darkGray = "#333333";
  const headerBg = "#d9d9d9";
  const green = "#4CAF50";

  // Date formatting
  const date = new Date(sr.completedAt || sr.createdAt || Date.now());
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const formattedDate = `${date.getDate()}-${monthNames[date.getMonth()]}-${String(date.getFullYear()).slice(-2)}`;

  // ===== OUTER BORDER =====
  doc.rect(margin - 3, margin - 3, contentWidth + 6, pageHeight - margin * 2 + 6)
    .lineWidth(2).strokeColor(darkGray).stroke();

  let y = margin;

  // ===== HEADER SECTION (3 columns) =====
  const leftColWidth = 190;
  const centerColX = margin + 195;
  const centerColWidth = 155;
  const rightColX = margin + 355;
  const rightColWidth = contentWidth - 355;

  // --- Left: Company Info ---
  doc.fontSize(12).font("Helvetica-Bold").fillColor(darkGray)
    .text(company.companyName || "Company Name", margin + 5, y + 3, { width: leftColWidth });

  let infoY = y + 20;
  doc.fontSize(7).font("Helvetica-Bold").fillColor(darkGray)
    .text("Manufactured & Distributed By:", margin + 5, infoY);
  infoY += 11;
  doc.fontSize(7).font("Helvetica").fillColor(darkGray);
  if (company.companyAddress) {
    doc.text(company.companyAddress, margin + 5, infoY, { width: leftColWidth - 10 });
    infoY += 10;
  }
  if (company.companyTel) {
    doc.text(`Tel.: ${company.companyTel}`, margin + 5, infoY, { width: leftColWidth - 10 });
    infoY += 10;
  }
  if (company.companyPhone) {
    doc.text(`Mob.: ${company.companyPhone}`, margin + 5, infoY, { width: leftColWidth - 10 });
    infoY += 10;
  }
  if (company.companyEmail) {
    doc.text(`E-mail: ${company.companyEmail}`, margin + 5, infoY, { width: leftColWidth - 10 });
    infoY += 10;
  }
  if (company.companyWebsite) {
    doc.text(`Web: ${company.companyWebsite}`, margin + 5, infoY, { width: leftColWidth - 10 });
    infoY += 10;
  }

  // HACCP Badge
  doc.rect(margin + 5, infoY + 2, 72, 13).fillColor(green).fill();
  doc.fontSize(7).font("Helvetica-Bold").fillColor("#ffffff")
    .text("HACCP CERTIFIED", margin + 8, infoY + 5, { width: 68 });

  // --- Center: TAX INVOICE ---
  const titleBoxY = y;
  doc.rect(centerColX, titleBoxY, centerColWidth, 28).fillColor(purple).fill();
  doc.fontSize(15).font("Helvetica-Bold").fillColor("#ffffff")
    .text("TAX INVOICE", centerColX, titleBoxY + 7, { width: centerColWidth, align: "center" });

  doc.rect(centerColX, titleBoxY + 28, centerColWidth, 18).fillColor(lightPurple).fill();

  doc.rect(centerColX, titleBoxY + 46, centerColWidth, 18).fillColor(purple).fill();
  doc.fontSize(7).font("Helvetica-Bold").fillColor("#ffffff")
    .text("SALES RETURN CREDIT NOTE", centerColX, titleBoxY + 50, { width: centerColWidth, align: "center" });

  doc.rect(centerColX, titleBoxY, centerColWidth, 64)
    .lineWidth(2).strokeColor(purple).stroke();

  // --- Right: Invoice Details ---
  const detailBoxY = y;
  const detailBoxHeight = 88;
  doc.rect(rightColX, detailBoxY, rightColWidth, detailBoxHeight)
    .lineWidth(1.5).strokeColor(gray).stroke();

  let detailY = detailBoxY + 8;
  const detailRows = [
    { label: "CreditNote", value: sr.returnInvoiceNumber || "N/A" },
    { label: "Date", value: formattedDate },
    { label: "Orig. Order", value: sr.order?.invoiceNumber || "N/A" },
    { label: "Refund", value: (sr.refundMethod || "none").replace(/_/g, " ") },
  ];

  detailRows.forEach((row) => {
    doc.fontSize(8).font("Helvetica-Bold").fillColor(darkGray)
      .text(row.label, rightColX + 8, detailY, { width: 55 });
    doc.fontSize(8).font("Helvetica").fillColor(darkGray)
      .text(row.value, rightColX + 63, detailY, { width: rightColWidth - 73, align: "right" });
    detailY += 14;
  });

  doc.moveTo(rightColX + 5, detailY + 2).lineTo(rightColX + rightColWidth - 5, detailY + 2)
    .lineWidth(0.5).strokeColor(gray).stroke();
  detailY += 8;
  doc.fontSize(8).font("Helvetica-Bold").fillColor(darkGray)
    .text("TRN:", rightColX + 8, detailY, { width: rightColWidth - 16, align: "right" });

  // ===== TO SECTION =====
  y = Math.max(infoY + 20, detailBoxY + detailBoxHeight) + 8;

  const toBoxWidth = contentWidth * 0.55;
  const toBoxHeight = 55;
  doc.rect(margin, y, toBoxWidth, toBoxHeight)
    .lineWidth(1.5).strokeColor(gray).stroke();

  doc.fontSize(8).font("Helvetica-Bold").fillColor(darkGray)
    .text("To.", margin + 8, y + 5);

  let toY = y + 16;
  doc.fontSize(9).font("Helvetica-Bold").fillColor(darkGray)
    .text(sr.customer?.name || "N/A", margin + 8, toY);
  toY += 12;
  doc.fontSize(8).font("Helvetica").fillColor(darkGray);
  if (sr.customer?.address) {
    doc.text(sr.customer.address, margin + 8, toY, { width: toBoxWidth - 16 });
    toY += 10;
  }
  if (sr.customer?.phoneNumber) {
    doc.text(sr.customer.phoneNumber, margin + 8, toY);
    toY += 10;
  }
  doc.text(`TRN : ${sr.customer?.pincode || "N/A"}`, margin + 8, toY);

  // Return reason box alongside "To" box
  const reasonX = margin + toBoxWidth + 8;
  const reasonWidth = contentWidth - toBoxWidth - 8;
  doc.rect(reasonX, y, reasonWidth, toBoxHeight)
    .lineWidth(1.5).strokeColor(gray).stroke();
  doc.fontSize(8).font("Helvetica-Bold").fillColor(darkGray)
    .text("Return Reason:", reasonX + 8, y + 5);
  doc.fontSize(8).font("Helvetica").fillColor(darkGray)
    .text(sr.returnReason || "Not specified", reasonX + 8, y + 18, { width: reasonWidth - 16 });

  y += toBoxHeight + 8;

  // ===== ITEMS TABLE =====
  const colDefs = [
    { width: 28, header: "S. No.", align: "center" },
    { width: 138, header: "Item Name", align: "left" },
    { width: 37, header: "Ret.Qty", align: "center" },
    { width: 37, header: "Unit", align: "center" },
    { width: 55, header: "U. Price", align: "center" },
    { width: 55, header: "Excl. VAT", align: "center" },
    { width: 33, header: "Disc%", align: "center" },
    { width: 33, header: "VAT%", align: "center" },
    { width: 62, header: "VAT Amount", align: "center" },
    { width: 67, header: "TOTAL", align: "center" },
  ];

  let colX = margin;
  const cols = colDefs.map((col) => {
    const result = { ...col, x: colX };
    colX += col.width;
    return result;
  });

  const headerRowHeight = 22;
  const dataRowHeight = 18;
  const footerSpaceNeeded = 310;

  const drawTableHeader = (startY) => {
    doc.rect(margin, startY, contentWidth, headerRowHeight).fillColor(headerBg).fill();
    doc.rect(margin, startY, contentWidth, headerRowHeight).lineWidth(0.5).strokeColor(gray).stroke();
    cols.forEach((col) => {
      doc.fontSize(7).font("Helvetica-Bold").fillColor(darkGray)
        .text(col.header, col.x + 2, startY + 6, { width: col.width - 4, align: col.align });
      doc.moveTo(col.x, startY).lineTo(col.x, startY + headerRowHeight)
        .lineWidth(0.5).strokeColor(gray).stroke();
    });
    doc.moveTo(margin + contentWidth, startY).lineTo(margin + contentWidth, startY + headerRowHeight)
      .lineWidth(0.5).strokeColor(gray).stroke();
    return startY + headerRowHeight;
  };

  y = drawTableHeader(y);

  // Data rows
  let grandTotalExclVat = 0;
  let grandTotalVat = 0;
  let grandTotalInclVat = 0;
  let totalWeight = 0;
  let serialNumber = 1;

  sr.returnItems.forEach((item) => {
    const qty = item.returnedQuantity || 0;
    if (qty <= 0) return;

    // Page overflow check
    if (y + dataRowHeight + footerSpaceNeeded > pageHeight) {
      doc.addPage({ size: "A4", margin: 0 });
      doc.rect(margin - 3, margin - 3, contentWidth + 6, pageHeight - margin * 2 + 6)
        .lineWidth(2).strokeColor(darkGray).stroke();
      y = margin;
      y = drawTableHeader(y);
    }

    const vatPercentage = item.vatPercentage || 5;
    const unitPrice = item.price || 0;
    const exclVatAmount = item.exclVatAmount || unitPrice * qty;
    const vatAmount = item.vatAmount || exclVatAmount * (vatPercentage / 100);
    const itemTotal = item.totalAmount || exclVatAmount + vatAmount;

    grandTotalExclVat += exclVatAmount;
    grandTotalVat += vatAmount;
    grandTotalInclVat += itemTotal;
    totalWeight += qty;

    const unit = item.unit || item.product?.unit || "Nos";
    const rowData = [
      serialNumber.toString(),
      item.product?.productName || "Unknown Product",
      qty.toString(),
      unit,
      unitPrice.toFixed(2),
      exclVatAmount.toFixed(2),
      "0",
      vatPercentage.toString(),
      vatAmount.toFixed(2),
      itemTotal.toFixed(2),
    ];

    doc.rect(margin, y, contentWidth, dataRowHeight).lineWidth(0.5).strokeColor(gray).stroke();
    cols.forEach((col, i) => {
      doc.fontSize(8).font("Helvetica").fillColor("#000000")
        .text(rowData[i], col.x + 2, y + 4, { width: col.width - 4, align: i === 1 ? "left" : "center" });
      doc.moveTo(col.x, y).lineTo(col.x, y + dataRowHeight)
        .lineWidth(0.5).strokeColor(gray).stroke();
    });
    doc.moveTo(margin + contentWidth, y).lineTo(margin + contentWidth, y + dataRowHeight)
      .lineWidth(0.5).strokeColor(gray).stroke();

    y += dataRowHeight;
    serialNumber++;
  });

  // Check if footer sections need a new page
  if (y + footerSpaceNeeded > pageHeight) {
    doc.addPage({ size: "A4", margin: 0 });
    doc.rect(margin - 3, margin - 3, contentWidth + 6, pageHeight - margin * 2 + 6)
      .lineWidth(2).strokeColor(darkGray).stroke();
    y = margin;
  }

  // ===== BALANCE SECTION =====
  y += 5;
  const balanceRowHeight = 28;
  const balW1 = contentWidth * 0.35;
  const balW2 = contentWidth * 0.15;
  const balW3 = contentWidth * 0.1;
  const balW4 = contentWidth * 0.15;
  const balW5 = contentWidth * 0.25;

  doc.rect(margin, y, contentWidth, balanceRowHeight).lineWidth(0.5).strokeColor(gray).stroke();

  const balSeps = [margin, margin + balW1, margin + balW1 + balW2, margin + balW1 + balW2 + balW3, margin + balW1 + balW2 + balW3 + balW4, margin + contentWidth];
  balSeps.forEach((sepX) => {
    doc.moveTo(sepX, y).lineTo(sepX, y + balanceRowHeight).lineWidth(0.5).strokeColor(gray).stroke();
  });

  doc.fontSize(7).font("Helvetica-Bold").fillColor(darkGray)
    .text(`Refund Amount : ${(sr.refundAmount || grandTotalInclVat).toFixed(2)}`, margin + 5, y + 4, { width: balW1 - 10 })
    .text(`Status : ${(sr.refundStatus || "pending").toUpperCase()}`, margin + 5, y + 16, { width: balW1 - 10 });

  doc.fontSize(7).font("Helvetica-Bold").fillColor(darkGray)
    .text("Total Returned", margin + balW1 + 3, y + 10, { width: balW2 - 6, align: "center" });

  doc.fontSize(7).font("Helvetica").fillColor(darkGray)
    .text(totalWeight.toString(), margin + balW1 + balW2 + 3, y + 10, { width: balW3 - 6, align: "center" });

  doc.fontSize(7).font("Helvetica-Bold").fillColor(darkGray)
    .text("Total Dhs.", margin + balW1 + balW2 + balW3 + 3, y + 10, { width: balW4 - 6, align: "center" });

  doc.fontSize(7).font("Helvetica-Bold").fillColor(darkGray)
    .text(grandTotalExclVat.toFixed(2), margin + balW1 + balW2 + balW3 + balW4 + 5, y + 10, { width: balW5 - 10, align: "right" });

  y += balanceRowHeight;

  // ===== WORDS SECTION =====
  y += 5;
  const wordsHeight = 48;
  doc.rect(margin, y, contentWidth, wordsHeight).lineWidth(0.5).strokeColor(gray).stroke();

  const grandTotalWords = amountToWords(grandTotalInclVat);
  const vatWords = amountToWords(grandTotalVat);

  doc.fontSize(8).font("Helvetica-Bold").fillColor(darkGray)
    .text("Total amount in words", margin + 8, y + 5);
  doc.fontSize(8).font("Helvetica").fillColor(darkGray)
    .text(grandTotalWords, margin + 8, y + 17, { width: contentWidth - 16 })
    .text(`${vatWords} (AED ${grandTotalVat.toFixed(2)})`, margin + 8, y + 32, { width: contentWidth - 16 });

  y += wordsHeight;

  // ===== VAT & TOTAL RETURN AMOUNT =====
  y += 5;
  const vatRowHeight = 22;
  const vatLabelWidth = contentWidth * 0.75;
  const vatValueWidth = contentWidth * 0.25;

  // VAT row
  doc.rect(margin, y, vatLabelWidth, vatRowHeight).lineWidth(0.5).strokeColor(gray).stroke();
  doc.rect(margin + vatLabelWidth, y, vatValueWidth, vatRowHeight).lineWidth(0.5).strokeColor(gray).stroke();
  doc.fontSize(9).font("Helvetica-Bold").fillColor(darkGray)
    .text("Vat 5%", margin, y + 6, { width: vatLabelWidth, align: "center" });
  doc.fontSize(9).font("Helvetica-Bold").fillColor(darkGray)
    .text(grandTotalVat.toFixed(2), margin + vatLabelWidth + 5, y + 6, { width: vatValueWidth - 10, align: "right" });
  y += vatRowHeight;

  // Total Return Amount row
  doc.rect(margin, y, vatLabelWidth, vatRowHeight).lineWidth(0.5).strokeColor(gray).stroke();
  doc.rect(margin + vatLabelWidth, y, vatValueWidth, vatRowHeight).lineWidth(0.5).strokeColor(gray).stroke();
  doc.fontSize(9).font("Helvetica-Bold").fillColor(darkGray)
    .text("Total Return Amount", margin, y + 6, { width: vatLabelWidth, align: "center" });
  doc.fontSize(9).font("Helvetica-Bold").fillColor(darkGray)
    .text(grandTotalInclVat.toFixed(2), margin + vatLabelWidth + 5, y + 6, { width: vatValueWidth - 10, align: "right" });
  y += vatRowHeight;

  // ===== REFUND METHOD SECTION =====
  y += 5;
  const refundHeight = 25;
  doc.rect(margin, y, contentWidth, refundHeight).lineWidth(1.5).strokeColor(gray).stroke();
  doc.fontSize(8).font("Helvetica-Bold").fillColor(darkGray)
    .text(`Refund via: ${(sr.refundMethod || "none").replace(/_/g, " ").toUpperCase()}`, margin, y + 8, { width: contentWidth, align: "center" });
  y += refundHeight;

  // ===== FOOTER SECTION =====
  y += 8;
  const conditionHeight = 38;
  doc.rect(margin, y, contentWidth, conditionHeight).lineWidth(0.5).strokeColor(gray).stroke();
  doc.fontSize(7).font("Helvetica").fillColor(darkGray)
    .text("This is a computer-generated Sales Return Credit Note.", margin + 8, y + 5, { width: contentWidth - 16 });
  doc.fontSize(6).font("Helvetica")
    .text("..................................................", margin + 8, y + 18, { width: contentWidth - 16, align: "center" })
    .text("Authorized Signature", margin + 8, y + 27, { width: contentWidth - 16, align: "center" });
  y += conditionHeight;

  // ===== SIGNATURE BOXES =====
  y += 8;
  const sigGap = 8;
  const sigBoxWidth = (contentWidth - sigGap * 3) / 4;
  const sigBoxHeight = 90;

  const signatures = [
    "Customer Acknowledgment",
    "Return Verified By",
    "Store Keeper Sign",
    `for ${company.companyName || "Company Name"}`,
  ];

  signatures.forEach((label, i) => {
    const boxX = margin + i * (sigBoxWidth + sigGap);
    doc.roundedRect(boxX, y, sigBoxWidth, sigBoxHeight, 3)
      .lineWidth(1.5).strokeColor(gray).stroke();
    doc.fontSize(7).font("Helvetica-Bold").fillColor(darkGray)
      .text(label, boxX + 5, y + sigBoxHeight - 40, { width: sigBoxWidth - 10, align: "center" });
  });
};

const getReturnInvoice = async (req, res) => {
  try {
    const sr = await SalesReturn.findById(req.params.id)
      .populate("order", "invoiceNumber orderDate payment")
      .populate("customer", "name phoneNumber address pincode")
      .populate("returnItems.product", "productName unit")
      .populate("assignedTo", "username");

    if (!sr) return res.status(404).json({ message: "Sales return not found" });
    if (!sr.returnInvoiceNumber) {
      return res.status(400).json({
        message: "Return invoice not generated yet. Complete the return first.",
      });
    }

    const settings = await CompanySettings.findOne();
    const designType = req.query.type === "preprinted" ? "preprinted" : "normal";
    const pdfBuffer = await buildPDFBuffer(async (doc) => {
      await generateDaddysReturnInvoicePDF(doc, sr, settings, designType);
    });

    const suffix = designType === "preprinted" ? "-preprinted" : "";
    const finalFilename = `return-${sr.returnInvoiceNumber}${suffix}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${finalFilename}"`
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
