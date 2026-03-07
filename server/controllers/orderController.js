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

    if (req.user.role === "Customer") {
      const customerProfile = await Customer.findOne({ user: req.user._id });
      if (!customerProfile) {
        return res.status(404).json({ message: "Your customer profile not found." });
      }
      customerId = customerProfile._id;
    } else if (!customerId) {
      return res.status(400).json({ message: "Customer ID is required" });
    }

    const customer = await Customer.findById(customerId);
    if (!customer) return res.status(404).json({ message: "Customer not found" });

    if (customer.billingType === "Credit limit") {
      if (customer.balanceCreditLimit <= 0) {
        return res.status(403).json({ message: "Insufficient credit limit or zero balance." });
      }
      const overdueBill = await Bill.findOne({ customer: customer._id, status: "overdue" });
      if (overdueBill) {
        return res.status(403).json({ message: "Cannot place order - you have overdue bills. Please clear dues first." });
      }
    }

    if (!Array.isArray(orderItems) || orderItems.length === 0) {
      return res.status(400).json({ message: "At least one product required" });
    }

    let grandTotal = 0;
    const processedItems = [];
    for (const item of orderItems) {
      const product = await Product.findById(item.productId);
      if (!product) return res.status(404).json({ message: `Product not found: ${item.productId}` });
      const itemTotal = product.price * item.orderedQuantity;
      grandTotal += itemTotal;
      processedItems.push({
        product: item.productId,
        unit: product.unit,
        orderedQuantity: item.orderedQuantity,
        deliveredQuantity: 0,
        packedQuantity: 0,
        invoicedQuantity: 0,
        price: product.price,
        totalAmount: itemTotal,
        remarks: item.remarks || "",
      });
    }

    let initialStatus = "pending";
    const isSalesman = ["Salesman", "Sales Person", "delivery partner", "Delivery Man"].includes(req.user.role);
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
      approvalStatus: initialStatus === "pending_approval" ? "pending" : undefined,
    });

    res.status(201).json({
      message: initialStatus === "pending_approval" ? "Order created successfully. Waiting for admin approval." : "Order created successfully.",
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
    
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    
    const doc = new PDFDocument({ size: "A4", margin: 0 });
    doc.pipe(res);
    
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

    // Invoice is generated when order is fully packed
    if (!order.invoiceNumber) {
      return res.status(400).json({ message: "Invoice will be generated after order is fully packed" });
    }

    const invoiceNo = order.invoiceNumber;

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
    // 1. Authorization
    if (req.user.role.trim() !== "Store kepper") {
      return res.status(403).json({ message: "Only Storekeeper can pack orders" });
    }

    const { packedItems } = req.body; // [{ product: orderItem._id, packedQuantity: number }, ...]

    const order = await Order.findById(req.params.orderId)
      .populate("customer")
      .populate("orderItems.product", "productName price unit");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (!["pending", "assigned", "partial_delivered"].includes(order.status)) {
      return res.status(400).json({ message: "Order not in packable state" });
    }

    // 2. Validate and calculate newly packed quantities
    let newlyPackedAmount = 0;
    let totalNewlyPackedQty = 0;
    let allFullyPacked = true;
    const newlyPackedItems = []; // for invoice history

    for (const pack of packedItems) {
      const orderItem = order.orderItems.id(pack.product); // pack.product = orderItem _id

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

      // Track for this packing event
      if (qtyToPackNow > 0) {
        newlyPackedItems.push({
          product: orderItem.product,           // Product _id
          quantity: qtyToPackNow,               // only this packing
          price: orderItem.price,
        });

        newlyPackedAmount += qtyToPackNow * orderItem.price;
        totalNewlyPackedQty += qtyToPackNow;
      }

      if (orderItem.packedQuantity < orderItem.orderedQuantity) {
        allFullyPacked = false;
      }
    }

    // 3. Credit deduction (only for newly packed this time)
    if (order.payment === "credit" && newlyPackedAmount > 0) {
      const customer = await Customer.findById(order.customer);
      if (customer?.billingType === "Credit limit") {
        if (customer.balanceCreditLimit < newlyPackedAmount) {
          return res.status(400).json({
            message: `Insufficient credit. Need ${newlyPackedAmount.toFixed(2)}, available ${customer.balanceCreditLimit.toFixed(2)}`,
          });
        }
        customer.balanceCreditLimit -= newlyPackedAmount;
        await customer.save();
      }
    }

    // 4. Generate new invoice number ONLY when something new is packed
    let newInvoiceNumber = order.invoiceNumber; // keep last one if no new packing

    if (newlyPackedAmount > 0) {
      const counter = await InvoiceCounter.findOneAndUpdate(
        {},
        { $inc: { invoiceCount: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );

      newInvoiceNumber = `DEL-${String(counter.invoiceCount).padStart(2, "0")}`;

      // Add to immutable history - IMPORTANT: store ONLY this packing's items
      if (!order.invoiceHistory) order.invoiceHistory = [];

      order.invoiceHistory.push({
        invoiceNumber: newInvoiceNumber,
        quantity: totalNewlyPackedQty,
        amount: newlyPackedAmount,
        createdAt: new Date(),
        items: newlyPackedItems, // ← this is what allows correct PDF later
      });

      // Update current active invoice number
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
        ? `Order fully packed. Credit deducted: AED ${newlyPackedAmount.toFixed(2)}`
        : `Partially packed (${totalNewlyPackedQty} units this time). Credit deducted: AED ${newlyPackedAmount.toFixed(2)}`,
      order,
      invoiceNumber: newInvoiceNumber,
      newlyPacked: {
        quantity: totalNewlyPackedQty,
        amount: newlyPackedAmount,
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
    const orders = await Order.find({
      $or: [{ packedStatus: { $in: ["not_packed", "partially_packed"] } }, { status: "pending" }],
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
      .populate("customer", "name email phoneNumber address pincode")
      .populate("orderItems.product", "productName price unit");
    
    if (!order) return res.status(404).json({ message: "Order not found" });
    
    if (!order.packedAt || !order.packedStatus) {
      return res.status(400).json({ message: "Order not yet packed" });
    }
    
    // ✅✅✅ USE EXISTING INVOICE NUMBER (DEL-XX) ✅✅✅
    const invoiceNumber = order.invoiceNumber || `DEL-${order._id.toString().slice(-6).toUpperCase()}`;
    
    const filename = `packed-invoice-${invoiceNumber}.pdf`;
    
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    
    const doc = new PDFDocument({ size: "A4", margin: 0 });
    doc.pipe(res);
    
    await generatePackedInvoicePDF(doc, order, "PACKED INVOICE", invoiceNumber);
    
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
    if (!order.packedAt || !order.packedStatus) {
      return res.status(400).json({ message: "Order must be packed first to generate invoice" });
    }
    // NEW: Accept specific invoiceNumber from query (for historical)
    const targetInvoiceNo = req.query.invoiceNumber || order.invoiceNumber;
    if (!order.invoiceHistory.some(h => h.invoiceNumber === targetInvoiceNo)) {
      return res.status(404).json({ message: "Specified invoice not found in order history" });
    }
    const filename = `unified-invoice-${targetInvoiceNo}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    const doc = new PDFDocument({ size: "A4", margin: 0 });
    doc.pipe(res);
    // Pass target invoiceNo
    await generateUnifiedInvoicePDF(doc, order, "INVOICE", targetInvoiceNo);
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

  // ─── Header ───────────────────────────────────────────────────────
  doc.fontSize(22).font("Helvetica-Bold").text(company.companyName || "INGOUDE COMPANY", margin, headerY);
  doc.fontSize(36).font("Helvetica-Bold").fillColor("#b0123b").text(invoiceType, margin, headerY + 40);

  // ─── Invoice Number & Date ───────
  const invoiceInfoX = pageWidth - margin - 200;
  doc
    .fontSize(12)
    .font("Helvetica-Bold")
    .fillColor("#000000")
    .text(`Invoice No: ${invoiceNo}`, invoiceInfoX, headerY)
    .text(`Date: ${formattedDate}`, invoiceInfoX, headerY + 20);

  // ─── Bill To / From ───────────────────────────────────────────────
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

  // ─── Table: S.No | Description | Qty | Price | Total ─────────────────
  const tableY = infoY + 130;
  const rowHeight = 45;
  
  // ✅ NEW COLUMN POSITIONS with S.No
  const snoCol = margin;                    // S.No column
  const descCol = margin + 40;              // Description (shifted right)
  const qtyCol = margin + 260;              // Qty
  const priceCol = margin + 320;            // Price
  const totalCol = margin + 380;            // Total

  // Header row
  doc
    .rect(margin - 10, tableY - 5, pageWidth - margin * 2 + 20, rowHeight)
    .fillColor("#b0123b")
    .fill();
  doc
    .fillColor("#ffffff")
    .fontSize(10)
    .font("Helvetica-Bold")
    .text("S.No", snoCol, tableY + 8, { width: 30, align: "center" })  // ✅ S.No header
    .text("Description", descCol, tableY + 8)
    .text("Qty", qtyCol, tableY + 8, { width: 50, align: "center" })
    .text("Price", priceCol, tableY + 8, { width: 50, align: "center" })
    .text("Total", totalCol, tableY + 8, { width: 50, align: "center" });

  // ─── NEW: Use specific history entry for this invoiceNo ─────────
  const historyEntry = order.invoiceHistory.find(h => h.invoiceNumber === invoiceNo);
  if (!historyEntry) throw new Error(`History entry not found for ${invoiceNo}`);

  let currentY = tableY + rowHeight;
  let amountForBilling = 0;
  let serialNumber = 1;  // ✅ Start serial number at 1

  // FIXED: Correctly find orderItem using oi.product._id (populated)
  for (const histItem of historyEntry.items) {
    const orderItem = order.orderItems.find(oi => oi.product._id.toString() === histItem.product.toString());
    if (!orderItem) continue;

    const qty = histItem.quantity;
    const price = histItem.price;
    const total = qty * price;
    amountForBilling += total;

    doc
      .fillColor("#000000")
      .fontSize(10)
      .font("Helvetica")
      // ✅ ADD SERIAL NUMBER
      .text(serialNumber.toString(), snoCol, currentY + 8, { width: 30, align: "center" })
      .text(orderItem.product?.productName || "Unknown Product", descCol, currentY + 8)
      .text(qty.toString(), qtyCol, currentY + 8, { width: 50, align: "center" })
      .text(`AED ${price.toFixed(2)}`, priceCol, currentY + 8, { width: 50, align: "center" })
      .text(`AED ${total.toFixed(2)}`, totalCol, currentY + 8, { width: 50, align: "center" });
    
    currentY += rowHeight;
    serialNumber++;  // ✅ Increment serial number
  }

  // Verify total matches history (debug)
  if (amountForBilling !== historyEntry.amount) {
    console.warn(`Amount mismatch for ${invoiceNo}: calculated ${amountForBilling}, history ${historyEntry.amount}`);
  }

  // ─── Grand Total (for THIS invoice only) ───────────────────────────
  const subtotalY = currentY + 20;
  const subtotalWidth = 220;
  const subtotalX = pageWidth - margin - subtotalWidth;
  doc.rect(subtotalX, subtotalY, subtotalWidth, 40).fillColor("#222222").fill();
  doc
    .fillColor("#ffffff")
    .fontSize(12)
    .font("Helvetica-Bold")
    .text("Total (This Invoice)", subtotalX + 15, subtotalY + 12)
    .text(`AED ${amountForBilling.toFixed(2)}`, subtotalX + subtotalWidth - 20, subtotalY + 12, { align: "right" });

  // ─── Footer ───────────────────────────────────────────────────────
  const footerY = subtotalY + 80;
  doc.fillColor("#000000").fontSize(14).font("Helvetica-Bold").text("Payment Information:", margin, footerY);
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
  doc.fontSize(36).font("Helvetica-Bold").fillColor("#000000").text("Thank You!", thankYouX, footerY, { width: 200, align: "right" });
  const bottomY = footerY + 150;
  doc.fontSize(10).font("Helvetica-Oblique").fillColor("#666666").text(`Invoice Reference: ${invoiceNo}`, margin, bottomY);
};
const generatePackedInvoicePDF = async (doc, order, invoiceType, invoiceNo) => {
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

  // Table Header - ✅ UPDATED WITH S.No
  const tableY = infoY + 130;
  const rowHeight = 40;
  
  // ✅ NEW COLUMN POSITIONS with S.No
  const snoCol = margin;
  const descCol = margin + 40;
  const qtyCol = margin + 260;
  const priceCol = margin + 320;
  const totalCol = margin + 380;

  doc.rect(margin - 10, tableY - 5, pageWidth - margin * 2 + 20, rowHeight)
    .fillColor("#b0123b").fill();

  doc.fillColor("#ffffff").fontSize(10).font("Helvetica-Bold")
    .text("S.No", snoCol, tableY + 8, { width: 30, align: "center" })  // ✅ S.No header
    .text("Description", descCol, tableY + 8)
    .text("Packed Qty", qtyCol, tableY + 8, { width: 50, align: "center" })
    .text("Price", priceCol, tableY + 8, { width: 50, align: "center" })
    .text("Total", totalCol, tableY + 8, { width: 50, align: "center" });

  // Data rows - ✅ ADD SERIAL NUMBER
  let currentY = tableY + rowHeight;
  let grandTotal = 0;
  let serialNumber = 1;  // ✅ Start at 1

  order.orderItems.forEach((item) => {
    const qty = item.packedQuantity || 0;
    const itemTotal = qty * item.price;
    grandTotal += itemTotal;

    doc.fillColor("#000000").fontSize(10).font("Helvetica")
      // ✅ ADD SERIAL NUMBER
      .text(serialNumber.toString(), snoCol, currentY + 8, { width: 30, align: "center" })
      .text(item.product?.productName || "Unknown Product", descCol, currentY + 8)
      .text(qty.toString(), qtyCol, currentY + 8, { width: 50, align: "center" })
      .text(`AED ${item.price.toFixed(2)}`, priceCol, currentY + 8, { width: 50, align: "center" })
      .text(`AED ${itemTotal.toFixed(2)}`, totalCol, currentY + 8, { width: 50, align: "center" });

    currentY += rowHeight;
    serialNumber++;  // ✅ Increment
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
  getMyPendingOrders,
  getPackedToday,
  getReadyToDeliver,
  getPackedInvoice,
  getUnifiedInvoice, // ✅ NEW unified invoice showing Ordered/Packed/Delivered
  generateUnifiedInvoicePDF, // ✅ NEW unified invoice PDF generator
 getAllOrdersForStorekeeper
};
