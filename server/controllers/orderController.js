const Order = require("../models/Order");
const Product = require("../models/Product");
const Customer = require("../models/Customer");
const User = require("../models/User");
const CompanySettings = require("../models/CompanySettings");
const InvoiceCounter = require("../models/InvoiceCounter");
const { createInvoiceBasedBill } = require("../controllers/billController"); // ← import it
const PaymentTransaction = require("../models/PaymentTransaction");
const Bill = require("../models/Bill");
const OrderRequest = require("../models/OrderRequest");
const mongoose = require("mongoose");

const PDFDocument = require("pdfkit");

const createOrder = async (req, res) => {
  try {
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
      payment,
      remarks: remarks || "",
      scheduleDays: days,
      packableAfter: days > 0 ? packableAfter : null,
      orderItems: processedItems,
      status: "pending",
      assignmentStatus: "pending_assignment",
    });

    await order.save();

    // ✅ Populate and return with VAT fields
    const populatedOrder = await Order.findById(order._id)
      .populate("customer", "name phone email")
      .populate("orderItems.product", "productName unit");

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

    // Update delivered quantities
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
      grandDeliveryAmount += qtyToDeliver * orderItem.price;
    }

    // Handle cash/cheque payment immediately
    if (paymentMethod === "cash" || paymentMethod === "cheque") {
      await PaymentTransaction.create({
        order: order._id,
        deliveryMan: req.user._id,
        amount: grandDeliveryAmount,
        method: paymentMethod,
        chequeDetails: paymentMethod === "cheque" ? chequeDetails : undefined,
        status: "received",
      });

      const customer = await Customer.findById(order.customer);
      if (customer && customer.billingType === "Credit limit") {
        customer.balanceCreditLimit += grandDeliveryAmount;
        await customer.save();
      }
    }

    // Calculate totals for status updates
    const totalOrdered = order.orderItems.reduce((s, i) => s + i.orderedQuantity, 0);
    const totalDelivered = order.orderItems.reduce((s, i) => s + i.deliveredQuantity, 0);

    order.status = totalDelivered >= totalOrdered ? "delivered" : "partial_delivered";
    order.deliveredAt = deliveredAt ? new Date(deliveredAt) : new Date();
    await order.save();

    // ✅ CREATE NEW BILL FOR THIS DELIVERY (never update existing)
    const customer = await Customer.findById(order.customer);
    if (
      order.payment === "credit" &&
      paymentMethod !== "cash" &&
      paymentMethod !== "cheque" &&
      customer?.statementType === "invoice-based"
    ) {
      // ✅ Pass specific delivery amount and current invoice number
      const bill = await createInvoiceBasedBill(order, grandDeliveryAmount, order.invoiceNumber);
      if (bill) {
        order.bill = bill._id;
        await order.save();
      }
    }

    res.json({
      message:
        paymentMethod === "cash" || paymentMethod === "cheque"
          ? `Delivery recorded & ${paymentMethod} received – credit restored: AED ${grandDeliveryAmount.toFixed(2)}`
          : "Delivery recorded successfully. Bill generated for credit payment.",
      order,
      amountCollected: grandDeliveryAmount,
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
      .populate("orderItems.product", "productName price unit");
    
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
    
    const pdfBuffer = await buildPDFBuffer(async (doc) => {
      await generateStyledInvoicePDF(doc, order, "DELIVERED INVOICE", invoiceNo);
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
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

    const pdfBuffer = await buildPDFBuffer(async (doc) => {
      await generateStyledInvoicePDF(doc, pendingOrder, "PENDING INVOICE", invoiceNo);
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
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
    doc.text(order.customer.pincode, margin + 8, toY);
    toY += 10;
  }
  doc.text("TRN :", margin + 8, toY);

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
const assignOrderToDeliveryMan = async (req, res) => {
  try {
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
      .populate("orderItems.product", "productName price unit") // ← FIXED
      .populate("assignedTo", "username");

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
      .populate("customer", "name phoneNumber address pincode")
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

    const pdfBuffer = await buildPDFBuffer(async (doc) => {
      await generateStyledInvoicePDF(doc, order, "ORDER INVOICE", `ORD-${order._id.toString().slice(-6)}`);
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
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

    res.json({ realOrders, requests });
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

    // 3. Credit deduction - ✅ NOW USES VAT-INCLUSIVE AMOUNT
    if (order.payment === "credit" && newlyPackedAmount > 0) {
      const customer = await Customer.findById(order.customer);
      if (customer?.billingType === "Credit limit") {
        if (customer.balanceCreditLimit < newlyPackedAmount) {
          return res.status(400).json({
            message: `Insufficient credit. Need AED ${newlyPackedAmount.toFixed(2)} (Incl. VAT), available AED ${customer.balanceCreditLimit.toFixed(2)}`,
          });
        }
        // ✅ Deduct Grand Total (Incl. VAT) from credit limit
        customer.balanceCreditLimit -= newlyPackedAmount;
        await customer.save();
      }
    }

    // 4. Generate new invoice number ONLY when something new is packed
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
        amount: newlyPackedAmount,  // ✅ VAT-inclusive amount
        createdAt: new Date(),
        items: newlyPackedItems,
        // ✅ Store VAT breakdown for invoice PDF
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
    await order.save();

    // 6. Response
    res.json({
      success: true,
      message: allFullyPacked
        ? `Order fully packed. Credit deducted: AED ${newlyPackedAmount.toFixed(2)} (Incl. VAT)`
        : `Partially packed (${totalNewlyPackedQty} units). Credit deducted: AED ${newlyPackedAmount.toFixed(2)} (Incl. VAT)`,
      order,
      invoiceNumber: newInvoiceNumber,
      newlyPacked: {
        quantity: totalNewlyPackedQty,
        amount: newlyPackedAmount,           // Grand Total (Incl. VAT)
        exclVat: newlyPackedExclVat,         // Excl. VAT
        vatAmount: newlyPackedVatAmount,     // VAT Amount
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
    
    const filename = `packed-invoice-${invoiceNumber}.pdf`;
    
    const pdfBuffer = await buildPDFBuffer(async (doc) => {
      await generatePackedInvoicePDF(doc, order, "PACKED INVOICE", invoiceNumber);
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
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
    const filename = `unified-invoice-${targetInvoiceNo}.pdf`;

    const pdfBuffer = await buildPDFBuffer(async (doc) => {
      await generateUnifiedInvoicePDF(doc, order, "INVOICE", targetInvoiceNo);
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
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
const generateUnifiedInvoicePDF = async (doc, order, invoiceType, invoiceNo) => {
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

  await generateStyledInvoicePDF(doc, wrapperOrder, invoiceType, invoiceNo);
};
// ✅ PACKED INVOICE PDF - New Tax Invoice Style (uses packed quantities)
const generatePackedInvoicePDF = async (doc, order, invoiceType, invoiceNo) => {
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

  await generateStyledInvoicePDF(doc, wrapperOrder, invoiceType, invoiceNo);
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
 getAllOrdersForStorekeeper
};
