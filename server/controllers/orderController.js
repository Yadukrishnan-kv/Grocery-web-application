const Order = require("../models/Order");
const Product = require("../models/Product");
const Customer = require("../models/Customer");
const User = require("../models/User");
const CompanySettings = require("../models/CompanySettings");
const InvoiceCounter = require("../models/InvoiceCounter");
const { createInvoiceBasedBill } = require("../controllers/billController"); // ← import it
const arabicReshaper = require("arabic-reshaper");
const PaymentTransaction = require("../models/PaymentTransaction");
const Bill = require("../models/Bill");

const formatArabicForPdf = (text) => {
  if (!text) return "";
  try {
    const reshaped = arabicReshaper.convertArabic(text);
    return reshaped.split("").reverse().join("");
  } catch {
    return text;
  }
};

const getNextOrderId = async () => {
  // Ensure counter starts at 4000
  let counter = await InvoiceCounter.findOneAndUpdate(
    {},
    { $setOnInsert: { invoiceCount: 0, returnCount: 0, orderCount: 4000 } },
    { upsert: true, new: true }
  );
  
  // If counter is below 4000, reset it to 4000
  if (counter.orderCount < 4000) {
    counter = await InvoiceCounter.findOneAndUpdate(
      {},
      { $set: { orderCount: 4000 } },
      { new: true }
    );
  }
  
  // Increment to get next order number
  counter = await InvoiceCounter.findOneAndUpdate(
    {},
    { $inc: { orderCount: 1 } },
    { new: true }
  );

  const sequence = String(counter.orderCount).padStart(5, "0");
  const year = new Date().getFullYear();
  return `SO/${sequence}/${year}`;
};
const OrderRequest = require("../models/OrderRequest");
const mongoose = require("mongoose");

const PDFDocument = require("pdfkit");

const createOrder = async (req, res) => {
  try {
    // Check if user has permission to create orders (Admin and Sales man allowed, Sales Manager not allowed)
    if (!req.user || !["Admin", "Sales man"].includes(req.user.role)) {
      return res.status(403).json({ message: "Only Admin and Sales man can create orders" });
    }

    const { customerId, payment, remarks, orderItems, scheduleDays } = req.body;

    // Validation
    if (!customerId || !payment || !orderItems || orderItems.length === 0) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // ✅ Process each order item with VAT calculations
    const processedItems = orderItems.map((item) => {
      const qty = parseInt(item.orderedQuantity);
      const price = parseFloat(item.price);
      const vatPercent = parseFloat(item.vatPercentage) || 5;

      const exclVatAmount = qty * price;
      const vatAmount = (exclVatAmount * vatPercent) / 100;
      const totalAmount = exclVatAmount + vatAmount;

      return {
        product: item.productId,
        orderedQuantity: qty,
        price: price,
        vatPercentage: vatPercent,
        exclVatAmount: parseFloat(exclVatAmount.toFixed(2)),
        vatAmount: parseFloat(vatAmount.toFixed(2)),
        totalAmount: parseFloat(totalAmount.toFixed(2)),
        packedQuantity: 0,
        deliveredQuantity: 0,
        invoicedQuantity: 0,
        remarks: item.remarks || "",
      };
    });

    const days = parseInt(scheduleDays) || 0;
    const packableAfter = new Date();
    packableAfter.setDate(packableAfter.getDate() + days);
    packableAfter.setHours(0, 0, 0, 0);

    const order = new Order({
      customer: customerId,
      orderId: await getNextOrderId(),
      payment,
      remarks: remarks || "",
      scheduleDays: days,
      packableAfter: days > 0 ? packableAfter : null,
      orderItems: processedItems,
      status: "pending",
      assignmentStatus: "pending_assignment",
      createdBy: req.user._id,
    });

    await order.save();

    // ✅ Populate and return with VAT fields
    const populatedOrder = await Order.findById(order._id)
      .populate("customer", "name phone email")
      .populate("orderItems.product", "productName unit")
      .populate("createdBy", "username role");

    res.status(201).json({
      message: "Order created successfully",
      order: populatedOrder,
    });
  } catch (error) {
    console.error("Create order error:", error);
    res.status(500).json({ message: "Server error: " + error.message });
  }
};


const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("customer", "name email phoneNumber address pincode")
      .populate("orderItems.product", "productName price unit")
      .populate("assignedTo", "username")
      .sort({ orderDate: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("customer", "name email phoneNumber address pincode balanceCreditLimit")
      .populate("orderItems.product", "productName price quantity unit");
    if (!order) return res.status(404).json({ message: "Order not found" });
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getSalesmanOrders = async (req, res) => {
  try {
    // Only allow salesmen to access
    if (req.user.role !== "Sales man") {
      return res.status(403).json({ message: "Access denied - Salesmen only" });
    }

    // Get all customers assigned to this salesman
    const myCustomers = await Customer.find({ salesman: req.user._id }).select("_id");
    const customerIds = myCustomers.map(c => c._id);

    // Fetch orders for these customers only
    const orders = await Order.find({ customer: { $in: customerIds } })
      .populate("customer", "name email phoneNumber address pincode")
      .populate("orderItems.product", "productName price unit")
      .populate("assignedTo", "username")
      .sort({ orderDate: -1 });

    res.json(orders);
  } catch (error) {
    console.error("Get salesman orders error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getSalesmanDeliveredOrders = async (req, res) => {
  try {
    // Only allow salesmen to access
    if (req.user.role !== "Sales man") {
      return res.status(403).json({ message: "Access denied - Salesmen only" });
    }

    // Get all customers assigned to this salesman
    const myCustomers = await Customer.find({ salesman: req.user._id }).select("_id");
    const customerIds = myCustomers.map(c => c._id);

    if (customerIds.length === 0) {
      return res.json([]); // No customers assigned
    }

    // Find orders containing any delivered quantity for these customers
    const orders = await Order.find({ 
      customer: { $in: customerIds },
      "orderItems.deliveredQuantity": { $gt: 0 } 
    })
    .populate("customer", "name email phoneNumber address pincode")
    .populate("orderItems.product", "productName price unit")
    .populate("assignedTo", "username")
    .sort({ orderDate: -1 });

    // Map to flat structure (same as getDeliveredOrdersForAdmin)
    const records = [];
    orders.forEach((order) => {
      const orderDate = order.orderDate;
      (order.orderItems || []).forEach((item) => {
        if ((item.deliveredQuantity || 0) > 0) {
          const price = item.price || item.product?.price || 0;
          const deliveredQty = item.deliveredQuantity || 0;
          const orderedQty = item.orderedQuantity || 0;
          const totalAmount = item.totalAmount || deliveredQty * price;
          records.push({
            _id: order._id,
            orderNumber: order.orderNumber || null,
            customer: order.customer || null,
            product: item.product || null,
            unit: item.unit || "",
            orderedQuantity: orderedQty,
            deliveredQuantity: deliveredQty,
            pendingQty: Math.max(0, orderedQty - deliveredQty),
            price,
            totalAmount,
            assignedTo: order.assignedTo || null,
            orderDate,
            status: order.status,
          });
        }
      });
    });

    res.json(records);
  } catch (error) {
    console.error("Get salesman delivered orders error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const updateOrder = async (req, res) => {
  try {
    const { orderedQuantity, payment } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    if (order.status !== "pending") {
      return res
        .status(400)
        .json({ message: "Cannot update non-pending order" });
    }

    // For simplicity, assume updating quantity requires adjusting inventory and credit
    // This is complex; in production, handle reversals
    const product = await Product.findById(order.product);
    const customer = await Customer.findById(order.customer);

    // Revert old
    product.quantity += order.orderedQuantity;
    if (order.payment === "credit") {
      customer.balanceCreditLimit += order.totalAmount;
    }

    // Apply new
    if (orderedQuantity !== undefined) {
      if (product.quantity < orderedQuantity) {
        return res
          .status(400)
          .json({ message: "Insufficient product quantity" });
      }
      order.orderedQuantity = orderedQuantity;
      order.totalAmount = order.price * orderedQuantity;
    }
    if (payment !== undefined) {
      order.payment = payment;
    }

    product.quantity -= order.orderedQuantity;
    if (order.payment === "credit") {
      if (customer.balanceCreditLimit < order.totalAmount) {
        return res.status(400).json({ message: "Insufficient credit balance" });
      }
      customer.balanceCreditLimit -= order.totalAmount;
    }

    await product.save();
    await customer.save();
    await order.save();

    res.json(order);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const deleteOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Revert inventory and credit only if not fully delivered
    if (order.status !== "delivered") {
      for (const item of order.orderItems) {
        const remainingQty = item.orderedQuantity - item.deliveredQuantity;
        if (remainingQty > 0) {
          const product = await Product.findById(item.product);
          if (product) {
            product.quantity += remainingQty;
            await product.save();
          }
        }
      }

      // Revert credit balance if credit payment
      if (order.payment === "credit") {
        const customer = await Customer.findById(order.customer);
        if (customer) {
          const remainingAmount = order.orderItems.reduce((sum, item) => {
            const remainingQty = item.orderedQuantity - item.deliveredQuantity;
            return sum + remainingQty * item.price;
          }, 0);

          customer.balanceCreditLimit += remainingAmount;
          await customer.save();
        }
      }
    }

    await Order.findByIdAndDelete(req.params.id);
    res.json({ message: "Order deleted successfully" });
  } catch (error) {
    console.error("Delete order error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const deliverOrder = async (req, res) => {
  try {
    const { deliveredItems, deliveredAt, paymentMethod, chequeDetails } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (order.status === "delivered" || order.status === "cancelled") {
      return res.status(400).json({ message: "Order cannot be delivered" });
    }

    let grandDeliveryAmount = 0;
    let returnCreditUsed = 0;
    for (const inputItem of deliveredItems) {
      const orderItem = order.orderItems.id(inputItem.product);
      if (!orderItem) {
        return res.status(400).json({ message: `Product not in order` });
      }

      const qtyToDeliver = Number(inputItem.quantity);
      const packedRemaining = (orderItem.packedQuantity || 0) - (orderItem.deliveredQuantity || 0);

      if (qtyToDeliver <= 0 || qtyToDeliver > packedRemaining) {
        return res.status(400).json({
          message: `Invalid quantity for ${orderItem.product?.productName || "product"}. Packed: ${orderItem.packedQuantity}, Already delivered: ${orderItem.deliveredQuantity}`,
        });
      }

      orderItem.deliveredQuantity += qtyToDeliver;
      // Use VAT-inclusive amount (proportional to delivered qty), matching how credit was deducted at packing
      const ratio = qtyToDeliver / orderItem.orderedQuantity;
      const itemTotalWithVat = orderItem.totalAmount
        ? orderItem.totalAmount * ratio
        : qtyToDeliver * orderItem.price * (1 + (orderItem.vatPercentage || 5) / 100);
      grandDeliveryAmount += parseFloat(itemTotalWithVat.toFixed(2));
    }

    // --- Robust Delivery Logic: Store Credit First, Restore Credit Limit, Record Payments ---
    if (paymentMethod === "cash" || paymentMethod === "cheque") {
      const customer = await Customer.findById(order.customer);
      let cashToCollect = grandDeliveryAmount;
      returnCreditUsed = 0;
      // 1. Use store credit (returnCreditBalance) first
      if (customer && (customer.returnCreditBalance || 0) > 0) {
        returnCreditUsed = Math.min(customer.returnCreditBalance, grandDeliveryAmount);
        customer.returnCreditBalance -= returnCreditUsed;
        cashToCollect = parseFloat((grandDeliveryAmount - returnCreditUsed).toFixed(2));
        // Record the return credit portion as a payment transaction
        if (returnCreditUsed > 0) {
          await PaymentTransaction.create({
            order: order._id,
            deliveryMan: req.user._id,
            amount: returnCreditUsed,
            method: "return_credit",
            status: "received",
          });
        }
      }
      // 2. Record the actual cash/cheque collected (only remaining amount)
      if (cashToCollect > 0) {
        await PaymentTransaction.create({
          order: order._id,
          deliveryMan: req.user._id,
          amount: cashToCollect,
          method: paymentMethod,
          chequeDetails: paymentMethod === "cheque" ? chequeDetails : undefined,
          status: "received",
        });
      }
      // 3. Restore balanceCreditLimit for "Credit limit" billing type customers
      if (customer && customer.billingType === "Credit limit") {
        customer.balanceCreditLimit += grandDeliveryAmount;
      }
      if (customer) await customer.save();
    }

    // Calculate totals for status updates
    const totalOrdered = order.orderItems.reduce((s, i) => s + i.orderedQuantity, 0);
    const totalDelivered = order.orderItems.reduce((s, i) => s + i.deliveredQuantity, 0);

    order.status = totalDelivered >= totalOrdered ? "delivered" : "partial_delivered";
    order.deliveredAt = deliveredAt ? new Date(deliveredAt) : new Date();
    await order.save();

    // --- Bill Generation: Only if Credit Limit Was Used ---
    const customerForBill = await Customer.findById(order.customer);
    // Only generate a bill if:
    // - Payment is credit
    // - Not cash/cheque
    // - Statement type is invoice-based
    // - AND some credit limit was actually used (not pure store credit)
    // To check if credit limit was used, see if order.invoiceNumber exists AND order.creditLimitUsed > 0
    if (
      order.payment === "credit" &&
      paymentMethod !== "cash" &&
      paymentMethod !== "cheque" &&
      customerForBill?.statementType === "invoice-based" &&
      order.invoiceNumber && // Invoice created only if credit limit was used in packing
      order.creditLimitUsed > 0 // ✅ Only generate bill if credit limit was actually used
    ) {
      // ✅ FIXED: Calculate the proportional credit limit used for delivered items
      // The bill should only reflect the portion that was deducted from credit limit,
      // excluding the portion that came from return balance
      const totalPackedAmount = (order.creditLimitUsed || 0) + (order.returnBalanceUsed || 0);
      const creditLimitRatio = totalPackedAmount > 0 ? order.creditLimitUsed / totalPackedAmount : 0;
      const creditLimitUsedForDelivery = parseFloat((grandDeliveryAmount * creditLimitRatio).toFixed(2));
      
      const bill = await createInvoiceBasedBill(order, creditLimitUsedForDelivery, order.invoiceNumber);
      if (bill) {
        order.bill = bill._id;
        await order.save();
      }
    }

    res.json({
      message:
        paymentMethod === "cash" || paymentMethod === "cheque"
          ? `Delivery recorded & ${paymentMethod} received – AED ${grandDeliveryAmount.toFixed(2)} total`
          : "Delivery recorded successfully. Bill generated for credit payment.",
      order,
      amountCollected: grandDeliveryAmount,
      returnCreditUsed,
    });
  } catch (error) {
    console.error("Deliver order error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const cancelOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (order.status === "delivered" || order.status === "cancelled") {
      return res.status(400).json({ message: "Cannot cancel this order" });
    }

    // Revert stock for undelivered items
    for (const item of order.orderItems) {
      const product = await Product.findById(item.product);
      const undeliveredQty = item.packedQuantity - item.deliveredQuantity;
      product.quantity += undeliveredQty;
      await product.save();
    }

    // ✅ Revert credit for PACKED but NOT delivered amount (since credit was deducted on packing)
    if (order.payment === "credit") {
      const customer = await Customer.findById(order.customer);
      const creditToRestore = order.orderItems.reduce(
        (sum, item) => {
          const packedNotDelivered = (item.packedQuantity || 0) - (item.deliveredQuantity || 0);
          return sum + packedNotDelivered * item.price;
        },
        0,
      );
      if (creditToRestore > 0) {
        customer.balanceCreditLimit += creditToRestore;
        await customer.save();
      }
    }

    order.status = "cancelled";
    await order.save();

    res.json({
      message: "Order cancelled successfully",
      order
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Helper to get or initialize counter
const getOrInitCounter = async () => {
  let counter = await InvoiceCounter.findOne();
  if (!counter) {
    counter = await InvoiceCounter.create({
      deliveredCount: 0,
      pendingCount: 0,
    });
  }
  return counter;
};

// Helper: Buffer PDF in memory before sending (prevents ERR_INCOMPLETE_CHUNKED_ENCODING)
const buildPDFBuffer = (generateFn) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    generateFn(doc).then(() => doc.end()).catch(reject);
  });
};

const getDeliveredInvoice = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("customer", "name email phoneNumber address pincode balanceCreditLimit")
      .populate("orderItems.product", "productName price unit")
      .populate("assignedTo", "username");
    
    if (!order) return res.status(404).json({ message: "Order not found" });
    
    if (order.totalDeliveredQuantity === 0) {
      return res.status(400).json({ message: "No delivered quantity" });
    }
    
    // ✅✅✅ USE EXISTING INVOICE NUMBER (DEL-XX) ✅✅✅
    if (!order.invoiceNumber) {
      return res.status(400).json({ message: "Invoice will be generated after order is packed" });
    }
    
    const invoiceNo = order.invoiceNumber; // ← Use existing DEL-XX
    const filename = `delivered-invoice-${invoiceNo}.pdf`;
    
    const designType = req.query.type === "preprinted" ? "preprinted" : "normal";
    const pdfBuffer = await buildPDFBuffer(async (doc) => {
      await generateDaddysInvoicePDF(doc, order, invoiceNo, "TAX INVOICE", designType);
    });

    const suffix = designType === "preprinted" ? "-preprinted" : "";
    const finalFilename = filename.replace(".pdf", `${suffix}.pdf`);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${finalFilename}"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.end(pdfBuffer);
  } catch (error) {
    console.error("Error generating delivered invoice:", error);
    if (!res.headersSent) {
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
};
const getPendingInvoice = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate(
        "customer",
        "name email phoneNumber address pincode balanceCreditLimit",
      )
      .populate("orderItems.product", "productName price unit"); // ← FIXED HERE

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const totalOrdered =
      order.totalOrderedQuantity ||
      order.orderItems.reduce((s, i) => s + i.orderedQuantity, 0);
    const totalDelivered =
      order.totalDeliveredQuantity ||
      order.orderItems.reduce((s, i) => s + i.deliveredQuantity, 0);
    const remaining = totalOrdered - totalDelivered;

    if (remaining <= 0) {
      return res.status(400).json({ message: "No pending quantity" });
    }

    // Invoice is generated when order is fully packed
    if (!order.invoiceNumber) {
      return res.status(400).json({ message: "Invoice will be generated after order is fully packed" });
    }

    const invoiceNo = order.invoiceNumber;

    const filename = `pending-invoice-${order._id.toString().slice(-8)}.pdf`;

    // Create pending version with remaining quantities
    const pendingOrder = {
      ...order.toObject(),
      orderItems: order.orderItems.map((item) => ({
        ...item.toObject(),
        orderedQuantity: item.orderedQuantity - item.deliveredQuantity,
        deliveredQuantity: 0,
        totalAmount:
          (item.orderedQuantity - item.deliveredQuantity) * item.price,
      })),
    };

    const designType = req.query.type === "preprinted" ? "preprinted" : "normal";
    const pdfBuffer = await buildPDFBuffer(async (doc) => {
      await generateDaddysInvoicePDF(doc, pendingOrder, invoiceNo, "PENDING INVOICE", designType);
    });

    const suffix = designType === "preprinted" ? "-preprinted" : "";
    const finalFilename = filename.replace(".pdf", `${suffix}.pdf`);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${finalFilename}"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.end(pdfBuffer);
  } catch (error) {
    console.error("Error generating pending invoice:", error);
    if (!res.headersSent) {
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
};

// ========== Amount to Words Helpers ==========
const numberToWords = (num) => {
  if (num === 0) return "Zero";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const convertGroup = (n) => {
    if (n === 0) return "";
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
    return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " and " + convertGroup(n % 100) : "");
  };
  const parts = [];
  const million = Math.floor(num / 1000000);
  const thousand = Math.floor((num % 1000000) / 1000);
  const remainder = Math.floor(num % 1000);
  if (million) parts.push(convertGroup(million) + " Million");
  if (thousand) parts.push(convertGroup(thousand) + " Thousand");
  if (remainder) parts.push(convertGroup(remainder));
  return parts.join(" ") || "Zero";
};

const amountToWords = (amount) => {
  const wholePart = Math.floor(Math.abs(amount));
  const filsPart = Math.round((Math.abs(amount) - wholePart) * 100);
  let words = "UAE Dirham " + numberToWords(wholePart);
  if (filsPart > 0) {
    words += " and " + numberToWords(filsPart) + " Fils";
  }
  words += " Only";
  return words;
};

const generateStyledInvoicePDF = async (doc, order, invoiceType, invoiceNo) => {
  const company = await CompanySettings.findOne();
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
  const date = new Date(order.orderDate || order.deliveredAt || Date.now());
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
  doc.fontSize(8).font("Helvetica-Bold").fillColor("#ffffff")
    .text(invoiceType, centerColX, titleBoxY + 50, { width: centerColWidth, align: "center" });

  doc.rect(centerColX, titleBoxY, centerColWidth, 64)
    .lineWidth(2).strokeColor(purple).stroke();

  // --- Right: Invoice Details ---
  const detailBoxY = y;
  const detailBoxHeight = 88;
  doc.rect(rightColX, detailBoxY, rightColWidth, detailBoxHeight)
    .lineWidth(1.5).strokeColor(gray).stroke();

  let detailY = detailBoxY + 8;
  const detailRows = [
    { label: "Inv. No.", value: invoiceNo || "N/A" },
    { label: "Date", value: formattedDate },
    { label: "D.O. No.", value: "* Not Applicable" },
    { label: "Payment", value: order.payment ? order.payment.charAt(0).toUpperCase() + order.payment.slice(1) : "" },
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

  const toBoxWidth = contentWidth * 0.4;
  const toBoxHeight = 55;
  doc.rect(margin, y, toBoxWidth, toBoxHeight)
    .lineWidth(1.5).strokeColor(gray).stroke();

  doc.fontSize(8).font("Helvetica-Bold").fillColor(darkGray)
    .text("To.", margin + 8, y + 5);

  let toY = y + 16;
  doc.fontSize(9).font("Helvetica-Bold")
    .text(order.customer?.name || "N/A", margin + 8, toY);
  toY += 12;
  doc.fontSize(8).font("Helvetica");
  if (order.customer?.address) {
    doc.text(order.customer.address, margin + 8, toY, { width: toBoxWidth - 16 });
    toY += 10;
  }
  if (order.customer?.pincode) {
    doc.text(`TRN: ${order.customer.pincode}`, margin + 8, toY, { width: toBoxWidth - 16 });
    toY += 10;
  } else {
    doc.text("TRN:", margin + 8, toY);
    toY += 10;
  }

  y += toBoxHeight + 8;

  // ===== ITEMS TABLE (10 columns) =====
  const colDefs = [
    { width: 28, header: "S. No.", align: "center" },
    { width: 138, header: "Item Name", align: "left" },
    { width: 37, header: "Qty.", align: "center" },
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

  // Helper to draw table header row
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

  order.orderItems.forEach((item) => {
    const qty = invoiceType.includes("PENDING")
      ? item.orderedQuantity - item.deliveredQuantity
      : item.deliveredQuantity || item.orderedQuantity;

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
    const exclVatAmount = unitPrice * qty;
    const vatAmount = exclVatAmount * (vatPercentage / 100);
    const itemTotal = exclVatAmount + vatAmount;

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

  const prevBalance = order.customer?.balanceCreditLimit || 0;

  doc.fontSize(7).font("Helvetica-Bold").fillColor(darkGray)
    .text(`Previous Balance : ${prevBalance.toFixed(2)}`, margin + 5, y + 4, { width: balW1 - 10 })
    .text("Current Balance :", margin + 5, y + 16, { width: balW1 - 10 });

  doc.fontSize(7).font("Helvetica-Bold").fillColor(darkGray)
    .text("Total Weight", margin + balW1 + 3, y + 10, { width: balW2 - 6, align: "center" });

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

  // ===== VAT & GRAND TOTAL =====
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

  // Grand Total row
  doc.rect(margin, y, vatLabelWidth, vatRowHeight).lineWidth(0.5).strokeColor(gray).stroke();
  doc.rect(margin + vatLabelWidth, y, vatValueWidth, vatRowHeight).lineWidth(0.5).strokeColor(gray).stroke();
  doc.fontSize(9).font("Helvetica-Bold").fillColor(darkGray)
    .text("Grand Total", margin, y + 6, { width: vatLabelWidth, align: "center" });
  doc.fontSize(9).font("Helvetica-Bold").fillColor(darkGray)
    .text(grandTotalInclVat.toFixed(2), margin + vatLabelWidth + 5, y + 6, { width: vatValueWidth - 10, align: "right" });
  y += vatRowHeight;

  // ===== CHEQUE SECTION =====
  y += 5;
  const chequeHeight = 25;
  doc.rect(margin, y, contentWidth, chequeHeight).lineWidth(1.5).strokeColor(gray).stroke();
  doc.fontSize(8).font("Helvetica-Bold").fillColor(darkGray)
    .text(`Cheque to be drawn in favour of '${company.companyName || "Company Name"}'`, margin, y + 8, { width: contentWidth, align: "center" });
  y += chequeHeight;

  // ===== FOOTER SECTION =====
  y += 8;

  // Condition text box
  const conditionHeight = 38;
  doc.rect(margin, y, contentWidth, conditionHeight).lineWidth(0.5).strokeColor(gray).stroke();
  doc.fontSize(7).font("Helvetica").fillColor(darkGray)
    .text("Received above items in good condition.", margin + 8, y + 5, { width: contentWidth - 16 });
  doc.fontSize(6).font("Helvetica")
    .text("..................................................", margin + 8, y + 18, { width: contentWidth - 16, align: "center" })
    .text("Receiver's Name & Signature", margin + 8, y + 27, { width: contentWidth - 16, align: "center" });
  y += conditionHeight;

  // ===== SIGNATURE BOXES (4 boxes) =====
  y += 8;
  const sigGap = 8;
  const sigBoxWidth = (contentWidth - sigGap * 3) / 4;
  const sigBoxHeight = 90;

  const signatures = [
    "Received above items\nin good condition.\n\nReceiver's Name\n& Signature",
    "Vehicle No. & Driver",
    "Store Sign",
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

const generateDaddysInvoicePDF = async (doc, order, invoiceNo, invoiceType = "TAX INVOICE", designType = "normal") => {
  const fs = require("fs");
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;

  // Fetch dynamic Company Settings
  const company = await CompanySettings.findOne() || {};
  const companyName = company.companyName || "DADDYS FOODSTUFF TR. L.L.C.";
  const companyNameArabic = company.companyNameArabic || "";
  const companyAddress = company.companyAddress || "No.6, Jurf Industrial Zone, Ajman - U.A.E.";
  const companyPhone = company.companyPhone || "06 6786779";
  const companyTel = company.companyTel || "";
  const companyEmail = company.companyEmail || "daddyskitchenmasala@gmail.com";
  const companyWebsite = company.companyWebsite || "www.daddyskitchenmasala.com";

  // Colors
  const navyColor = "#002D62"; // Main brand navy blue
  const redColor = "#D21F3C";  // Brand red

  // Date formatting
  const date = new Date(order.orderDate || order.deliveredAt || Date.now());
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
    // Border removed
  };

  // Helper to draw watermark
  const drawWatermark = () => {
    doc.save();
    doc.opacity(0.05); // faint
    
    const wmX = pageWidth / 2 - 60;
    const wmY = 340;
    doc.fillColor(redColor);
    doc.circle(wmX + 30, wmY + 30, 20).fill();
    doc.circle(wmX + 55, wmY + 30, 25).fill();
    doc.circle(wmX + 80, wmY + 30, 20).fill();
    doc.circle(wmX + 55, wmY + 15, 20).fill();
    doc.circle(wmX + 40, wmY + 42, 16).fill();
    doc.circle(wmX + 70, wmY + 42, 16).fill();
    
    // Mustache
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
        doc.text(formatArabicForPdf(company.companyNameArabic), 0, y + 5, { width: pageWidth, align: "center" });
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

  y += 95;

  // ===== CUSTOMER & INVOICE DETAILS ROW =====
  // Left: To. Box
  doc.roundedRect(margin, y, 200, 75, 4).lineWidth(1).strokeColor(navyColor).stroke();
  doc.fillColor(navyColor).font("Helvetica-Bold").fontSize(9).text("To.", margin + 8, y + 5);
  doc.fillColor("#333333").font("Helvetica-Bold").fontSize(9.5).text(order.customer?.name || "N/A", margin + 8, y + 16, { width: 184 });
  
  let toY = y + 28;
  if (order.customer?.address) {
    doc.font("Helvetica").fontSize(7.5).text(order.customer.address, margin + 8, toY, { width: 184, height: 20 });
    toY += 18;
  }
  doc.font("Helvetica").fontSize(7.5).text(`Mob: ${order.customer?.phoneNumber || "N/A"}`, margin + 8, toY);
  toY += 10;
  doc.font("Helvetica-Bold").fontSize(8).text(`TRN: ${order.customer?.pincode || "N/A"}`, margin + 8, toY);

  // Center: TAX INVOICE Box
  doc.fillColor(navyColor).roundedRect(margin + 225, y + 15, 125, 45, 4).fill();
  if (fontRegistered) {
    try {
      doc.font("ArabicFont").fontSize(11).fillColor("#FFFFFF");
      // "فاتورة ضريبية" in shaped/reversed Arabic sequence
      doc.text("\uFE94\uFEF2\uFE92\uFEF1\uFEAE\uFEDF \uFE93\uFEAD\uFEEE\uFEB3\uFE8E\uFEB1", margin + 225, y + 23, { width: 125, align: "center" });
    } catch (e) {
      console.error("Failed to render Arabic tax invoice title:", e);
    }
  }
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#FFFFFF").text(invoiceType, margin + 225, y + 38, { width: 125, align: "center" });

  // Right: Details Box
  const detailsBoxY = y;
  const detailsBoxH = 75;
  const detailsRowH = 18.75;
  const detailsBoxX = margin + contentWidth - 180;
  doc.roundedRect(detailsBoxX, detailsBoxY, 180, detailsBoxH, 4).lineWidth(1).strokeColor(navyColor).stroke();
  
  // Grid lines
  doc.lineWidth(0.5).strokeColor(navyColor);
  doc.moveTo(detailsBoxX, detailsBoxY + detailsRowH).lineTo(detailsBoxX + 180, detailsBoxY + detailsRowH).stroke();
  doc.moveTo(detailsBoxX, detailsBoxY + detailsRowH * 2).lineTo(detailsBoxX + 180, detailsBoxY + detailsRowH * 2).stroke();
  doc.moveTo(detailsBoxX, detailsBoxY + detailsRowH * 3).lineTo(detailsBoxX + 180, detailsBoxY + detailsRowH * 3).stroke();
  doc.moveTo(detailsBoxX + 60, detailsBoxY).lineTo(detailsBoxX + 60, detailsBoxY + detailsBoxH).stroke();

  const detailsLabels = ["Inv. No.", "Date", "D.O. No.", "Payment"];
  const detailsValues = [
    invoiceNo || "N/A",
    formattedDate,
    order.deliveryNo || "N/A",
    order.payment ? order.payment.charAt(0).toUpperCase() + order.payment.slice(1) : "N/A"
  ];
  for (let i = 0; i < 4; i++) {
    const rY = detailsBoxY + i * detailsRowH;
    doc.fillColor(navyColor).font("Helvetica-Bold").fontSize(7.5).text(detailsLabels[i], detailsBoxX + 5, rY + 5, { width: 50 });
    doc.fillColor("#333333").font("Helvetica").fontSize(7.5).text(detailsValues[i], detailsBoxX + 65, rY + 5, { width: 110 });
  }

  y += 85;

  // ===== ITEMS TABLE =====
  const colDefs = [
    { width: 25, header: "S. No.", align: "center" },
    { width: 170.28, header: "Item Name", align: "left" },
    { width: 35, header: "Qty.", align: "center" },
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

  const headerRowHeight = 22;
  const dataRowHeight = 18;

  const drawTableHeader = (startY) => {
    doc.lineWidth(1).strokeColor(navyColor);
    doc.rect(margin, startY, contentWidth, headerRowHeight).stroke();
    
    cols.forEach((col) => {
      doc.fillColor(navyColor).font("Helvetica-Bold").fontSize(7.5)
         .text(col.header, col.x + 2, startY + 6, { width: col.width - 4, align: col.align });
      doc.moveTo(col.x, startY).lineTo(col.x, startY + headerRowHeight).stroke();
    });
    doc.moveTo(margin + contentWidth, startY).lineTo(margin + contentWidth, startY + headerRowHeight).stroke();
    
    return startY + headerRowHeight;
  };

  let tableStartY = y;
  y = drawTableHeader(y);

  let grandTotalExclVat = 0;
  let grandTotalVat = 0;
  let grandTotalInclVat = 0;
  let totalWeight = 0;
  let serialNumber = 1;

  for (const item of order.orderItems) {
    const qty = item.deliveredQuantity || item.orderedQuantity;
    if (qty <= 0) continue;

    // Page overflow check (strictly trigger at y = 625 to prevent any footer overlap)
    if (y + dataRowHeight > 625) {
      createNewPage();
      y = margin + 15;
      y = drawTableHeader(y);
      tableStartY = y - headerRowHeight;
    }

    const vatPercentage = item.vatPercentage || 5;
    const unitPrice = item.price || 0;
    const exclVatAmount = unitPrice * qty;
    const vatAmount = exclVatAmount * (vatPercentage / 100);
    const itemTotal = exclVatAmount + vatAmount;

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
      "0.00",
      vatPercentage.toString() + "%",
      vatAmount.toFixed(2),
      itemTotal.toFixed(2)
    ];

    doc.lineWidth(0.5).strokeColor(navyColor);
    doc.moveTo(margin, y + dataRowHeight).lineTo(margin + contentWidth, y + dataRowHeight).stroke();

    cols.forEach((col, i) => {
      doc.fillColor("#333333").font("Helvetica").fontSize(7.5);
      doc.moveTo(col.x, y).lineTo(col.x, y + dataRowHeight).stroke();
      doc.text(rowData[i], col.x + 4, y + 5, { width: col.width - 8, align: i === 1 ? "left" : col.align });
    });
    doc.moveTo(margin + contentWidth, y).lineTo(margin + contentWidth, y + dataRowHeight).stroke();

    y += dataRowHeight;
    serialNumber++;
  }

  // Check if footer sections need a new page
  if (y > 625) {
    createNewPage();
  }

  // ===== FOOTER DESIGN POSITIONING (Aligned at the bottom) =====
  const sigBoxW = 131.32;
  const sigBoxH = 75;
  const sigGap = 10;

  const sigY = pageHeight - margin - sigBoxH - 10;
  const chequeY = sigY - 18 - 5;
  const totalsY = chequeY - 60 - 5;

  // ===== TOTALS BLOCK =====
  doc.lineWidth(1).strokeColor(navyColor);
  // Row 1: Total Weight and Total Dhs.
  doc.rect(margin, totalsY, 265.28, 20).stroke();
  doc.fillColor(navyColor).font("Helvetica-Bold").fontSize(8).text("Total Weight", margin + 10, totalsY + 6);
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

  // Row 3 Right: Grand Total
  const row3Y = totalsY + 40;
  doc.rect(margin + 265.28, row3Y, 290, 20).stroke();
  doc.fillColor(navyColor).font("Helvetica-Bold").fontSize(8.5).text("Grand Total", margin + 265.28 + 10, row3Y + 6);
  doc.fillColor("#333333").font("Helvetica-Bold").fontSize(8.5).text(grandTotalInclVat.toFixed(2), margin + 265.28 + 150, row3Y + 6, { width: 130, align: "right" });

  // Outer border around the entire table (from S. No. header to totals)
  doc.lineWidth(1).strokeColor(navyColor);
  doc.rect(margin, tableStartY, contentWidth, (totalsY + 60) - tableStartY).stroke();

  // ===== CHEQUE SECTION =====
  doc.rect(margin, chequeY, contentWidth, 18).stroke();
  doc.fillColor(navyColor).font("Helvetica-Bold").fontSize(8)
     .text(`Cheque to be drawn in favour of '${companyName}'`, margin, chequeY + 5, { width: contentWidth, align: "center" });

  // ===== FOOTER SIGNATURE BOXES =====
  // Box 1: Condition and Receiver's Sign
  const box1X = margin;
  doc.roundedRect(box1X, sigY, sigBoxW, sigBoxH, 4).lineWidth(1).strokeColor(navyColor).stroke();
  if (fontRegistered) {
    try {
      doc.font("ArabicFont").fontSize(6.5).fillColor(navyColor);
      // Reversed shaped RTL Arabic for: "استلمنا البضاعة المذكورة في حالة جيدة"
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
      // Reversed shaped RTL Arabic for: "توقيع المستلم"
      doc.text("\uFE8E\uFEE4\uFEF4\uFEB4\uFEE3\uFE8E\uFE8E \uFEF4\uFEFC\uFEF2\uFEB3\uFEEE\uFEB3", box1X + 5, sigY + 60, { width: sigBoxW - 10, align: "center" });
    } catch (e) {
      console.error("Failed to render Arabic condition signature:", e);
    }
  }

  // Box 2: Vehicle No. & Driver
  const box2X = margin + sigBoxW + sigGap;
  doc.roundedRect(box2X, sigY, sigBoxW, sigBoxH, 4).lineWidth(1).strokeColor(navyColor).stroke();
  doc.fillColor(navyColor).font("Helvetica-Bold").fontSize(7.5);
  doc.text("Vehicle No. & Driver", box2X + 5, sigY + 8, { width: sigBoxW - 10, align: "center" });
  doc.fillColor("#333333").font("Helvetica").fontSize(7.5);
  if (order.assignedTo?.username) {
    doc.text(`Driver: ${order.assignedTo.username}`, box2X + 5, sigY + 30, { width: sigBoxW - 10, align: "center" });
    doc.text("Vehicle No: .................", box2X + 5, sigY + 45, { width: sigBoxW - 10, align: "center" });
  } else {
    doc.text("Driver: .........................", box2X + 5, sigY + 30, { width: sigBoxW - 10, align: "center" });
    doc.text("Vehicle No: .................", box2X + 5, sigY + 45, { width: sigBoxW - 10, align: "center" });
  }

  // Box 3: Store Sign
  const box3X = margin + (sigBoxW + sigGap) * 2;
  doc.roundedRect(box3X, sigY, sigBoxW, sigBoxH, 4).lineWidth(1).strokeColor(navyColor).stroke();
  doc.fillColor(navyColor).font("Helvetica-Bold").fontSize(7.5);
  doc.text("Store Sign", box3X + 5, sigY + 8, { width: sigBoxW - 10, align: "center" });
  doc.text(".................................", box3X + 5, sigY + sigBoxH - 25, { width: sigBoxW - 10, align: "center" });

  // Box 4: for DADDYS FOODSTUFF TR. L.L.C.
  const box4X = margin + (sigBoxW + sigGap) * 3;
  doc.roundedRect(box4X, sigY, sigBoxW, sigBoxH, 4).lineWidth(1).strokeColor(navyColor).stroke();
  doc.fillColor(navyColor).font("Helvetica-Bold").fontSize(7.5);
  doc.text(`for ${companyName}`, box4X + 5, sigY + sigBoxH - 18, { width: sigBoxW - 10, align: "center" });
};

// Get pending orders for assignment (for Admin and Sales Manager)
const getPendingOrdersForAssignment = async (req, res) => {
  try {
    // Check if user has permission (Admin or Sales Manager)
    if (!req.user || !["Admin", "Sales man"].includes(req.user.role)) {
      return res.status(403).json({ message: "Only Admin or Sales Manager can view pending orders" });
    }

    let query = { assignmentStatus: "pending_assignment" };

    // Both Admin and Sales Manager see all pending orders
    const orders = await Order.find(query)
      .populate("customer", "name email phoneNumber address pincode")
      .populate("orderItems.product", "productName price unit vatPercentage")
      .populate("createdBy", "username role")
      .sort({ orderDate: -1 });

    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const assignOrderToDeliveryMan = async (req, res) => {
  try {
    // Check if user has permission to assign orders (Admin or Sales Manager)
    if (!req.user || !["Admin", "Sales Manager"].includes(req.user.role)) {
      return res.status(403).json({ message: "Only Admin or Sales Manager can assign orders" });
    }

    const { deliveryManId } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (
      order.assignmentStatus !== "pending_assignment" &&
      order.assignmentStatus !== "rejected"
    ) {
      return res
        .status(400)
        .json({ message: "Order is not available for assignment" });
    }

    const deliveryMan = await User.findOne({
      _id: deliveryManId,
      role: "Delivery Man",
    });
    if (!deliveryMan)
      return res.status(400).json({ message: "Valid delivery man not found" });

    order.assignedTo = deliveryManId;
    order.assignmentStatus = "assigned";
    order.assignedAt = new Date();

    await order.save();

    // Fixed populate
    const updatedOrder = await Order.findById(order._id)
      .populate("customer", "name email phoneNumber address pincode")
      .populate("orderItems.product", "productName price unit")
      .populate("assignedTo", "username")
      .populate("createdBy", "username role");

    res.json({ message: "Order assigned successfully", order: updatedOrder });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get all orders assigned to logged-in delivery man
const getMyAssignedOrders = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const deliveryRoles = ["Delivery partner", "delivery partner", "deliveryman", "Delivery Man"];
    if (!deliveryRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "Only delivery personnel can access this" });
    }

    const orders = await Order.find({
      assignedTo: req.user._id,
      assignmentStatus: { $in: ["assigned", "accepted", "rejected"] },
    })
      .populate("customer", "name phoneNumber address pincode returnCreditBalance billingType")
      .populate("orderItems.product", "productName price unit")
      .populate("assignedTo", "username email")
      .sort({ assignedAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// New endpoint: Generate single invoice for the order (ordered + delivered info)
const getOrderInvoice = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate(
        "customer",
        "name email phoneNumber address pincode balanceCreditLimit",
      )
      .populate("product", "productName price");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const filename = `order-invoice-${order._id.toString().slice(-8)}.pdf`;

    const designType = req.query.type === "preprinted" ? "preprinted" : "normal";
    const pdfBuffer = await buildPDFBuffer(async (doc) => {
      await generateDaddysInvoicePDF(doc, order, `ORD-${order._id.toString().slice(-6)}`, "ORDER INVOICE", designType);
    });

    const suffix = designType === "preprinted" ? "-preprinted" : "";
    const finalFilename = filename.replace(".pdf", `${suffix}.pdf`);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${finalFilename}"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.end(pdfBuffer);
  } catch (error) {
    console.error("Error generating order invoice:", error);
    if (!res.headersSent) {
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
};

// Delivery man accepts the order
const acceptAssignedOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (String(order.assignedTo) !== String(req.user._id)) {
      return res.status(403).json({ message: "This order is not assigned to you" });
    }

    if (order.assignmentStatus !== "assigned" && order.assignmentStatus !== "rejected") {
      return res.status(400).json({ message: "Order cannot be accepted at this stage" });
    }

    order.assignmentStatus = "accepted";
    order.acceptedAt = new Date();
    await order.save();

    res.json({ message: "Order accepted successfully", order });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// Delivery man rejects the order (can add reason later)
const rejectAssignedOrder = async (req, res) => {
  try {
    const { reason } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (String(order.assignedTo) !== String(req.user._id)) {
      return res
        .status(403)
        .json({ message: "This order is not assigned to you" });
    }

    if (order.assignmentStatus !== "assigned") {
      return res
        .status(400)
        .json({ message: "Order cannot be rejected at this stage" });
    }

    // ✅ CRITICAL: Keep assignedTo pointing to rejecting partner (for CancelledOrdersList visibility)
    // Only change status to rejected - DO NOT clear assignedTo
    order.assignmentStatus = "rejected";
    if (reason) order.rejectionReason = reason;
    await order.save();

    res.json({ message: "Order rejected successfully", order });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const getDeliveredOrdersForAdmin = async (req, res) => {
  try {
    // Find orders containing any delivered quantity in their items
    const orders = await Order.find({ "orderItems.deliveredQuantity": { $gt: 0 } })
      .populate("customer", "name email phoneNumber address pincode")
      .populate("orderItems.product", "productName price unit")
      .populate("assignedTo", "username")
      .sort({ orderDate: -1 });

    // Map to a flat structure expected by the reports frontend.
    // For each order item that has deliveredQuantity > 0, produce one record.
    const records = [];
    orders.forEach((order) => {
      const orderDate = order.orderDate;
      (order.orderItems || []).forEach((item) => {
        if ((item.deliveredQuantity || 0) > 0) {
          const price = item.price || item.product?.price || 0;
          const deliveredQty = item.deliveredQuantity || 0;
          const orderedQty = item.orderedQuantity || 0;
          const totalAmount = item.totalAmount || deliveredQty * price;

          records.push({
            _id: order._id,
            orderNumber: order.orderNumber || null,
            customer: order.customer || null,
            product: item.product || null,
            orderedQuantity: orderedQty,
            deliveredQuantity: deliveredQty,
            pendingQty: Math.max(0, orderedQty - deliveredQty),
            price,
            totalAmount,
            assignedTo: order.assignedTo || null,
            orderDate,
            status: order.status,
          });
        }
      });
    });

    res.json(records);
  } catch (error) {
    console.error("Error fetching delivered orders for admin:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const getMyOrders = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "Customer") {
      return res
        .status(403)
        .json({ message: "Access denied - Customers only" });
    }

    const customer = await Customer.findOne({ user: req.user._id });
    if (!customer) {
      return res
        .status(404)
        .json({ message: "Your customer profile not found." });
    }

    const orders = await Order.find({ customer: customer._id })
      .populate("orderItems.product", "productName price unit quantity") // ← FIXED HERE
      .populate("assignedTo", "username email")
      .sort({ orderDate: -1 });

    res.json(orders);
  } catch (error) {
    console.error("Get my orders error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const getCustomerOrders = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "Customer") {
      return res.status(403).json({ message: "Access denied" });
    }

    const customer = await Customer.findOne({ user: req.user._id });
    if (!customer) {
      return res.status(404).json({ message: "Customer profile not found" });
    }

    const orders = await Order.find({ customer: customer._id })
      .populate("orderItems.product", "productName price unit") // ← FIXED HERE
      .sort({ orderDate: -1 });

    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const getCustomerOrderById = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "Customer") {
      return res.status(403).json({ message: "Access denied" });
    }

    const customer = await Customer.findOne({ user: req.user._id });
    if (!customer) {
      return res.status(404).json({ message: "Customer profile not found" });
    }

    const order = await Order.findOne({
      _id: req.params.id,
      customer: customer._id,
    })
      .populate(
        "customer",
        "name email phoneNumber address pincode balanceCreditLimit",
      )
      .populate("orderItems.product", "productName price quantity unit") // ← FIXED HERE
      .populate("assignedTo", "username");

    if (!order) {
      return res.status(404).json({ message: "Order not found or not yours" });
    }

    res.json(order);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};
const markOrderDelivered = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId);

    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.status !== "pending")
      return res.status(400).json({ message: "Order not pending" });

    // Mark delivered
    order.status = "delivered";
    order.deliveredAt = new Date();
    await order.save();

    // Create bill (invoice-based or monthly) – no credit deduction
    const bill = await createInvoiceBasedBill(order);
    if (bill) {
      order.bill = bill._id;
      await order.save();
    }

    res.json({ message: "Order marked as delivered", order });
  } catch (error) {
    console.error("Mark delivered error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getlastorderdetails = async (req, res) => {
  const { customerId, productId } = req.query;

  if (!customerId || !productId) {
    return res
      .status(400)
      .json({ message: "customerId and productId required" });
  }

  try {
    const latestOrder = await Order.findOne({
      customer: customerId,
      "orderItems.product": productId,
    })
      .sort({ orderDate: -1 }) // most recent first
      .select("orderItems");

    if (!latestOrder) {
      return res.json({ price: null }); // no previous purchase
    }

    const item = latestOrder.orderItems.find(
      (i) => i.product.toString() === productId,
    );

    res.json({ price: item ? item.price : null });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

const createOrderRequest = async (req, res) => {
  try {
    const { orderItems, payment, remarks } = req.body;

    if (!req.user || req.user.role !== "Customer") {
      return res
        .status(403)
        .json({ message: "Only customers can create order requests" });
    }

    const customerProfile = await Customer.findOne({ user: req.user._id });
    if (!customerProfile) {
      return res.status(404).json({ message: "Customer profile not found" });
    }

    // Check if this is really first order
    const existingOrderCount = await Order.countDocuments({
      customer: customerProfile._id,
    });
    if (existingOrderCount > 0) {
      return res
        .status(400)
        .json({
          message: "This is not your first order. Use normal order creation.",
        });
    }

    // Credit/overdue checks
    if (customerProfile.billingType === "Credit limit") {
      if (customerProfile.balanceCreditLimit <= 0) {
        return res
          .status(403)
          .json({ message: "Credit limit fully used or zero." });
      }
      const overdue = await Bill.findOne({
        customer: customerProfile._id,
        status: "overdue",
      });
      if (overdue) {
        return res.status(403).json({ message: "You have overdue bills." });
      }
    }

    let grandTotal = 0;
    const processedItems = [];

    for (const item of orderItems) {
      const product = await Product.findById(item.productId);
      if (!product)
        return res
          .status(404)
          .json({ message: `Product not found: ${item.productId}` });

      const itemTotal = product.price * item.orderedQuantity;
      grandTotal += itemTotal;

      processedItems.push({
        product: item.productId,
        unit: product.unit,
        orderedQuantity: item.orderedQuantity,
        price: product.price,
        totalAmount: itemTotal,
        remarks: item.remarks || "",
      });
    }

    // Credit check (but don't deduct yet — only on approval)
    if (
      payment === "credit" &&
      customerProfile.balanceCreditLimit < grandTotal
    ) {
      return res.status(400).json({ message: "Insufficient credit balance" });
    }

    const request = await OrderRequest.create({
      customer: customerProfile._id,
      customerUser: req.user._id,
      orderItems: processedItems,
      payment,
      remarks: remarks || "",
      grandTotal,
      status: "pending",
    });

    res.status(201).json({
      message: "Order request sent successfully. Waiting for admin approval.",
      requestId: request._id,
    });
  } catch (error) {
    console.error("Order request error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Admin: Get all pending order requests
const getPendingOrderRequests = async (req, res) => {
  try {
    if (req.user.role !== "Admin") {
      return res.status(403).json({ message: "Admin access only" });
    }

    const requests = await OrderRequest.find({ status: "pending" })
      .populate("customer", "name email phoneNumber address pincode")
      .populate("customerUser", "username")
      .populate("orderItems.product", "productName price unit")
      .sort({ requestedAt: -1 });

    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// Admin: Approve request → create real order + deduct credit
const approveOrderRequest = async (req, res) => {
  try {
    if (req.user.role !== "Admin") {
      return res.status(403).json({ message: "Admin access only" });
    }
    const request = await OrderRequest.findById(req.params.requestId);
    if (!request) return res.status(404).json({ message: "Request not found" });
    if (request.status !== "pending") {
      return res.status(400).json({ message: "Request already processed" });
    }
    const customer = await Customer.findById(request.customer);
    if (!customer)
      return res.status(404).json({ message: "Customer not found" });
    
    // Final credit check before deducting
    if (
      request.payment === "credit" &&
      customer.balanceCreditLimit < request.grandTotal
    ) {
      return res
        .status(400)
        .json({ message: "Insufficient credit balance now" });
    }

    // ✅ FIXED: Process order items with VAT calculations (same as createOrder)
    const processedItems = request.orderItems.map((item) => {
      const qty = item.orderedQuantity;
      const price = item.price;
      const vatPercent = 5; // Default VAT % for requests, or fetch from product if needed
      
      const exclVatAmount = qty * price;
      const vatAmount = (exclVatAmount * vatPercent) / 100;
      const totalAmount = exclVatAmount + vatAmount;
      
      return {
        product: item.product,
        orderedQuantity: qty,
        price: price,
        vatPercentage: vatPercent,
        exclVatAmount: parseFloat(exclVatAmount.toFixed(2)),
        vatAmount: parseFloat(vatAmount.toFixed(2)),
        totalAmount: parseFloat(totalAmount.toFixed(2)),
        packedQuantity: 0,
        deliveredQuantity: 0,
        invoicedQuantity: 0,
        remarks: item.remarks || "",
      };
    });

    // Deduct credit if credit payment
    if (request.payment === "credit") {
      customer.balanceCreditLimit -= request.grandTotal;
      await customer.save();
    }

    // Create real order with VAT-inclusive items
    const newOrder = await Order.create({
      customer: request.customer,
      orderId: await getNextOrderId(),
      orderItems: processedItems, // ✅ Now includes VAT fields
      payment: request.payment,
      remarks: request.remarks,
      orderDate: new Date(),
      createdBy: request.customerUser,
      status: "pending",
    });

    // Mark request as approved
    request.status = "approved";
    request.approvedBy = req.user._id;
    request.approvedAt = new Date();
    await request.save();

    res.json({ message: "Order request approved and placed", order: newOrder });
  } catch (error) {
    console.error("Approve request error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Admin: Reject request
const rejectOrderRequest = async (req, res) => {
  try {
    if (req.user.role !== "Admin") {
      return res.status(403).json({ message: "Admin access only" });
    }

    const { reason } = req.body;
    const request = await OrderRequest.findById(req.params.requestId);
    
    if (!request) return res.status(404).json({ message: "Request not found" });
    if (request.status !== "pending") {
      return res.status(400).json({ message: "Request already processed" });
    }

    // ✅ FIXED: Use rejection-specific fields instead of approval fields
    request.status = "rejected";
    request.rejectionReason = reason || "No reason provided";
    request.rejectedBy = req.user._id;    // ✅ Changed from approvedBy
    request.rejectedAt = new Date();      // ✅ Changed from approvedAt
    await request.save();

    res.json({ message: "Order request rejected", request });
  } catch (error) {
    console.error("Reject request error:", error); // ✅ Added error logging
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
// Customer: Get their order requests + real orders
const getCustomerOrderHistory = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "Customer") {
      return res.status(403).json({ message: "Customer access only" });
    }

    const customer = await Customer.findOne({ user: req.user._id });
    if (!customer)
      return res.status(404).json({ message: "Profile not found" });

    // Real orders
    const realOrders = await Order.find({ customer: customer._id })
      .populate("orderItems.product", "productName price unit")
      .sort({ orderDate: -1 });

    // Order requests (pending/approved/rejected)
    const requests = await OrderRequest.find({ customer: customer._id })
      .populate("orderItems.product", "productName price unit")
      .sort({ requestedAt: -1 });

    // Fetch sales returns for these orders so the customer can see return status
    const SalesReturn = require("../models/SalesReturn");
    const orderIds = realOrders.map((o) => o._id);
    const salesReturns = await SalesReturn.find({
      order: { $in: orderIds },
    }).select("order status");

    // Map orderId → salesReturn (pick the latest active one)
    const returnByOrder = {};
    for (const sr of salesReturns) {
      const key = sr.order.toString();
      // Prefer active returns over cancelled/rejected ones
      if (!returnByOrder[key] || !["cancelled", "rejected"].includes(sr.status)) {
        returnByOrder[key] = { _id: sr._id, status: sr.status };
      }
    }

    // Attach salesReturn to each real order
    const ordersWithReturn = realOrders.map((order) => ({
      ...order.toObject(),
      salesReturn: returnByOrder[order._id.toString()] || null,
    }));

    res.json({ realOrders: ordersWithReturn, requests });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};
// Check if this is the customer's first order
const checkFirstOrder = async (req, res) => {
  try {
    const { customerId } = req.params;

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return res.status(400).json({ message: "Invalid customer ID format" });
    }

    const count = await Order.countDocuments({ customer: customerId });

    res.json({ isFirst: count === 0 });
  } catch (error) {
    console.error("Check first order error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const packOrder = async (req, res) => {
  try {
    // 1. Authorization
    if (req.user.role.trim() !== "Store kepper") {
      return res.status(403).json({ message: "Only Storekeeper can pack orders" });
    }
    const { packedItems } = req.body;
    const order = await Order.findById(req.params.orderId)
      .populate("customer")
      .populate("orderItems.product", "productName price unit vatPercentage exclVatAmount vatAmount totalAmount");
    
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    if (!["pending", "assigned", "partial_delivered"].includes(order.status)) {
      return res.status(400).json({ message: "Order not in packable state" });
    }

    // 2. Validate and calculate newly packed quantities WITH VAT
    let newlyPackedAmount = 0;        // ✅ Now VAT-inclusive (Grand Total)
    let newlyPackedExclVat = 0;       // ✅ Track Excl. VAT separately
    let newlyPackedVatAmount = 0;     // ✅ Track VAT Amount separately
    let totalNewlyPackedQty = 0;
    let allFullyPacked = true;
    const newlyPackedItems = [];

    for (const pack of packedItems) {
      const orderItem = order.orderItems.id(pack.product);
      if (!orderItem) {
        return res.status(400).json({ message: `Invalid item ID: ${pack.product}` });
      }
      const alreadyPacked = orderItem.packedQuantity || 0;
      const maxCanPack = orderItem.orderedQuantity - alreadyPacked;
      const qtyToPackNow = Number(pack.packedQuantity);
      
      if (isNaN(qtyToPackNow) || qtyToPackNow < 0 || qtyToPackNow > maxCanPack) {
        return res.status(400).json({
          message: `Invalid pack quantity for ${orderItem.product?.productName || "item"}. Max: ${maxCanPack}`,
        });
      }

      // Update packed quantity
      orderItem.packedQuantity = alreadyPacked + qtyToPackNow;

      // Track for this packing event - ✅ VAT-INCLUSIVE CALCULATION
      if (qtyToPackNow > 0) {
        // ✅ Calculate proportional VAT-inclusive amount
        const itemTotalWithVat = orderItem.totalAmount || (orderItem.price * orderItem.orderedQuantity);
        const itemExclVat = orderItem.exclVatAmount || (orderItem.price * orderItem.orderedQuantity);
        const itemVatAmount = orderItem.vatAmount || (itemExclVat * ((orderItem.vatPercentage || 5) / 100));
        
        // Proportional amounts based on packed quantity
        const ratio = qtyToPackNow / orderItem.orderedQuantity;
        const packedTotal = itemTotalWithVat * ratio;
        const packedExclVat = itemExclVat * ratio;
        const packedVatAmount = itemVatAmount * ratio;

        newlyPackedItems.push({
          product: orderItem.product,
          quantity: qtyToPackNow,
          price: orderItem.price,
          vatPercentage: orderItem.vatPercentage || 5,
          exclVatAmount: packedExclVat,
          vatAmount: packedVatAmount,
          totalAmount: packedTotal,
        });

        // ✅ ACCUMULATE VAT-INCLUSIVE AMOUNTS
        newlyPackedAmount += packedTotal;           // Grand Total (Incl. VAT) ← Credit deduction uses this
        newlyPackedExclVat += packedExclVat;        // Excl. VAT for reporting
        newlyPackedVatAmount += packedVatAmount;    // VAT Amount for reporting
        totalNewlyPackedQty += qtyToPackNow;
      }

      if (orderItem.packedQuantity < orderItem.orderedQuantity) {
        allFullyPacked = false;
      }
    }

    // --- Robust Credit/Store Credit Deduction Logic ---
    let packReturnCreditUsed = 0;
    let packCreditLimitUsed = 0;
    if (order.payment === "credit" && newlyPackedAmount > 0) {
      const customer = await Customer.findById(order.customer);
      if (customer?.billingType === "Credit limit") {
        let remaining = newlyPackedAmount;

        // 1. Use store credit (returnCreditBalance) first
        if ((customer.returnCreditBalance || 0) > 0) {
          packReturnCreditUsed = Math.min(customer.returnCreditBalance, remaining);
          customer.returnCreditBalance -= packReturnCreditUsed;
          remaining = parseFloat((remaining - packReturnCreditUsed).toFixed(2));
        }

        // 2. Use credit limit for the rest
        if (remaining > 0) {
          if (customer.balanceCreditLimit < remaining) {
            return res.status(400).json({
              message: `Insufficient credit. Need AED ${remaining.toFixed(2)} (Incl. VAT), available AED ${customer.balanceCreditLimit.toFixed(2)}`,
            });
          }
          customer.balanceCreditLimit -= remaining;
          packCreditLimitUsed = remaining;
        }
        await customer.save();
      }
    }

    // 4. Generate new invoice number ALWAYS when something new is packed
    //    Invoice is generated regardless of payment source (return balance OR credit limit)
    let newInvoiceNumber = order.invoiceNumber;
    if (newlyPackedAmount > 0) {
      const counter = await InvoiceCounter.findOneAndUpdate(
        {},
        { $inc: { invoiceCount: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      newInvoiceNumber = `DEL-${String(counter.invoiceCount).padStart(2, "0")}`;
      if (!order.invoiceHistory) order.invoiceHistory = [];
      order.invoiceHistory.push({
        invoiceNumber: newInvoiceNumber,
        quantity: totalNewlyPackedQty,
        amount: newlyPackedAmount,  // VAT-inclusive amount
        createdAt: new Date(),
        items: newlyPackedItems,
        totalExclVat: newlyPackedExclVat,
        totalVatAmount: newlyPackedVatAmount,
      });
      order.invoiceNumber = newInvoiceNumber;
    }

    // 5. Update order status & packing metadata
    order.packedBy = req.user._id;
    order.packedAt = new Date();
    order.packedStatus = allFullyPacked ? "fully_packed" : "partially_packed";
    if (allFullyPacked && order.status !== "partial_delivered") {
      order.status = "ready_to_deliver";
    }
    // ✅ Store credit usage tracking
    order.creditLimitUsed = (order.creditLimitUsed || 0) + packCreditLimitUsed;
    order.returnBalanceUsed = (order.returnBalanceUsed || 0) + packReturnCreditUsed;
    await order.save();

    // 6. Response
    res.json({
      success: true,
      message: allFullyPacked
        ? `Order fully packed. Credit deducted: AED ${newlyPackedAmount.toFixed(2)} (Incl. VAT)`
        : `Partially packed (${totalNewlyPackedQty} units). Credit deducted: AED ${newlyPackedAmount.toFixed(2)} (Incl. VAT)`,
      order,
      invoiceNumber: newInvoiceNumber,
      returnCreditUsed: packReturnCreditUsed,
      creditLimitUsed: packCreditLimitUsed,
      newlyPacked: {
        quantity: totalNewlyPackedQty,
        amount: newlyPackedAmount,
        exclVat: newlyPackedExclVat,
        vatAmount: newlyPackedVatAmount,
        items: newlyPackedItems,
      },
      nextStep: allFullyPacked ? "Ready for delivery" : "Can pack more later",
    });
  } catch (error) {
    console.error("Pack order error:", error);
    res.status(500).json({
      message: "Server error while packing order",
      error: error.message,
    });
  }
};
const getPendingForPacking = async (req, res) => {
  try {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const orders = await Order.find({
      packedStatus: "not_packed",
      status: { $ne: "cancelled" },
      $or: [
        { packableAfter: null },
        { packableAfter: { $lte: now } }
      ]
    })
      .populate("customer", "name email phoneNumber")
      .populate("orderItems.product", "productName unit price")
      .populate("assignedTo", "username")
      .sort({ orderDate: -1 });
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

const getRemainingForPacking = async (req, res) => {
  try {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const orders = await Order.find({
      packedStatus: "partially_packed",
      $or: [
        { packableAfter: null },
        { packableAfter: { $lte: now } }
      ]
    })
      .populate("customer", "name email phoneNumber")
      .populate("orderItems.product", "productName unit price")
      .populate("assignedTo", "username")
      .sort({ orderDate: -1 });
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// NEW: Get pending orders for a salesman's customers only
const getMyPendingOrders = async (req, res) => {
  try {
    if (req.user.role !== "Sales man") {
      return res.status(403).json({ message: "Only salesmen can access this" });
    }

    // Get all customers assigned to this salesman
    const mySalesmanCustomers = await Customer.find({ salesman: req.user._id })
      .select("_id");

    const customerIds = mySalesmanCustomers.map(c => c._id);

    // Get pending orders for those customers
    const orders = await Order.find({
      customer: { $in: customerIds },
      $or: [
        { packedStatus: { $in: ["not_packed", "partially_packed"] } },
        { status: "pending" }
      ]
    })
      .populate("customer", "name email phoneNumber")
      .populate("orderItems.product", "productName unit price")
      .populate("assignedTo", "username")
      .sort({ orderDate: -1 });

    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};



const getPackedToday = async (req, res) => {
  const { date } = req.query;
  const start = new Date(date);
  start.setHours(0,0,0,0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const count = await Order.countDocuments({
    packedAt: { $gte: start, $lt: end },
  });
  res.json({ count });
};

const getReadyToDeliver = async (req, res) => {
  const count = await Order.countDocuments({
    packedStatus: "fully_packed",
    status: { $ne: "delivered" },
  });
  res.json({ count });
};

const getPackedInvoice = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("customer", "name email phoneNumber address pincode balanceCreditLimit")
      .populate("orderItems.product", "productName price unit");
    
    if (!order) return res.status(404).json({ message: "Order not found" });
    
    if (!order.packedAt || !order.packedStatus) {
      return res.status(400).json({ message: "Order not yet packed" });
    }
    
    // ✅✅✅ USE EXISTING INVOICE NUMBER (DEL-XX) ✅✅✅
    const invoiceNumber = order.invoiceNumber || `DEL-${order._id.toString().slice(-6).toUpperCase()}`;
    
    const designType = req.query.type === "preprinted" ? "preprinted" : "normal";
    const filename = `packed-invoice-${invoiceNumber}.pdf`;
    
    const pdfBuffer = await buildPDFBuffer(async (doc) => {
      await generatePackedInvoicePDF(doc, order, "PACKED INVOICE", invoiceNumber, designType);
    });

    const suffix = designType === "preprinted" ? "-preprinted" : "";
    const finalFilename = filename.replace(".pdf", `${suffix}.pdf`);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${finalFilename}"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.end(pdfBuffer);
  } catch (error) {
    console.error("Error generating packed invoice:", error);
    if (!res.headersSent) {
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
};

// ✅ NEW UNIFIED INVOICE - Shows Ordered, Packed, Delivered quantities
const getUnifiedInvoice = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("customer", "name email phoneNumber address pincode balanceCreditLimit")
      .populate("orderItems.product", "productName price unit");
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (!order.packedAt || !order.packedStatus) {
      return res.status(400).json({ message: "Order must be packed first to generate invoice" });
    }
    // NEW: Accept specific invoiceNumber from query (for historical)
    const targetInvoiceNo = req.query.invoiceNumber || order.invoiceNumber;
    if (!order.invoiceHistory.some(h => h.invoiceNumber === targetInvoiceNo)) {
      return res.status(404).json({ message: "Specified invoice not found in order history" });
    }
    const designType = req.query.type === "preprinted" ? "preprinted" : "normal";
    const filename = `unified-invoice-${targetInvoiceNo}.pdf`;

    const pdfBuffer = await buildPDFBuffer(async (doc) => {
      await generateUnifiedInvoicePDF(doc, order, "INVOICE", targetInvoiceNo, designType);
    });

    const suffix = designType === "preprinted" ? "-preprinted" : "";
    const finalFilename = filename.replace(".pdf", `${suffix}.pdf`);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${finalFilename}"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.end(pdfBuffer);
  } catch (error) {
    console.error("Error generating unified invoice:", error);
    if (!res.headersSent) {
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
};
// ✅ UNIFIED INVOICE PDF - New Tax Invoice Style
const generateUnifiedInvoicePDF = async (doc, order, invoiceType, invoiceNo, designType = "normal") => {
  // Gather items from history or fallback to order items
  const historyEntry = order.invoiceHistory?.find(h => h.invoiceNumber === invoiceNo);
  let unifiedItems = [];

  if (historyEntry && historyEntry.items?.length > 0) {
    for (const histItem of historyEntry.items) {
      if (!histItem.quantity || histItem.quantity <= 0) continue;
      const orderItem = order.orderItems.find(oi => String(oi.product._id) === String(histItem.product));
      unifiedItems.push({
        product: orderItem?.product || null,
        unit: orderItem?.unit || orderItem?.product?.unit || "Nos",
        price: histItem.price || orderItem?.price || 0,
        vatPercentage: orderItem?.vatPercentage || 5,
        qty: histItem.quantity,
      });
    }
  } else {
    order.orderItems.forEach((item) => {
      const qty = item.deliveredQuantity || item.packedQuantity || item.orderedQuantity || 0;
      if (qty <= 0) return;
      unifiedItems.push({
        product: item.product,
        unit: item.unit || item.product?.unit || "Nos",
        price: item.price || 0,
        vatPercentage: item.vatPercentage || 5,
        qty,
      });
    });
  }

  // Build a wrapper order so generateStyledInvoicePDF can process it
  const wrapperOrder = {
    ...order,
    _id: order._id,
    customer: order.customer,
    payment: order.payment,
    orderDate: order.packedAt || order.orderDate || order.deliveredAt,
    orderItems: unifiedItems.map((ui) => ({
      product: ui.product,
      unit: ui.unit,
      price: ui.price,
      vatPercentage: ui.vatPercentage,
      orderedQuantity: ui.qty,
      deliveredQuantity: ui.qty,
    })),
  };

  await generateDaddysInvoicePDF(doc, wrapperOrder, invoiceNo, invoiceType, designType);
};
// ✅ PACKED INVOICE PDF - New Tax Invoice Style (uses packed quantities)
const generatePackedInvoicePDF = async (doc, order, invoiceType, invoiceNo, designType = "normal") => {
  // Build wrapper with packed quantities so generateStyledInvoicePDF renders them
  const wrapperOrder = {
    ...order,
    _id: order._id,
    customer: order.customer,
    payment: order.payment,
    orderDate: order.packedAt || order.orderDate,
    orderItems: order.orderItems.map((item) => ({
      product: item.product,
      unit: item.unit || item.product?.unit || "Nos",
      price: item.price,
      vatPercentage: item.vatPercentage || 5,
      orderedQuantity: item.packedQuantity || 0,
      deliveredQuantity: item.packedQuantity || 0,
    })),
  };

  await generateDaddysInvoicePDF(doc, wrapperOrder, invoiceNo, invoiceType, designType);
};

const getAllOrdersForStorekeeper = async (req, res) => {
  try {
    if (req.user.role.trim() !== "Store kepper") {
      return res.status(403).json({ message: "Only Store kepper can access this" });
    }

    const orders = await Order.find()
      .populate("customer", "name email phoneNumber address pincode")
      .populate("orderItems.product", "productName price unit")
      .populate("packedBy", "username")
      .populate("assignedTo", "username")
      .sort({ orderDate: -1 });
    res.json(orders);
  } catch (error) {
    console.error("Get all orders for storekeeper error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  createOrder,
  getAllOrders,
  getOrderById,
  getSalesmanOrders,
  getSalesmanDeliveredOrders,
  updateOrder,
  deleteOrder,
  deliverOrder,
  cancelOrder,
  getDeliveredInvoice,
  getPendingInvoice,
  assignOrderToDeliveryMan,
  getMyAssignedOrders,
  acceptAssignedOrder,
  rejectAssignedOrder,
  getDeliveredOrdersForAdmin,
  getCustomerOrders,
  getCustomerOrderById,
  getMyOrders,
  getOrderInvoice,
  markOrderDelivered,
  getlastorderdetails,
  createOrderRequest,
  getPendingOrderRequests,
  approveOrderRequest,
  rejectOrderRequest,
  getCustomerOrderHistory,
  checkFirstOrder,
  packOrder,
  getPendingForPacking,
  getRemainingForPacking,
  getMyPendingOrders,
  getPackedToday,
  getReadyToDeliver,
  getPackedInvoice,
  getUnifiedInvoice, // ✅ NEW unified invoice showing Ordered/Packed/Delivered
  generateUnifiedInvoicePDF, // ✅ NEW unified invoice PDF generator
  getAllOrdersForStorekeeper,
  getPendingOrdersForAssignment
};
