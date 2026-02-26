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
    let { customerId, orderItems, payment, remarks } = req.body;

    // Auto-set customerId for Customer role (if customer is placing order themselves)
    if (req.user.role === "Customer") {
      const customerProfile = await Customer.findOne({ user: req.user._id });
      if (!customerProfile) {
        return res
          .status(404)
          .json({ message: "Your customer profile not found." });
      }
      customerId = customerProfile._id;
    } else if (!customerId) {
      return res.status(400).json({ message: "Customer ID is required" });
    }

    const customer = await Customer.findById(customerId);
    if (!customer)
      return res.status(404).json({ message: "Customer not found" });

    // Credit limit & overdue checks (existing logic)
    if (customer.billingType === "Credit limit") {
      if (customer.balanceCreditLimit <= 0) {
        return res
          .status(403)
          .json({ message: "Insufficient credit limit or zero balance." });
      }

      // NEW: Block if any bill is overdue
      const overdueBill = await Bill.findOne({
        customer: customer._id,
        status: "overdue",
      });

      if (overdueBill) {
        return res.status(403).json({
          message:
            "Cannot place order - you have overdue bills. Please clear dues first.",
        });
      }
    }

    // Validate items
    if (!Array.isArray(orderItems) || orderItems.length === 0) {
      return res.status(400).json({ message: "At least one product required" });
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
        deliveredQuantity: 0,
        price: product.price,
        totalAmount: itemTotal,
        remarks: item.remarks || "",
      });
    }

    // ✅ NO credit deduction at order creation
    // Credit will be deducted ONLY when storekeeper packs items

    // Determine initial status
    let initialStatus = "pending";

    // If created by Salesman AND this is customer's FIRST order → pending approval
    const isSalesman = [
      "Salesman",
      "Sales Person",
      "delivery partner",
      "Delivery Man",
    ].includes(req.user.role);
    const orderCount = await Order.countDocuments({ customer: customerId });

    if (isSalesman && orderCount === 0) {
      initialStatus = "pending_approval";
    }

    const order = await Order.create({
      customer: customerId,
      orderItems: processedItems,
      payment,
      remarks: remarks || "",
      orderDate: req.body.orderDate || new Date(),
      createdBy: req.user._id,
      status: initialStatus,
      approvalStatus:
        initialStatus === "pending_approval" ? "pending" : undefined,
    });

    res.status(201).json({
      message:
        initialStatus === "pending_approval"
          ? "Order created successfully. Waiting for admin approval."
          : "Order created successfully.",
      order,
    });
  } catch (error) {
    console.error("Create order error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("customer", "name email phoneNumber address pincode")
      .populate("orderItems.product", "productName price unit") // ← FIXED
      .populate("assignedTo", "username")
      .sort({ orderDate: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate(
        "customer",
        "name email phoneNumber address pincode balanceCreditLimit",
      )
      .populate("orderItems.product", "productName price quantity unit"); // ← FIXED
    if (!order) return res.status(404).json({ message: "Order not found" });
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
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

    // ✅ Update delivered quantities
    for (const inputItem of deliveredItems) {
      const orderItem = order.orderItems.id(inputItem.product);
      if (!orderItem) {
        return res.status(400).json({ message: `Product not in order` });
      }

      const qtyToDeliver = Number(inputItem.quantity);
      // ✅ Can only deliver what's been packed, minus what's already delivered
      const packedRemaining = (orderItem.packedQuantity || 0) - (orderItem.deliveredQuantity || 0);

      if (qtyToDeliver <= 0 || qtyToDeliver > packedRemaining) {
        return res.status(400).json({ 
          message: `Invalid quantity for ${orderItem.product?.productName || "product"}. Packed: ${orderItem.packedQuantity}, Already delivered: ${orderItem.deliveredQuantity}` 
        });
      }

      orderItem.deliveredQuantity += qtyToDeliver;
      grandDeliveryAmount += qtyToDeliver * orderItem.price;
    }

    // ✅ Handle cash/cheque payment immediately (no bill generation needed)
    if (paymentMethod === "cash" || paymentMethod === "cheque") {
      // Create transaction in delivery man's wallet
      await PaymentTransaction.create({
        order: order._id,
        deliveryMan: req.user._id,
        amount: grandDeliveryAmount,
        method: paymentMethod,
        chequeDetails: paymentMethod === "cheque" ? chequeDetails : undefined,
        status: "received",           // Directly received – no pending
      });

      // ✅ Restore credit for delivered amount only (not full packed amount)
      const customer = await Customer.findById(order.customer);
      if (customer && customer.billingType === "Credit limit") {
        customer.balanceCreditLimit += grandDeliveryAmount;
        await customer.save();
      }

      // No bill should be created for this delivered portion
    }

    // ✅ Calculate totals for status updates
    const totalOrdered = order.orderItems.reduce((s, i) => s + i.orderedQuantity, 0);
    const totalDelivered = order.orderItems.reduce((s, i) => s + i.deliveredQuantity, 0);
    const totalPacked = order.orderItems.reduce((s, i) => s + (i.packedQuantity || 0), 0);

    // ✅ Set status correctly:
    // - "delivered" only when everything ordered has been delivered
    // - "partial_delivered" otherwise (even if all packed items are delivered)
    //   so that remaining un‑packed quantity can still be packed later.
    order.status = totalDelivered >= totalOrdered ? "delivered" : "partial_delivered";
    order.deliveredAt = deliveredAt ? new Date(deliveredAt) : new Date();

    await order.save();

    // ✅ Only create invoice-based bill if:
    // - It's credit order
    // - Not fully paid in cash/cheque this time
    // - And customer is on invoice-based billing
    const customer = await Customer.findById(order.customer);
    if (
      order.payment === "credit" &&
      paymentMethod !== "cash" &&
      paymentMethod !== "cheque" &&
      customer?.statementType === "invoice-based"
    ) {
      const bill = await createInvoiceBasedBill(order);
      if (bill) {
        order.bill = bill._id;
        await order.save();
      }
    }

    res.json({
      message: paymentMethod === "cash" || paymentMethod === "cheque"
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

const getDeliveredInvoice = async (req, res) => {
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

    if (order.totalDeliveredQuantity === 0) {
      // Use virtual if you have it, or calculate
      return res.status(400).json({ message: "No delivered quantity" });
    }

    const counter = await getOrInitCounter();

    if (!order.deliveredInvoiceNumber) {
      counter.deliveredCount += 1;
      await counter.save();

      order.deliveredInvoiceNumber = `DEL-${counter.deliveredCount}`;
      order.firstDeliveredInvoiceDate = new Date();
      await order.save();
    }

    const invoiceNo = order.deliveredInvoiceNumber;

    const filename = `delivered-invoice-${order._id.toString().slice(-8)}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ size: "A4", margin: 0 });
    doc.pipe(res);

    // IMPORTANT: Your generateStyledInvoicePDF is still using old single-product destructuring!
    // Update it too (see below)
    await generateStyledInvoicePDF(doc, order, "DELIVERED INVOICE", invoiceNo);

    doc.end();
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

    const counter = await getOrInitCounter();

    if (!order.pendingInvoiceNumber) {
      counter.pendingCount += 1;
      await counter.save();

      order.pendingInvoiceNumber = `PEN-${counter.pendingCount}`;
      order.firstPendingInvoiceDate = new Date();
      await order.save();
    }

    const invoiceNo = order.pendingInvoiceNumber;

    const filename = `pending-invoice-${order._id.toString().slice(-8)}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ size: "A4", margin: 0 });
    doc.pipe(res);

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

    await generateStyledInvoicePDF(
      doc,
      pendingOrder,
      "PENDING INVOICE",
      invoiceNo,
    );

    doc.end();
  } catch (error) {
    console.error("Error generating pending invoice:", error);
    if (!res.headersSent) {
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
};

const generateStyledInvoicePDF = async (doc, order, invoiceType, invoiceNo) => {
  const company = await CompanySettings.findOne();
  if (!company) {
    throw new Error("Company invoice settings not configured.");
  }

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 50;
  const contentWidth = pageWidth - margin * 2;

  const date = new Date(order.orderDate || order.deliveredAt || Date.now());
  const formattedDate = date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  doc.fontSize(12).font("Helvetica").fillColor("#000000");

  // Header
  const headerY = margin;
  doc
    .fontSize(22)
    .font("Helvetica-Bold")
    .text(company.companyName || "INGOUDE COMPANY", margin, headerY);

  doc
    .fontSize(36)
    .font("Helvetica-Bold")
    .fillColor("#b0123b")
    .text(invoiceType, margin, headerY + 40);

  const invoiceInfoX = pageWidth - margin - 200;
  doc
    .fontSize(12)
    .font("Helvetica-Bold")
    .fillColor("#000000")
    .text(`NO: ${invoiceNo}`, invoiceInfoX, headerY)
    .text(`Date: ${formattedDate}`, invoiceInfoX, headerY + 20);

  // Bill To / From (unchanged)
  const infoY = headerY + 120;
  const billToX = margin;
  const fromX = pageWidth - margin - 250;

  doc.fontSize(14).font("Helvetica-Bold").text("Bill To:", billToX, infoY);
  doc
    .fontSize(12)
    .font("Helvetica")
    .text(order.customer?.name || "N/A", billToX, infoY + 25)
    .text(order.customer?.phoneNumber || "N/A", billToX, infoY + 45)
    .text(order.customer?.address || "N/A", billToX, infoY + 65)
    .text(`Pincode: ${order.customer?.pincode || "N/A"}`, billToX, infoY + 85);

  doc.fontSize(14).font("Helvetica-Bold").text("From:", fromX, infoY);
  doc
    .fontSize(12)
    .font("Helvetica")
    .text(company.companyName || "INGOUDE COMPANY", fromX, infoY + 25)
    .text(company.companyPhone || "N/A", fromX, infoY + 45)
    .text(company.companyAddress || "N/A", fromX, infoY + 65);

  // Table - now supports MULTIPLE products
  const tableY = infoY + 130;
  const rowHeight = 40;

  const descCol = margin;
  const qtyCol = margin + 280;
  const priceCol = margin + 360;
  const totalCol = margin + 440;

  // Header row
  doc
    .rect(margin - 10, tableY - 5, contentWidth + 20, rowHeight)
    .fillColor("#b0123b")
    .fill();
  doc
    .fillColor("#ffffff")
    .fontSize(12)
    .font("Helvetica-Bold")
    .text("Description", descCol, tableY + 10)
    .text("Qty", qtyCol, tableY + 10, { width: 70, align: "center" })
    .text("Price", priceCol, tableY + 10, { width: 70, align: "center" })
    .text("Total", totalCol, tableY + 10, { width: 70, align: "center" });

  // Data rows - loop through orderItems
  let currentY = tableY + rowHeight;
  let grandTotal = 0;

  order.orderItems.forEach((item) => {
    const qty = invoiceType.includes("PENDING")
      ? item.orderedQuantity - item.deliveredQuantity
      : item.deliveredQuantity || item.orderedQuantity;

    const itemTotal = qty * item.price;
    grandTotal += itemTotal;

    doc
      .fillColor("#000000")
      .fontSize(12)
      .font("Helvetica")
      .text(
        item.product?.productName || "Unknown Product",
        descCol,
        currentY + 10,
      )
      .text(qty.toString(), qtyCol, currentY + 10, {
        width: 70,
        align: "center",
      })
      .text(`AED ${item.price.toFixed(2)}`, priceCol, currentY + 10, {
        width: 70,
        align: "center",
      })
      .text(`AED ${itemTotal.toFixed(2)}`, totalCol, currentY + 10, {
        width: 70,
        align: "center",
      });

    currentY += rowHeight;
  });

  // Subtotal
  const subtotalY = currentY + 40;
  const subtotalWidth = 200;
  const subtotalX = pageWidth - margin - subtotalWidth;

  doc.rect(subtotalX, subtotalY, subtotalWidth, 35).fillColor("#222222").fill();
  doc
    .fillColor("#ffffff")
    .fontSize(12)
    .font("Helvetica-Bold")
    .text("Grand Total", subtotalX + 15, subtotalY + 12)
    .text(
      `AED ${grandTotal.toFixed(2)}`,
      subtotalX + subtotalWidth - 20,
      subtotalY + 12,
      { align: "right" },
    );

  // Footer - unchanged
  const footerY = subtotalY + 80;

  doc
    .fillColor("#000000")
    .fontSize(14)
    .font("Helvetica-Bold")
    .text("Payment Information:", margin, footerY);
  doc
    .fontSize(12)
    .font("Helvetica")
    .text(`Bank: ${company.bankName || "N/A"}`, margin, footerY + 25)
    .text(
      `Account: ${company.bankAccountNumber || "N/A"}`,
      margin,
      footerY + 45,
    )
    .text(
      `Payment Method: ${order.payment?.charAt(0).toUpperCase() + order.payment?.slice(1) || "N/A"}`,
      margin,
      footerY + 65,
    )
    .text(`Order ID: ${order._id.toString()}`, margin, footerY + 85);

  const thankYouX = pageWidth - margin - 200;
  doc
    .fontSize(36)
    .font("Helvetica-Bold")
    .fillColor("#000000")
    .text("Thank You!", thankYouX, footerY, { width: 200, align: "right" });

  const bottomY = footerY + 150;
  doc
    .fontSize(10)
    .font("Helvetica-Oblique")
    .fillColor("#666666")
    .text("This is a system-generated invoice", margin, bottomY);
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
    // Check if user exists and has delivery-related role
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const deliveryRoles = [
      "Delivery partner",
      "delivery partner",
      "deliveryman",
      "Delivery Man",
    ];
    if (!deliveryRoles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ message: "Only delivery personnel can access this" });
    }

    const orders = await Order.find({
      assignedTo: req.user._id,
      assignmentStatus: { $in: ["assigned", "accepted", "rejected"] },
    })
      .populate("customer", "name phoneNumber address pincode")
      .populate("orderItems.product", "productName price unit") // ← FIXED
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
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ size: "A4", margin: 0 });
    doc.pipe(res);

    // Reuse your existing PDF generator function
    // We pass the full order object (it already has orderedQuantity, deliveredQuantity, etc.)
    await generateStyledInvoicePDF(
      doc,
      order,
      "ORDER INVOICE",
      `ORD-${order._id.toString().slice(-6)}`,
    );

    doc.end();

    console.log(`Order invoice served for order ${order._id}`);
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
      return res
        .status(403)
        .json({ message: "This order is not assigned to you" });
    }

    // ✅ FIXED: Allow re-accepting rejected orders assigned to current user
    if (
      order.assignmentStatus !== "assigned" &&
      order.assignmentStatus !== "rejected"
    ) {
      return res
        .status(400)
        .json({ message: "Order cannot be accepted at this stage" });
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

    // Deduct credit if credit payment
    if (request.payment === "credit") {
      customer.balanceCreditLimit -= request.grandTotal;
      await customer.save();
    }

    // Create real order
    const newOrder = await Order.create({
      customer: request.customer,
      orderItems: request.orderItems.map((item) => ({
        ...item.toObject(),
        deliveredQuantity: 0,
      })),
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

    request.status = "rejected";
    request.rejectionReason = reason || "No reason provided";
    request.approvedBy = req.user._id;
    request.approvedAt = new Date();
    await request.save();

    res.json({ message: "Order request rejected", request });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
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
    const { orderId } = req.params;
    const { packedItems } = req.body;

    // Fix: match the exact role string from your DB
    if (req.user.role.trim() !== "Store kepper") {
      return res.status(403).json({ message: "Only Store kepper can pack orders" });
    }

    const order = await Order.findById(orderId).populate("customer");
    if (!order) return res.status(404).json({ message: "Order not found" });

    // ✅ Allow packing if: pending, assigned, partial_delivered (for remaining qty)
    if (!["pending", "assigned", "partial_delivered"].includes(order.status)) {
      return res.status(400).json({ message: "Order not in packable state" });
    }

    // ✅ Calculate newly packed amount for credit deduction
    let newlyPackedAmount = 0;
    let totalPacked = 0;
    let allFullyPacked = true;

    for (const pack of packedItems) {
      const item = order.orderItems.id(pack.product);
      if (!item) continue;

      // Fix: use packedQuantity field (you introduced it earlier)
      const previousPack = item.packedQuantity || 0;
      const maxPack = item.orderedQuantity - previousPack;
      const qty = Number(pack.packedQuantity);

      if (qty > maxPack || qty < 0) {
        return res.status(400).json({ message: `Invalid pack qty for ${item.product}` });
      }

      item.packedQuantity = previousPack + qty; // Update packedQuantity
      totalPacked += qty;
      newlyPackedAmount += qty * item.price; // ✅ Track newly packed amount

      if (item.packedQuantity < item.orderedQuantity) {
        allFullyPacked = false;
      }
    }

    // ✅ Deduct credit ONLY for newly packed amount (and ONLY if payment is credit)
    if (order.payment === "credit" && newlyPackedAmount > 0) {
      const customer = await Customer.findById(order.customer);
      if (customer && customer.billingType === "Credit limit") {
        if (customer.balanceCreditLimit < newlyPackedAmount) {
          return res.status(400).json({ 
            message: `Insufficient credit limit. Need ${newlyPackedAmount.toFixed(2)}, available: ${customer.balanceCreditLimit.toFixed(2)}` 
          });
        }
        customer.balanceCreditLimit -= newlyPackedAmount;
        await customer.save();
      }
    }

    order.packedBy = req.user._id;
    order.packedAt = new Date();
    order.packedStatus = allFullyPacked ? "fully_packed" : "partially_packed";

    // ✅ Set to ready_to_deliver ONLY if fully packed AND not partially delivered yet
    if (allFullyPacked && order.status !== "partial_delivered") {
      order.status = "ready_to_deliver";
    }

    await order.save();

    res.json({
      message: allFullyPacked 
        ? `Order fully packed. Credit deducted: AED ${newlyPackedAmount.toFixed(2)}` 
        : `Partially packed: ${totalPacked} units. Credit deducted: AED ${newlyPackedAmount.toFixed(2)}`,
      order,
      creditDeducted: newlyPackedAmount,
      nextStep: allFullyPacked ? "Ready for delivery" : "Continue packing when stock arrives"
    });
  } catch (error) {
    console.error("Pack order error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
const getPendingForPacking = async (req, res) => {
  try {
    // ✅ Include BOTH unpacked AND partially packed orders
    const orders = await Order.find({
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
      .populate("customer", "name email phoneNumber address pincode")
      .populate("orderItems.product", "productName price unit");

    if (!order) return res.status(404).json({ message: "Order not found" });
    
    // ✅ Only allow if order has been packed
    if (!order.packedAt || !order.packedStatus) {
      return res.status(400).json({ message: "Order not yet packed" });
    }

    const counter = await getOrInitCounter();
    
    // ✅ Generate unique invoice number for pack invoices
    let packedInvoiceNumber = `PKD-${Date.now()}-${order._id.toString().slice(-6)}`;
    
    const filename = `packed-invoice-${order._id.toString().slice(-8)}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ size: "A4", margin: 0 });
    doc.pipe(res);

    // ✅ Generate invoice using packedQuantity instead of deliveredQuantity
    await generatePackedInvoicePDF(doc, order, "PACKED INVOICE", packedInvoiceNumber);
    
    doc.end();
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
      .populate("customer", "name email phoneNumber address pincode")
      .populate("orderItems.product", "productName price unit");

    if (!order) return res.status(404).json({ message: "Order not found" });
    
    // ✅ Only allow if order has been packed
    if (!order.packedAt || !order.packedStatus) {
      return res.status(400).json({ message: "Order must be packed first to generate invoice" });
    }

    const counter = await getOrInitCounter();
    
    // ✅ Generate unique invoice number
    let invoiceNumber = `INV-${Date.now()}-${order._id.toString().slice(-6)}`;
    
    const filename = `unified-invoice-${order._id.toString().slice(-8)}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ size: "A4", margin: 0 });
    doc.pipe(res);

    // ✅ Generate UNIFIED invoice with all quantities
    await generateUnifiedInvoicePDF(doc, order, "INVOICE", invoiceNumber);
    
    doc.end();
  } catch (error) {
    console.error("Error generating unified invoice:", error);
    if (!res.headersSent) {
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
};

// ✅ UNIFIED INVOICE PDF - Shows Ordered/Packed/Delivered columns
const generateUnifiedInvoicePDF = async (doc, order, invoiceType, invoiceNo) => {
  const company = await CompanySettings.findOne();
  if (!company) throw new Error("Company invoice settings not configured.");

  const pageWidth = 595.28;
  const margin = 50;
  const headerY = margin;

  const date = new Date(order.packedAt || Date.now());
  const formattedDate = date.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });

  // Header
  doc.fontSize(22).font("Helvetica-Bold").text(company.companyName || "INGOUDE COMPANY", margin, headerY);
  doc.fontSize(36).font("Helvetica-Bold").fillColor("#b0123b").text(invoiceType, margin, headerY + 40);

  // Invoice info
  const invoiceInfoX = pageWidth - margin - 200;
  doc.fontSize(12).font("Helvetica-Bold").fillColor("#000000")
    .text(`NO: ${invoiceNo}`, invoiceInfoX, headerY)
    .text(`Date: ${formattedDate}`, invoiceInfoX, headerY + 20);

  // Bill To / From
  const infoY = headerY + 120;
  const billToX = margin;
  const fromX = pageWidth - margin - 250;

  doc.fontSize(14).font("Helvetica-Bold").text("Bill To:", billToX, infoY);
  doc
    .fontSize(12)
    .font("Helvetica")
    .text(order.customer?.name || "N/A", billToX, infoY + 25)
    .text(order.customer?.phoneNumber || "N/A", billToX, infoY + 45)
    .text(order.customer?.address || "N/A", billToX, infoY + 65)
    .text(`Pincode: ${order.customer?.pincode || "N/A"}`, billToX, infoY + 85);

  doc.fontSize(14).font("Helvetica-Bold").text("From:", fromX, infoY);
  doc
    .fontSize(12)
    .font("Helvetica")
    .text(company.companyName || "INGOUDE COMPANY", fromX, infoY + 25)
    .text(company.companyPhone || "N/A", fromX, infoY + 45)
    .text(company.companyAddress || "N/A", fromX, infoY + 65);

  // ✅ Table with Ordered/Packed/Delivered columns
  const tableY = infoY + 130;
  const rowHeight = 45;

  const descCol = margin;
  const orderedCol = margin + 180;
  const packedCol = margin + 250;
  const deliveredCol = margin + 320;
  const priceCol = margin + 390;
  const totalCol = margin + 460;

  // Header row
  doc.rect(margin - 10, tableY - 5, pageWidth - margin * 2 + 20, rowHeight)
    .fillColor("#b0123b").fill();

  doc.fillColor("#ffffff").fontSize(11).font("Helvetica-Bold")
    .text("Description", descCol, tableY + 5)
    .text("Ordered", orderedCol, tableY + 5, { width: 65, align: "center" })
    .text("Packed", packedCol, tableY + 5, { width: 65, align: "center" })
    .text("Delivered", deliveredCol, tableY + 5, { width: 65, align: "center" })
    .text("Price", priceCol, tableY + 5, { width: 65, align: "center" })
    .text("Amount", totalCol, tableY + 5, { width: 70, align: "center" });

  // Data rows
  let currentY = tableY + rowHeight;
  let amountForBilling = 0; // Amount based on packed qty

  order.orderItems.forEach((item) => {
    const ordered = item.orderedQuantity || 0;
    const packed = item.packedQuantity || 0;
    const delivered = item.deliveredQuantity || 0;
    
    // ✅ Amount is based on PACKED quantity (for credit deduction)
    const amountThisRow = packed * item.price;
    amountForBilling += amountThisRow;

    doc.fillColor("#000000").fontSize(10).font("Helvetica")
      .text(item.product?.productName || "Unknown Product", descCol, currentY + 8)
      .text(ordered.toString(), orderedCol, currentY + 8, { width: 65, align: "center" })
      .text(packed.toString(), packedCol, currentY + 8, { width: 65, align: "center" })
      .text(delivered.toString(), deliveredCol, currentY + 8, { width: 65, align: "center" })
      .text(`AED ${item.price.toFixed(2)}`, priceCol, currentY + 8, { width: 65, align: "center" })
      .text(`AED ${amountThisRow.toFixed(2)}`, totalCol, currentY + 8, { width: 70, align: "center" });

    currentY += rowHeight;
  });

  // Grand Total (based on packed qty)
  const subtotalY = currentY + 20;
  const subtotalWidth = 200;
  const subtotalX = pageWidth - margin - subtotalWidth;

  doc.rect(subtotalX, subtotalY, subtotalWidth, 35).fillColor("#222222").fill();
  doc
    .fillColor("#ffffff")
    .fontSize(12)
    .font("Helvetica-Bold")
    .text("Amount to Bill (Packed Qty)", subtotalX + 10, subtotalY + 12)
    .text(`AED ${amountForBilling.toFixed(2)}`, subtotalX + subtotalWidth - 15, subtotalY + 12, { align: "right" });

  // Footer
  const footerY = subtotalY + 80;

  doc
    .fillColor("#000000")
    .fontSize(14)
    .font("Helvetica-Bold")
    .text("Payment Information:", margin, footerY);
  doc
    .fontSize(12)
    .font("Helvetica")
    .text(`Bank: ${company.bankName || "N/A"}`, margin, footerY + 25)
    .text(`Account: ${company.bankAccountNumber || "N/A"}`, margin, footerY + 45)
    .text(`Payment Method: ${order.payment?.charAt(0).toUpperCase() + order.payment?.slice(1) || "N/A"}`, margin, footerY + 65)
    .text(`Order ID: ${order._id.toString()}`, margin, footerY + 85);

  const thankYouX = pageWidth - margin - 200;
  doc
    .fontSize(36)
    .font("Helvetica-Bold")
    .fillColor("#000000")
    .text("Thank You!", thankYouX, footerY, { width: 200, align: "right" });

  const bottomY = footerY + 150;
  doc
    .fontSize(10)
    .font("Helvetica-Oblique")
    .fillColor("#666666")
    .text("This is a system-generated invoice. Amount shown is based on packed quantity.", margin, bottomY);
};
const generatePackedInvoicePDF = async (doc, order, invoiceType, invoiceNo) => {
  const company = await CompanySettings.findOne();
  if (!company) throw new Error("Company invoice settings not configured.");

  const pageWidth = 595.28;
  const margin = 50;
  const headerY = margin; // ← Fixed: define headerY here

  const date = new Date(order.packedAt || Date.now());
  const formattedDate = date.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });

  // Header
  doc.fontSize(22).font("Helvetica-Bold").text(company.companyName || "INGOUDE COMPANY", margin, headerY);
  doc.fontSize(36).font("Helvetica-Bold").fillColor("#b0123b").text(invoiceType, margin, headerY + 40);

  // Invoice info
  const invoiceInfoX = pageWidth - margin - 200;
  doc.fontSize(12).font("Helvetica-Bold").fillColor("#000000")
    .text(`NO: ${invoiceNo}`, invoiceInfoX, headerY)
    .text(`Date: ${formattedDate}`, invoiceInfoX, headerY + 20);

  // Bill To / From
  const infoY = headerY + 120;
  const billToX = margin;
  const fromX = pageWidth - margin - 250;

  doc.fontSize(14).font("Helvetica-Bold").text("Bill To:", billToX, infoY);
  doc
    .fontSize(12)
    .font("Helvetica")
    .text(order.customer?.name || "N/A", billToX, infoY + 25)
    .text(order.customer?.phoneNumber || "N/A", billToX, infoY + 45)
    .text(order.customer?.address || "N/A", billToX, infoY + 65)
    .text(`Pincode: ${order.customer?.pincode || "N/A"}`, billToX, infoY + 85);

  doc.fontSize(14).font("Helvetica-Bold").text("From:", fromX, infoY);
  doc
    .fontSize(12)
    .font("Helvetica")
    .text(company.companyName || "INGOUDE COMPANY", fromX, infoY + 25)
    .text(company.companyPhone || "N/A", fromX, infoY + 45)
    .text(company.companyAddress || "N/A", fromX, infoY + 65);

  // Table Header
  const tableY = infoY + 130; // adjusted from margin + 150 to keep spacing consistent
  const rowHeight = 40;
  const descCol = margin;
  const qtyCol = margin + 280;
  const priceCol = margin + 360;
  const totalCol = margin + 440;

  doc.rect(margin - 10, tableY - 5, pageWidth - margin * 2 + 20, rowHeight)
    .fillColor("#b0123b").fill();

  doc.fillColor("#ffffff").fontSize(12).font("Helvetica-Bold")
    .text("Description", descCol, tableY + 10)
    .text("Packed Qty", qtyCol, tableY + 10, { width: 70, align: "center" })
    .text("Price", priceCol, tableY + 10, { width: 70, align: "center" })
    .text("Total", totalCol, tableY + 10, { width: 70, align: "center" });

  // Data rows
  let currentY = tableY + rowHeight;
  let grandTotal = 0;

  order.orderItems.forEach((item) => {
    const qty = item.packedQuantity || 0;
    const itemTotal = qty * item.price;
    grandTotal += itemTotal;

    doc.fillColor("#000000").fontSize(12).font("Helvetica")
      .text(item.product?.productName || "Unknown Product", descCol, currentY + 10)
      .text(qty.toString(), qtyCol, currentY + 10, { width: 70, align: "center" })
      .text(`AED ${item.price.toFixed(2)}`, priceCol, currentY + 10, { width: 70, align: "center" })
      .text(`AED ${itemTotal.toFixed(2)}`, totalCol, currentY + 10, { width: 70, align: "center" });

    currentY += rowHeight;
  });

  // Grand Total
  const subtotalY = currentY + 40;
  const subtotalWidth = 200;
  const subtotalX = pageWidth - margin - subtotalWidth;

  doc.rect(subtotalX, subtotalY, subtotalWidth, 35).fillColor("#222222").fill();
  doc
    .fillColor("#ffffff")
    .fontSize(12)
    .font("Helvetica-Bold")
    .text("Grand Total", subtotalX + 15, subtotalY + 12)
    .text(`AED ${grandTotal.toFixed(2)}`, subtotalX + subtotalWidth - 20, subtotalY + 12, { align: "right" });

  // Footer (unchanged)
  const footerY = subtotalY + 80;

  doc
    .fillColor("#000000")
    .fontSize(14)
    .font("Helvetica-Bold")
    .text("Payment Information:", margin, footerY);
  doc
    .fontSize(12)
    .font("Helvetica")
    .text(`Bank: ${company.bankName || "N/A"}`, margin, footerY + 25)
    .text(`Account: ${company.bankAccountNumber || "N/A"}`, margin, footerY + 45)
    .text(
      `Payment Method: ${order.payment?.charAt(0).toUpperCase() + order.payment?.slice(1) || "N/A"}`,
      margin,
      footerY + 65
    )
    .text(`Order ID: ${order._id.toString()}`, margin, footerY + 85);

  const thankYouX = pageWidth - margin - 200;
  doc
    .fontSize(36)
    .font("Helvetica-Bold")
    .fillColor("#000000")
    .text("Thank You!", thankYouX, footerY, { width: 200, align: "right" });

  const bottomY = footerY + 150;
  doc
    .fontSize(10)
    .font("Helvetica-Oblique")
    .fillColor("#666666")
    .text("This is a system-generated invoice", margin, bottomY);
};
module.exports = {
  createOrder,
  getAllOrders,
  getOrderById,
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
  getPackedToday,
  getReadyToDeliver,
  getPackedInvoice,
  getUnifiedInvoice, // ✅ NEW unified invoice showing Ordered/Packed/Delivered
  generateUnifiedInvoicePDF // ✅ NEW unified invoice PDF generator
};
