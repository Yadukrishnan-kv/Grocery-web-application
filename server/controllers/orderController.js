const Order = require("../models/Order");
const Product = require("../models/Product");
const Customer = require("../models/Customer");
const User = require("../models/User");
const CompanySettings = require("../models/CompanySettings");
const InvoiceCounter = require('../models/InvoiceCounter');
const { createInvoiceBasedBill } = require('../controllers/billController');  // ← import it
const PaymentTransaction = require("../models/PaymentTransaction");

const PDFDocument = require('pdfkit');

const createOrder = async (req, res) => {
  try {
    let { customerId, orderItems, payment, remarks } = req.body;

    // Auto-set customerId for Customer role
    if (req.user.role === "Customer") {
      const customerProfile = await Customer.findOne({ user: req.user._id });
      if (!customerProfile) {
        return res.status(404).json({ message: "Your customer profile not found. Contact admin." });
      }
      customerId = customerProfile._id;
    } else if (!customerId) {
      return res.status(400).json({ message: "Customer ID is required for admin-created orders" });
    }

    const customer = await Customer.findById(customerId);
    if (!customer) return res.status(404).json({ message: "Customer not found" });

    if (!Array.isArray(orderItems) || orderItems.length === 0) {
      return res.status(400).json({ message: "At least one product is required" });
    }

    let grandTotal = 0;
    const processedItems = [];

    for (const item of orderItems) {
      const product = await Product.findById(item.productId);
      if (!product) return res.status(404).json({ message: `Product ${item.productId} not found` });

      // NO STOCK CHECK ANYMORE – as per your request
      // if (product.quantity < item.orderedQuantity) { ... } ← REMOVED

      const itemTotal = product.price * item.orderedQuantity;
      grandTotal += itemTotal;

      processedItems.push({
        product: item.productId,
        unit: product.unit,
        orderedQuantity: item.orderedQuantity,
        deliveredQuantity: 0,
        price: product.price,
        totalAmount: itemTotal,
        remarks: item.remarks || '',
      });

      // NO STOCK REDUCTION ANYMORE – as per your request
      // product.quantity -= item.orderedQuantity;
      // await product.save(); ← REMOVED
    }

    // Handle credit payment (still keep this check)
    if (payment === "credit") {
      if (customer.balanceCreditLimit < grandTotal) {
        return res.status(400).json({ message: "Insufficient credit balance" });
      }
      customer.balanceCreditLimit -= grandTotal;
      await customer.save();
    }

    const order = await Order.create({
      customer: customerId,
      orderItems: processedItems,
      payment,
      remarks: remarks || '',
      orderDate: req.body.orderDate || new Date(),
    });

    res.status(201).json(order);
  } catch (error) {
    console.error("Create order error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};


const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("customer", "name email phoneNumber address pincode")
      .populate("orderItems.product", "productName price unit")   // ← FIXED
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
      .populate("customer", "name email phoneNumber address pincode balanceCreditLimit")
      .populate("orderItems.product", "productName price quantity unit");   // ← FIXED
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
      return res.status(400).json({ message: "Cannot update non-pending order" });
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
        return res.status(400).json({ message: "Insufficient product quantity" });
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
    // deliveredItems: [{ product: productId, quantity: number }]

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (order.status === "delivered" || order.status === "cancelled") {
      return res.status(400).json({ message: "Order cannot be delivered" });
    }

    let grandDeliveryAmount = 0;

    // Validate and update each item
    for (const inputItem of deliveredItems) {
      const orderItem = order.orderItems.id(inputItem.product);
      if (!orderItem) {
        return res.status(400).json({ message: `Product ${inputItem.product} not found in order` });
      }

      const qtyToDeliver = Number(inputItem.quantity);
      const remaining = orderItem.orderedQuantity - orderItem.deliveredQuantity;

      if (qtyToDeliver <= 0 || qtyToDeliver > remaining) {
        return res.status(400).json({
          message: `Invalid quantity for ${orderItem.product.productName || "product"}: max ${remaining}`
        });
      }

      orderItem.deliveredQuantity += qtyToDeliver;
      grandDeliveryAmount += qtyToDeliver * orderItem.price;
    }

    // Payment handling (same as before)
    if (paymentMethod === "credit") {
      const customer = await Customer.findById(order.customer);
      if (customer.balanceCreditLimit < grandDeliveryAmount) {
        return res.status(400).json({ message: "Insufficient credit balance" });
      }
      customer.balanceCreditLimit -= grandDeliveryAmount;
      await customer.save();
    } else if (paymentMethod === "cash" || paymentMethod === "cheque") {
      await PaymentTransaction.create({
        order: order._id,
        deliveryMan: req.user._id,
        amount: grandDeliveryAmount,
        method: paymentMethod,
        chequeDetails: paymentMethod === "cheque" ? chequeDetails : undefined,
      });
    }

    // Update status if fully delivered
    const totalOrdered = order.orderItems.reduce((sum, i) => sum + i.orderedQuantity, 0);
    const totalDelivered = order.orderItems.reduce((sum, i) => sum + i.deliveredQuantity, 0);
    if (totalDelivered >= totalOrdered) {
      order.status = "delivered";
    } else {
      order.status = "partial_delivered"; // optional new status
    }

    order.deliveredAt = deliveredAt ? new Date(deliveredAt) : new Date();

    await order.save();

    // Optional: create invoice if fully delivered and invoice-based
    const customer = await Customer.findById(order.customer);
    if (order.status === "delivered" && customer?.statementType === "invoice-based") {
      await createInvoiceBasedBill(order);
    }

    res.json(order);
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

    // Revert stock for all items
    for (const item of order.orderItems) {
      const product = await Product.findById(item.product);
      product.quantity += item.orderedQuantity - item.deliveredQuantity;
      await product.save();
    }

    // Revert credit if applicable
    if (order.payment === "credit") {
      const customer = await Customer.findById(order.customer);
      const remainingAmount = order.orderItems.reduce(
        (sum, item) => sum + (item.orderedQuantity - item.deliveredQuantity) * item.price,
        0
      );
      customer.balanceCreditLimit += remainingAmount;
      await customer.save();
    }

    order.status = "cancelled";
    await order.save();

    res.json(order);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};



// Helper to get or initialize counter
const getOrInitCounter = async () => {
  let counter = await InvoiceCounter.findOne();
  if (!counter) {
    counter = await InvoiceCounter.create({ deliveredCount: 0, pendingCount: 0 });
  }
  return counter;
};

const getDeliveredInvoice = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("customer", "name email phoneNumber address pincode balanceCreditLimit")
      .populate("orderItems.product", "productName price unit");  // ← FIXED HERE

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.totalDeliveredQuantity === 0) {  // Use virtual if you have it, or calculate
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
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    doc.pipe(res);

    // IMPORTANT: Your generateStyledInvoicePDF is still using old single-product destructuring!
    // Update it too (see below)
    await generateStyledInvoicePDF(doc, order, 'DELIVERED INVOICE', invoiceNo);

    doc.end();
  } catch (error) {
    console.error('Error generating delivered invoice:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
};

const getPendingInvoice = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("customer", "name email phoneNumber address pincode balanceCreditLimit")
      .populate("orderItems.product", "productName price unit");  // ← FIXED HERE

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const totalOrdered = order.totalOrderedQuantity || order.orderItems.reduce((s, i) => s + i.orderedQuantity, 0);
    const totalDelivered = order.totalDeliveredQuantity || order.orderItems.reduce((s, i) => s + i.deliveredQuantity, 0);
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
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    doc.pipe(res);

    // Create pending version with remaining quantities
    const pendingOrder = {
      ...order.toObject(),
      orderItems: order.orderItems.map(item => ({
        ...item.toObject(),
        orderedQuantity: item.orderedQuantity - item.deliveredQuantity,
        deliveredQuantity: 0,
        totalAmount: (item.orderedQuantity - item.deliveredQuantity) * item.price
      }))
    };

    await generateStyledInvoicePDF(doc, pendingOrder, 'PENDING INVOICE', invoiceNo);

    doc.end();
  } catch (error) {
    console.error('Error generating pending invoice:', error);
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
  const contentWidth = pageWidth - (margin * 2);

  const date = new Date(order.orderDate || order.deliveredAt || Date.now());
  const formattedDate = date.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  doc.fontSize(12).font('Helvetica').fillColor('#000000');

  // Header
  const headerY = margin;
  doc.fontSize(22).font('Helvetica-Bold')
     .text(company.companyName || 'INGOUDE COMPANY', margin, headerY);

  doc.fontSize(36).font('Helvetica-Bold').fillColor('#b0123b')
     .text(invoiceType, margin, headerY + 40);

  const invoiceInfoX = pageWidth - margin - 200;
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#000000')
     .text(`NO: ${invoiceNo}`, invoiceInfoX, headerY)
     .text(`Date: ${formattedDate}`, invoiceInfoX, headerY + 20);

  // Bill To / From (unchanged)
  const infoY = headerY + 120;
  const billToX = margin;
  const fromX = pageWidth - margin - 250;

  doc.fontSize(14).font('Helvetica-Bold').text('Bill To:', billToX, infoY);
  doc.fontSize(12).font('Helvetica')
     .text(order.customer?.name || 'N/A', billToX, infoY + 25)
     .text(order.customer?.phoneNumber || 'N/A', billToX, infoY + 45)
     .text(order.customer?.address || 'N/A', billToX, infoY + 65)
     .text(`Pincode: ${order.customer?.pincode || 'N/A'}`, billToX, infoY + 85);

  doc.fontSize(14).font('Helvetica-Bold').text('From:', fromX, infoY);
  doc.fontSize(12).font('Helvetica')
     .text(company.companyName || 'INGOUDE COMPANY', fromX, infoY + 25)
     .text(company.companyPhone || 'N/A', fromX, infoY + 45)
     .text(company.companyAddress || 'N/A', fromX, infoY + 65);

  // Table - now supports MULTIPLE products
  const tableY = infoY + 130;
  const rowHeight = 40;

  const descCol = margin;
  const qtyCol = margin + 280;
  const priceCol = margin + 360;
  const totalCol = margin + 440;

  // Header row
  doc.rect(margin - 10, tableY - 5, contentWidth + 20, rowHeight)
     .fillColor('#b0123b').fill();
  doc.fillColor('#ffffff').fontSize(12).font('Helvetica-Bold')
     .text('Description', descCol, tableY + 10)
     .text('Qty', qtyCol, tableY + 10, { width: 70, align: 'center' })
     .text('Price', priceCol, tableY + 10, { width: 70, align: 'center' })
     .text('Total', totalCol, tableY + 10, { width: 70, align: 'center' });

  // Data rows - loop through orderItems
  let currentY = tableY + rowHeight;
  let grandTotal = 0;

  order.orderItems.forEach(item => {
    const qty = invoiceType.includes('PENDING') 
      ? (item.orderedQuantity - item.deliveredQuantity)
      : item.deliveredQuantity || item.orderedQuantity;

    const itemTotal = qty * item.price;
    grandTotal += itemTotal;

    doc.fillColor('#000000').fontSize(12).font('Helvetica')
       .text(item.product?.productName || 'Unknown Product', descCol, currentY + 10)
       .text(qty.toString(), qtyCol, currentY + 10, { width: 70, align: 'center' })
       .text(`AED ${item.price.toFixed(2)}`, priceCol, currentY + 10, { width: 70, align: 'center' })
       .text(`AED ${itemTotal.toFixed(2)}`, totalCol, currentY + 10, { width: 70, align: 'center' });

    currentY += rowHeight;
  });

  // Subtotal
  const subtotalY = currentY + 40;
  const subtotalWidth = 200;
  const subtotalX = pageWidth - margin - subtotalWidth;

  doc.rect(subtotalX, subtotalY, subtotalWidth, 35)
     .fillColor('#222222').fill();
  doc.fillColor('#ffffff').fontSize(12).font('Helvetica-Bold')
     .text('Grand Total', subtotalX + 15, subtotalY + 12)
     .text(`AED ${grandTotal.toFixed(2)}`, subtotalX + subtotalWidth - 20, subtotalY + 12, { align: 'right' });

  // Footer - unchanged
  const footerY = subtotalY + 80;

  doc.fillColor('#000000').fontSize(14).font('Helvetica-Bold')
     .text('Payment Information:', margin, footerY);
  doc.fontSize(12).font('Helvetica')
     .text(`Bank: ${company.bankName || 'N/A'}`, margin, footerY + 25)
     .text(`Account: ${company.bankAccountNumber || 'N/A'}`, margin, footerY + 45)
     .text(`Payment Method: ${order.payment?.charAt(0).toUpperCase() + order.payment?.slice(1) || 'N/A'}`, margin, footerY + 65)
     .text(`Order ID: ${order._id.toString()}`, margin, footerY + 85);

  const thankYouX = pageWidth - margin - 200;
  doc.fontSize(36).font('Helvetica-Bold').fillColor('#000000')
     .text('Thank You!', thankYouX, footerY, { width: 200, align: 'right' });

  const bottomY = footerY + 150;
  doc.fontSize(10).font('Helvetica-Oblique').fillColor('#666666')
     .text('This is a system-generated invoice', margin, bottomY);
};


const assignOrderToDeliveryMan = async (req, res) => {
  try {
    const { deliveryManId } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (order.assignmentStatus !== "pending_assignment" && order.assignmentStatus !== "rejected") {
      return res.status(400).json({ message: "Order is not available for assignment" });
    }

    const deliveryMan = await User.findOne({ _id: deliveryManId, role: "Delivery Man" });
    if (!deliveryMan) return res.status(400).json({ message: "Valid delivery man not found" });

    order.assignedTo = deliveryManId;
    order.assignmentStatus = "assigned";
    order.assignedAt = new Date();

    await order.save();

    // Fixed populate
    const updatedOrder = await Order.findById(order._id)
      .populate("customer", "name email phoneNumber address pincode")
      .populate("orderItems.product", "productName price unit")   // ← FIXED
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
    
    const deliveryRoles = ["Delivery partner", "delivery partner", "deliveryman", "Delivery Man"];
    if (!deliveryRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "Only delivery personnel can access this" });
    }

    const orders = await Order.find({
    assignedTo: req.user._id,
    assignmentStatus: { $in: ["assigned", "accepted", "rejected"] },
  })
    .populate("customer", "name phoneNumber address pincode")
    .populate("orderItems.product", "productName price unit")   // ← FIXED
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
      .populate("customer", "name email phoneNumber address pincode balanceCreditLimit")
      .populate("product", "productName price");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const filename = `order-invoice-${order._id.toString().slice(-8)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    doc.pipe(res);

    // Reuse your existing PDF generator function
    // We pass the full order object (it already has orderedQuantity, deliveredQuantity, etc.)
    await generateStyledInvoicePDF(doc, order, 'ORDER INVOICE', `ORD-${order._id.toString().slice(-6)}`);

    doc.end();

    console.log(`Order invoice served for order ${order._id}`);
  } catch (error) {
    console.error('Error generating order invoice:', error);
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
    
    // ✅ FIXED: Allow re-accepting rejected orders assigned to current user
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
      return res.status(403).json({ message: "This order is not assigned to you" });
    }
    
    if (order.assignmentStatus !== "assigned") {
      return res.status(400).json({ message: "Order cannot be rejected at this stage" });
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
    // Show ALL orders that have ANY delivered quantity (partial or full)
    const orders = await Order.find({ 
      deliveredQuantity: { $gt: 0 }  // ← This is the key change!
      // Removed status: "delivered" filter so partial deliveries are included
    })
      .populate("customer", "name email phoneNumber address pincode")
      .populate("product", "productName price")
      .populate("assignedTo", "username") // Delivery partner info
      .sort({ orderDate: -1 });

    res.json(orders);
  } catch (error) {
    console.error("Error fetching delivered orders for admin:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const getMyOrders = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "Customer") {
      return res.status(403).json({ message: "Access denied - Customers only" });
    }

    const customer = await Customer.findOne({ user: req.user._id });
    if (!customer) {
      return res.status(404).json({ message: "Your customer profile not found." });
    }

    const orders = await Order.find({ customer: customer._id })
      .populate("orderItems.product", "productName price unit quantity")   // ← FIXED HERE
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
      .populate("orderItems.product", "productName price unit")   // ← FIXED HERE
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
      .populate("customer", "name email phoneNumber address pincode balanceCreditLimit")
      .populate("orderItems.product", "productName price quantity unit")   // ← FIXED HERE
      .populate("assignedTo", "username");

    if (!order) {
      return res.status(404).json({ message: "Order not found or not yours" });
    }

    res.json(order);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
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
  rejectAssignedOrder,getDeliveredOrdersForAdmin,getCustomerOrders,getCustomerOrderById,getMyOrders,getOrderInvoice
};