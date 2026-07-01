// controllers/salesReturnController.js
const mongoose = require("mongoose");
const SalesReturn = require("../models/SalesReturn");
const Order = require("../models/Order");
const Customer = require("../models/Customer");
const Bill = require("../models/Bill");
const PaymentTransaction = require("../models/PaymentTransaction");
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
    if (req.user && req.user.role === "customer") {
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
    if (!req.user || !["Admin", "Sales Manager"].includes(req.user.role)) {
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

const generateDaddysReturnInvoicePDF = async (doc, sr, settings) => {
  const fs = require("fs");
  const company = settings || {};
  const companyName = company.companyName || "DADDYS FOODSTUFF TR. L.L.C.";
  const companyAddress = company.companyAddress || "No.6, Jurf Industrial Zone, Ajman - U.A.E.";
  const companyPhone = company.companyPhone || "06 6786779";
  const companyEmail = company.companyEmail || "daddyskitchenmasala@gmail.com";
  const companyWebsite = "www.daddyskitchenmasala.com";

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;

  // Colors
  const navyColor = "#002D62";
  const redColor = "#D21F3C";
  const gray = "#999999";
  const darkGray = "#333333";
  const headerBg = "#d9d9d9";

  // Date formatting
  const date = new Date(sr.completedAt || sr.createdAt || Date.now());
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const formattedDate = `${date.getDate()}-${monthNames[date.getMonth()]}-${String(date.getFullYear()).slice(-2)}`;

  // Font registration (RTL Arabic support)
  let fontRegistered = false;
  try {
    let fontPath = "C:/Windows/Fonts/arial.ttf";
    if (process.platform !== "win32") {
      const linuxPaths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/msttcorefonts/Arial.ttf",
        "/usr/share/fonts/liberation/LiberationSans-Regular.ttf"
      ];
      for (const p of linuxPaths) {
        if (fs.existsSync(p)) {
          fontPath = p;
          break;
        }
      }
    }
    if (fs.existsSync(fontPath)) {
      doc.registerFont("ArabicFont", fontPath);
      fontRegistered = true;
    }
  } catch (e) {
    console.error("Font registration error:", e);
  }

  // Helper to draw outer navy border
  const drawOuterBorder = () => {
    doc.rect(margin, margin, contentWidth, pageHeight - margin * 2)
       .lineWidth(1)
       .strokeColor(navyColor)
       .stroke();
  };

  // Helper to draw watermark
  const drawWatermark = () => {
    doc.save();
    doc.opacity(0.05);
    const wmX = pageWidth / 2 - 60;
    const wmY = 340;
    doc.fillColor(redColor);
    doc.circle(wmX + 30, wmY + 30, 20).fill();
    doc.circle(wmX + 55, wmY + 30, 25).fill();
    doc.circle(wmX + 80, wmY + 30, 20).fill();
    doc.circle(wmX + 55, wmY + 15, 20).fill();
    doc.circle(wmX + 40, wmY + 42, 16).fill();
    doc.circle(wmX + 70, wmY + 42, 16).fill();
    doc.fillColor("#000000");
    doc.moveTo(wmX + 20, wmY + 55)
       .quadraticCurveTo(wmX + 42, wmY + 63, wmX + 55, wmY + 58)
       .quadraticCurveTo(wmX + 68, wmY + 63, wmX + 90, wmY + 55)
       .quadraticCurveTo(wmX + 68, wmY + 70, wmX + 55, wmY + 63)
       .quadraticCurveTo(wmX + 42, wmY + 70, wmX + 20, wmY + 55)
       .fill();
    doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(12);
    doc.text("Daddy's", wmX + 15, wmY + 12, { width: 80, align: "center" });
    doc.text("Kitchen", wmX + 15, wmY + 25, { width: 80, align: "center" });
    doc.text("Masala", wmX + 15, wmY + 38, { width: 80, align: "center" });
    doc.fillColor("#000000").font("Helvetica-Bold").fontSize(7);
    doc.text("NATURAL SPICES", wmX + 15, wmY + 72, { width: 80, align: "center" });
    doc.restore();
  };

  const createNewPage = () => {
    doc.addPage({ size: "A4", margin: 0 });
    drawOuterBorder();
    drawWatermark();
  };

  // Draw initial page decoration
  drawOuterBorder();
  drawWatermark();

  let y = margin + 15;

  // ===== HEADER =====
  const logoX = margin + 10;
  const logoY = y + 5;

  // Compact Red cloud logo
  doc.fillColor(redColor);
  doc.circle(logoX + 18, logoY + 18, 12).fill();
  doc.circle(logoX + 32, logoY + 18, 15).fill();
  doc.circle(logoX + 46, logoY + 18, 12).fill();
  doc.circle(logoX + 32, logoY + 10, 12).fill();
  doc.circle(logoX + 24, logoY + 26, 10).fill();
  doc.circle(logoX + 40, logoY + 26, 10).fill();

  // Logo Text
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(7);
  doc.text("Daddy's", logoX + 8, logoY + 8, { width: 48, align: "center" });
  doc.text("Kitchen", logoX + 8, logoY + 16, { width: 48, align: "center" });
  doc.text("Masala", logoX + 8, logoY + 24, { width: 48, align: "center" });

  // Mustache
  doc.fillColor("#000000");
  doc.moveTo(logoX + 12, logoY + 33)
     .quadraticCurveTo(logoX + 25, logoY + 38, logoX + 32, logoY + 35)
     .quadraticCurveTo(logoX + 39, logoY + 38, logoX + 52, logoY + 33)
     .quadraticCurveTo(logoX + 39, logoY + 42, logoX + 32, logoY + 38)
     .quadraticCurveTo(logoX + 25, logoY + 42, logoX + 12, logoY + 33)
     .fill();

  // Natural Spices text
  doc.fillColor("#555555").font("Helvetica").fontSize(4.5);
  doc.text("NATURAL SPICES", logoX + 8, logoY + 42, { width: 48, align: "center" });

  // HACCP Badge
  const haccpX = logoX + 68;
  const haccpY = logoY + 10;
  doc.fillColor("#008000");
  doc.roundedRect(haccpX, haccpY, 36, 18, 2).fill();
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(5.5);
  doc.text("HACCP", haccpX, haccpY + 3, { width: 36, align: "center" });
  doc.text("CERTIFIED", haccpX, haccpY + 10, { width: 36, align: "center" });

  // Dynamic Company details on the right
  const rightColX = margin + 220;
  const rightColWidth = contentWidth - 230;

  doc.fillColor("#333333").font("Helvetica-Bold").fontSize(7.5);
  doc.text("Manufactured & Distributed By:", rightColX, y, { width: rightColWidth, align: "right" });

  if (fontRegistered) {
    try {
      doc.font("ArabicFont").fontSize(11).fillColor(redColor);
      doc.text("\uFEEF\uFEAE\uFE91\uFEF4\uFE93 \uFE94\uFEF2\uFE92\uFE8E\uFE91\uFEF2 \uFEAA\uFE8E\uFEE4\uFE8D \uFE94\uFEAE\uFE92\uFE8E\uFE91 \uFEF4\uFEFC\uFEF2\uFEB3\uFE8D\uFEAA", rightColX, y + 10, { width: rightColWidth, align: "right" });
    } catch (e) {
      console.error("Failed to render Arabic header:", e);
    }
  }

  doc.fillColor(navyColor).font("Helvetica-Bold").fontSize(13);
  doc.text(companyName.toUpperCase(), rightColX, y + 25, { width: rightColWidth, align: "right" });

  doc.fillColor("#333333").font("Helvetica").fontSize(7.5);
  doc.text(`Tel.: ${companyPhone}, Mob.: ${companyPhone}`, rightColX, y + 42, { width: rightColWidth, align: "right" });
  doc.text(companyAddress, rightColX, y + 51, { width: rightColWidth, align: "right" });
  doc.text(`E-mail: ${companyEmail} | ${companyWebsite}`, rightColX, y + 60, { width: rightColWidth, align: "right" });

  doc.fillColor(redColor).font("Helvetica-Bold").fontSize(10);
  doc.text("TRN: 100577923400003", rightColX, y + 72, { width: rightColWidth, align: "right" });

  y += 95;

  // ===== CUSTOMER & INVOICE DETAILS ROW =====
  // Left: To. Box
  doc.roundedRect(margin + 10, y, 200, 75, 4).lineWidth(1).strokeColor(navyColor).stroke();
  doc.fillColor(navyColor).font("Helvetica-Bold").fontSize(9).text("To.", margin + 18, y + 5);
  doc.fillColor("#333333").font("Helvetica-Bold").fontSize(9.5).text(sr.customer?.name || "N/A", margin + 18, y + 16, { width: 184 });

  let toY = y + 28;
  if (sr.customer?.address) {
    doc.font("Helvetica").fontSize(7.5).text(sr.customer.address, margin + 18, toY, { width: 184, height: 20 });
    toY += 18;
  }
  doc.font("Helvetica").fontSize(7.5).text(`Mob: ${sr.customer?.phoneNumber || "N/A"}`, margin + 18, toY);
  toY += 10;
  doc.font("Helvetica-Bold").fontSize(8).text(`TRN: ${sr.customer?.pincode || "N/A"}`, margin + 18, toY);

  // Center: SALES RETURN CREDIT NOTE Box
  doc.fillColor(navyColor).roundedRect(margin + 225, y + 15, 125, 45, 4).fill();
  if (fontRegistered) {
    try {
      doc.font("ArabicFont").fontSize(11).fillColor("#FFFFFF");
      doc.text("\uFE94\uFEF2\uFE92\uFEF1\uFEAE\uFEDF \uFE93\uFEAD\uFEEE\uFEB3\uFE8E\uFEB1", margin + 225, y + 23, { width: 125, align: "center" });
    } catch (e) {
      console.error("Failed to render Arabic title:", e);
    }
  }
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#FFFFFF").text("SALES RETURN", margin + 225, y + 38, { width: 125, align: "center" });
  doc.font("Helvetica-Bold").fontSize(7).fillColor("#FFFFFF").text("CREDIT NOTE", margin + 225, y + 50, { width: 125, align: "center" });

  // Right: Details Box
  const detailsBoxY = y;
  const detailsBoxH = 75;
  const detailsRowH = 18.75;
  doc.roundedRect(margin + 365, detailsBoxY, 180, detailsBoxH, 4).lineWidth(1).strokeColor(navyColor).stroke();

  // Grid lines
  doc.lineWidth(0.5).strokeColor(navyColor);
  doc.moveTo(margin + 365, detailsBoxY + detailsRowH).lineTo(margin + 365 + 180, detailsBoxY + detailsRowH).stroke();
  doc.moveTo(margin + 365, detailsBoxY + detailsRowH * 2).lineTo(margin + 365 + 180, detailsBoxY + detailsRowH * 2).stroke();
  doc.moveTo(margin + 365, detailsBoxY + detailsRowH * 3).lineTo(margin + 365 + 180, detailsBoxY + detailsRowH * 3).stroke();
  doc.moveTo(margin + 365 + 60, detailsBoxY).lineTo(margin + 365 + 60, detailsBoxY + detailsBoxH).stroke();

  const detailsLabels = ["CRN No.", "Date", "Orig. Order", "Refund"];
  const detailsValues = [
    sr.returnInvoiceNumber || "N/A",
    formattedDate,
    sr.order?.invoiceNumber || "N/A",
    (sr.refundMethod || "none").replace(/_/g, " ")
  ];
  for (let i = 0; i < 4; i++) {
    const rY = detailsBoxY + i * detailsRowH;
    doc.fillColor(navyColor).font("Helvetica-Bold").fontSize(7.5).text(detailsLabels[i], margin + 365 + 5, rY + 5, { width: 50 });
    doc.fillColor("#333333").font("Helvetica").fontSize(7.5).text(detailsValues[i], margin + 365 + 65, rY + 5, { width: 110 });
  }

  y += 85;

  // ===== RETURN REASON BOX =====
  doc.roundedRect(margin + 10, y, contentWidth - 20, 30, 4).lineWidth(1).strokeColor(navyColor).stroke();
  doc.fillColor(navyColor).font("Helvetica-Bold").fontSize(8).text("Return Reason:", margin + 18, y + 5);
  doc.fillColor("#333333").font("Helvetica").fontSize(8).text(sr.returnReason || "Not specified", margin + 100, y + 5, { width: contentWidth - 120 });

  y += 38;

  // ===== ITEMS TABLE =====
  const colDefs = [
    { width: 25, header: "S. No.", align: "center" },
    { width: 170.28, header: "Item Name", align: "left" },
    { width: 35, header: "Ret.Qty", align: "center" },
    { width: 35, header: "Unit", align: "center" },
    { width: 45, header: "U. Price", align: "right" },
    { width: 50, header: "Excl. VAT", align: "right" },
    { width: 35, header: "Disc%", align: "center" },
    { width: 35, header: "VAT%", align: "center" },
    { width: 55, header: "VAT Amount", align: "right" },
    { width: 70, header: "TOTAL", align: "right" },
  ];

  let colX = margin;
  const cols = colDefs.map((col) => {
    const result = { ...col, x: colX };
    colX += col.width;
    return result;
  });

  const rightEdge = pageWidth - margin;
  const headerRowHeight = 22;
  const dataRowHeight = 18;
  const footerSpaceNeeded = 310;

  const drawTableHeader = (startY) => {
    doc.rect(margin, startY, contentWidth, headerRowHeight).fillColor(navyColor).fill();
    doc.rect(margin, startY, contentWidth, headerRowHeight).lineWidth(0.5).strokeColor(navyColor).stroke();
    cols.forEach((col) => {
      doc.fontSize(7).font("Helvetica-Bold").fillColor("#FFFFFF")
        .text(col.header, col.x + 2, startY + 6, { width: col.width - 4, align: col.align });
      doc.moveTo(col.x, startY).lineTo(col.x, startY + headerRowHeight)
        .lineWidth(0.5).strokeColor(navyColor).stroke();
    });
    doc.moveTo(rightEdge, startY).lineTo(rightEdge, startY + headerRowHeight)
      .lineWidth(0.5).strokeColor(navyColor).stroke();
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
      createNewPage();
      y = margin + 15;
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

    doc.rect(margin, y, contentWidth, dataRowHeight).lineWidth(0.5).strokeColor(navyColor).stroke();
    cols.forEach((col, i) => {
      doc.fontSize(8).font("Helvetica").fillColor("#000000")
        .text(rowData[i], col.x + 2, y + 4, { width: col.width - 4, align: i === 1 ? "left" : "center" });
      doc.moveTo(col.x, y).lineTo(col.x, y + dataRowHeight)
        .lineWidth(0.5).strokeColor(navyColor).stroke();
    });
    doc.moveTo(rightEdge, y).lineTo(rightEdge, y + dataRowHeight)
      .lineWidth(0.5).strokeColor(navyColor).stroke();

    y += dataRowHeight;
    serialNumber++;
  });

  // Check if footer sections need a new page
  if (y + footerSpaceNeeded > pageHeight) {
    createNewPage();
    y = margin + 15;
  }

  // ===== BALANCE SECTION =====
  y += 5;
  const balanceRowHeight = 28;
  const balW1 = contentWidth * 0.35;
  const balW2 = contentWidth * 0.15;
  const balW3 = contentWidth * 0.1;
  const balW4 = contentWidth * 0.15;
  const balW5 = contentWidth * 0.25;

  doc.rect(margin, y, contentWidth, balanceRowHeight).lineWidth(0.5).strokeColor(navyColor).stroke();

  const balSeps = [margin, margin + balW1, margin + balW1 + balW2, margin + balW1 + balW2 + balW3, margin + balW1 + balW2 + balW3 + balW4, rightEdge];
  balSeps.forEach((sepX) => {
    doc.moveTo(sepX, y).lineTo(sepX, y + balanceRowHeight).lineWidth(0.5).strokeColor(navyColor).stroke();
  });

  doc.fontSize(7).font("Helvetica-Bold").fillColor(navyColor)
    .text(`Refund Amount : ${(sr.refundAmount || grandTotalInclVat).toFixed(2)}`, margin + 5, y + 4, { width: balW1 - 10 })
    .text(`Status : ${(sr.refundStatus || "pending").toUpperCase()}`, margin + 5, y + 16, { width: balW1 - 10 });

  doc.fontSize(7).font("Helvetica-Bold").fillColor(navyColor)
    .text("Total Returned", margin + balW1 + 3, y + 10, { width: balW2 - 6, align: "center" });

  doc.fontSize(7).font("Helvetica").fillColor(darkGray)
    .text(totalWeight.toString(), margin + balW1 + balW2 + 3, y + 10, { width: balW3 - 6, align: "center" });

  doc.fontSize(7).font("Helvetica-Bold").fillColor(navyColor)
    .text("Total Dhs.", margin + balW1 + balW2 + balW3 + 3, y + 10, { width: balW4 - 6, align: "center" });

  doc.fontSize(7).font("Helvetica-Bold").fillColor(navyColor)
    .text(grandTotalExclVat.toFixed(2), margin + balW1 + balW2 + balW3 + balW4 + 5, y + 10, { width: balW5 - 10, align: "right" });

  y += balanceRowHeight;

  // ===== WORDS SECTION =====
  y += 5;
  const wordsHeight = 48;
  doc.rect(margin, y, contentWidth, wordsHeight).lineWidth(0.5).strokeColor(navyColor).stroke();

  const grandTotalWords = amountToWords(grandTotalInclVat);
  const vatWords = amountToWords(grandTotalVat);

  doc.fontSize(8).font("Helvetica-Bold").fillColor(navyColor)
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
  doc.rect(margin, y, vatLabelWidth, vatRowHeight).lineWidth(0.5).strokeColor(navyColor).stroke();
  doc.rect(margin + vatLabelWidth, y, vatValueWidth, vatRowHeight).lineWidth(0.5).strokeColor(navyColor).stroke();
  doc.fontSize(9).font("Helvetica-Bold").fillColor(navyColor)
    .text("Vat 5%", margin, y + 6, { width: vatLabelWidth, align: "center" });
  doc.fontSize(9).font("Helvetica-Bold").fillColor(navyColor)
    .text(grandTotalVat.toFixed(2), margin + vatLabelWidth + 5, y + 6, { width: vatValueWidth - 10, align: "right" });
  y += vatRowHeight;

  // Total Return Amount row
  doc.rect(margin, y, vatLabelWidth, vatRowHeight).lineWidth(0.5).strokeColor(navyColor).stroke();
  doc.rect(margin + vatLabelWidth, y, vatValueWidth, vatRowHeight).lineWidth(0.5).strokeColor(navyColor).stroke();
  doc.fontSize(9).font("Helvetica-Bold").fillColor(navyColor)
    .text("Total Return Amount", margin, y + 6, { width: vatLabelWidth, align: "center" });
  doc.fontSize(9).font("Helvetica-Bold").fillColor(navyColor)
    .text(grandTotalInclVat.toFixed(2), margin + vatLabelWidth + 5, y + 6, { width: vatValueWidth - 10, align: "right" });
  y += vatRowHeight;

  // ===== REFUND METHOD SECTION =====
  y += 5;
  const refundHeight = 25;
  doc.rect(margin, y, contentWidth, refundHeight).lineWidth(1.5).strokeColor(navyColor).stroke();
  doc.fontSize(8).font("Helvetica-Bold").fillColor("#FFFFFF")
    .text(`Refund via: ${(sr.refundMethod || "none").replace(/_/g, " ").toUpperCase()}`, margin, y + 8, { width: contentWidth, align: "center" });
  // Fill background
  doc.rect(margin, y, contentWidth, refundHeight).fillColor(navyColor).fill();
  doc.fontSize(8).font("Helvetica-Bold").fillColor("#FFFFFF")
    .text(`Refund via: ${(sr.refundMethod || "none").replace(/_/g, " ").toUpperCase()}`, margin, y + 8, { width: contentWidth, align: "center" });
  y += refundHeight;

  // ===== FOOTER SECTION =====
  y += 8;
  const conditionHeight = 38;
  doc.rect(margin, y, contentWidth, conditionHeight).lineWidth(0.5).strokeColor(navyColor).stroke();
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
    `for ${companyName}`,
  ];

  signatures.forEach((label, i) => {
    const boxX = margin + i * (sigBoxWidth + sigGap);
    doc.roundedRect(boxX, y, sigBoxWidth, sigBoxHeight, 3)
      .lineWidth(1.5).strokeColor(navyColor).stroke();
    doc.fontSize(7).font("Helvetica-Bold").fillColor(navyColor)
      .text(label, boxX + 5, y + sigBoxHeight - 40, { width: sigBoxWidth - 10, align: "center" });
  });
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
  const rightEdge = pageWidth - margin;

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
  if (company.companyPhone) {
    doc.text(`Tel.: ${company.companyPhone}`, margin + 5, infoY, { width: leftColWidth - 10 });
    infoY += 10;
  }
  if (company.companyEmail) {
    doc.text(`E-mail: ${company.companyEmail}`, margin + 5, infoY, { width: leftColWidth - 10 });
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
  doc.text("TRN :", margin + 8, toY);

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
    doc.moveTo(rightEdge, startY).lineTo(rightEdge, startY + headerRowHeight)
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
    doc.moveTo(rightEdge, y).lineTo(rightEdge, y + dataRowHeight)
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

  const balSeps = [margin, margin + balW1, margin + balW1 + balW2, margin + balW1 + balW2 + balW3, margin + balW1 + balW2 + balW3 + balW4, rightEdge];
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
      await generateDaddysReturnInvoicePDF(doc, sr, settings);
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
