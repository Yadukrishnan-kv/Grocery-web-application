const Order = require("../models/Order");
const Product = require("../models/Product");
const Customer = require("../models/Customer");
const User = require("../models/User");
const PDFDocument = require('pdfkit');

const createOrder = async (req, res) => {
  try {
    let { customerId, productId, orderedQuantity, payment } = req.body;

    // If user is Customer → auto-set customerId from their profile
    if (req.user.role === "Customer") {
      // Find the Customer profile linked to this logged-in User
      const customerProfile = await Customer.findOne({ user: req.user._id });
      if (!customerProfile) {
        return res.status(404).json({ message: "Your customer profile not found. Contact admin." });
      }
      customerId = customerProfile._id; // ← Auto-assign!
    }
    // For Admin → customerId must come from request body
    else if (!customerId) {
      return res.status(400).json({ message: "Customer ID is required for admin-created orders" });
    }

    // Now fetch customer using the (possibly auto-set) customerId
    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // Fetch product
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (product.quantity < orderedQuantity) {
      return res.status(400).json({ message: "Insufficient product quantity" });
    }

    const price = product.price;
    const totalAmount = price * orderedQuantity;

    // Handle credit payment
    if (payment === "credit") {
      if (customer.balanceCreditLimit < totalAmount) {
        return res.status(400).json({ message: "Insufficient credit balance" });
      }
      customer.balanceCreditLimit -= totalAmount;
      await customer.save();
    }

    // Update product stock
    product.quantity -= orderedQuantity;
    await product.save();

    // Create the order
    const order = await Order.create({
      customer: customerId,
      product: productId,
      orderedQuantity,
      price,
      totalAmount,
      payment,
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
      .populate("product", "productName price")
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
      .populate("product", "productName price quantity");
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
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

    // Revert inventory and credit if pending or partial
    if (order.status !== "delivered") {
      const remaining = order.orderedQuantity - order.deliveredQuantity;
      const product = await Product.findById(order.product);
      product.quantity += remaining;
      await product.save();

      if (order.payment === "credit") {
        const customer = await Customer.findById(order.customer);
        customer.balanceCreditLimit += (remaining * order.price);
        await customer.save();
      }
    }

    await Order.findByIdAndDelete(req.params.id);
    res.json({ message: "Order deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const deliverOrder = async (req, res) => {
  try {
    const { quantity } = req.body; // Quantity to deliver this time
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    if (order.status !== "pending") {
      return res.status(400).json({ message: "Order not pending" });
    }

    const remaining = order.orderedQuantity - order.deliveredQuantity;
    if (quantity > remaining || quantity <= 0) {
      return res.status(400).json({ message: "Invalid delivery quantity" });
    }

    order.deliveredQuantity += quantity;
    if (order.deliveredQuantity === order.orderedQuantity) {
      order.status = "delivered";
    }

    await order.save();
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const cancelOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    if (order.status !== "pending") {
      return res.status(400).json({ message: "Order not pending" });
    }

    const remaining = order.orderedQuantity - order.deliveredQuantity;

    // Revert inventory
    const product = await Product.findById(order.product);
    product.quantity += remaining;
    await product.save();

    // Revert credit if applicable
    if (order.payment === "credit") {
      const customer = await Customer.findById(order.customer);
      customer.balanceCreditLimit += (remaining * order.price);
      await customer.save();
    }

    order.status = "cancelled";
    await order.save();

    res.json(order);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};



const getDeliveredInvoice = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("customer", "name email phoneNumber address pincode balanceCreditLimit")
      .populate("product", "productName");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    
    if (order.deliveredQuantity === 0) {
      return res.status(400).json({ message: "No delivered quantity" });
    }

    const filename = `delivered-invoice-${order._id.toString().slice(-8)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    doc.pipe(res);
    
    generateStyledInvoicePDF(doc, order, 'DELIVERED INVOICE');
    doc.end();
    
  } catch (error) {
    console.error('Error generating delivered invoice:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: "Server error" });
    }
  }
};

const getPendingInvoice = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("customer", "name email phoneNumber address pincode balanceCreditLimit")
      .populate("product", "productName");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    
    const remaining = order.orderedQuantity - order.deliveredQuantity;
    if (remaining === 0) {
      return res.status(400).json({ message: "No pending quantity" });
    }

    const filename = `pending-invoice-${order._id.toString().slice(-8)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    doc.pipe(res);
    
    const pendingOrder = {
      ...order.toObject(),
      orderedQuantity: remaining,
      deliveredQuantity: 0,
      totalAmount: remaining * order.price
    };
    
    generateStyledInvoicePDF(doc, pendingOrder, 'PENDING INVOICE');
    doc.end();
    
  } catch (error) {
    console.error('Error generating pending invoice:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: "Server error" });
    }
  }
};

const generateStyledInvoicePDF = (doc, order, invoiceType) => {
  const { 
    _id: orderId, 
    customer, 
    product, 
    orderedQuantity, 
    price, 
    totalAmount, 
    payment, 
    orderDate 
  } = order;

  // Page dimensions
  const pageWidth = 595.28; // A4 width in points
  const pageHeight = 841.89; // A4 height in points
  const margin = 50;
  const contentWidth = pageWidth - (margin * 2);

  // Format date
  const date = new Date(orderDate);
  const formattedDate = date.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const invoiceNumber = `${invoiceType.includes('DELIVERED') ? 'DEL' : 'PEN'}-${orderId.toString().slice(-6)}`;

  // Set base font
  doc.fontSize(12).font('Helvetica').fillColor('#000000');

  // Header section
  const headerY = margin;
  
  // Company name (left side)
  doc.fontSize(22).font('Helvetica-Bold')
     .text('INGOUDECOMPANY', margin, headerY);
  
  // Invoice title (left side, below company name)
  doc.fontSize(36).font('Helvetica-Bold').fillColor('#b0123b')
     .text(invoiceType.includes('DELIVERED') ? 'DELIVERED INVOICE' : 'PENDING INVOICE', margin, headerY + 40);
  
  // Invoice number and date (right side)
  const invoiceInfoX = pageWidth - margin - 200;
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#000000')
     .text(`NO: ${invoiceNumber}`, invoiceInfoX, headerY)
     .text(`Date: ${formattedDate}`, invoiceInfoX, headerY + 20);
  
  // Bill To and From sections
  const infoY = headerY + 120;
  const billToX = margin;
  const fromX = pageWidth - margin - 250;
  
  // Bill To
  doc.fontSize(14).font('Helvetica-Bold')
     .text('Bill To:', billToX, infoY);
  doc.fontSize(12).font('Helvetica')
     .text(customer.name, billToX, infoY + 25)
     .text(customer.phoneNumber, billToX, infoY + 45)
     .text(customer.address, billToX, infoY + 65)
     .text(`Pincode: ${customer.pincode}`, billToX, infoY + 85);
  
  // From (Company info)
  doc.fontSize(14).font('Helvetica-Bold')
     .text('From:', fromX, infoY);
  doc.fontSize(12).font('Helvetica')
     .text('INGOUDECOMPANY', fromX, infoY + 25)
     .text('+123-456-7890', fromX, infoY + 45)
     .text('123 Anywhere St., Any City', fromX, infoY + 65);
  
  // Table section
  const tableY = infoY + 130;
  const rowHeight = 40;
  
  // Column positions (based on your CSS layout)
  const descCol = margin;
  const qtyCol = margin + 300;
  const priceCol = margin + 370;
  const totalCol = margin + 440;
  
  // Table header
  doc.rect(margin - 10, tableY - 5, contentWidth + 20, rowHeight)
     .fillColor('#b0123b').fill();
  doc.fillColor('#ffffff').fontSize(12).font('Helvetica-Bold')
     .text('Description', descCol, tableY + 10)
     .text('Qty', qtyCol, tableY + 10, { width: 70, align: 'center' })
     .text('Price', priceCol, tableY + 10, { width: 70, align: 'center' })
     .text('Total', totalCol, tableY + 10, { width: 70, align: 'center' });
  
  // Table data row
  const dataY = tableY + rowHeight;
  doc.fillColor('#000000').fontSize(12).font('Helvetica')
     .text(product.productName, descCol, dataY + 10)
     .text(orderedQuantity.toString(), qtyCol, dataY + 10, { width: 70, align: 'center' })
     .text(`$${price.toFixed(2)}`, priceCol, dataY + 10, { width: 70, align: 'center' })
     .text(`$${totalAmount.toFixed(2)}`, totalCol, dataY + 10, { width: 70, align: 'center' });
  
  // Table bottom border
  doc.strokeColor('#dddddd').lineWidth(1)
     .moveTo(margin - 10, dataY + rowHeight)
     .lineTo(margin - 10 + contentWidth + 20, dataY + rowHeight)
     .stroke();
  
  // Subtotal section (right aligned)
  const subtotalY = dataY + 80;
  const subtotalWidth = 200;
  const subtotalX = pageWidth - margin - subtotalWidth;
  
  doc.rect(subtotalX, subtotalY, subtotalWidth, 35)
     .fillColor('#222222').fill();
  doc.fillColor('#ffffff').fontSize(12).font('Helvetica-Bold')
     .text('Sub Total', subtotalX + 15, subtotalY + 12)
     .text(`$${totalAmount.toFixed(2)}`, subtotalX + subtotalWidth - 20, subtotalY + 12, { align: 'right' });
  
  // Footer section
  const footerY = subtotalY + 80;
  
  // Payment Information (left side)
  doc.fillColor('#000000').fontSize(14).font('Helvetica-Bold')
     .text('Payment Information:', margin, footerY);
  doc.fontSize(12).font('Helvetica')
     .text('Bank: Name Bank', margin, footerY + 25)
     .text('No Bank: 123-456-7890', margin, footerY + 45)
     .text(`Payment Method: ${payment.charAt(0).toUpperCase() + payment.slice(1)}`, margin, footerY + 65)
     .text(`Order ID: ${orderId.toString()}`, margin, footerY + 85);
  
  // Thank You message (right side)
  const thankYouX = pageWidth - margin - 200;
  doc.fontSize(36).font('Helvetica-Bold').fillColor('#000000')
     .text('Thank You!', thankYouX, footerY, { width: 200, align: 'right' });
  
  // System-generated note at bottom
  const bottomY = footerY + 150;
  doc.fontSize(10).font('Helvetica-Oblique').fillColor('#666666')
     .text('This is a system-generated invoice', margin, bottomY);
};




const assignOrderToDeliveryMan = async (req, res) => {
  try {
    const { deliveryManId } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.assignmentStatus !== "pending_assignment") {
      return res.status(400).json({ message: "Order is not available for assignment" });
    }

    // Check if user exists and is deliveryman
    const deliveryMan = await User.findOne({ _id: deliveryManId, role: "Delivery Man" });
    if (!deliveryMan) {
      return res.status(400).json({ message: "Valid delivery man not found" });
    }

    order.assignedTo = deliveryManId;
    order.assignmentStatus = "assigned";
    order.assignedAt = new Date();

    await order.save();

    res.json({
      message: "Order assigned successfully",
      order,
    });
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
      .populate("product", "productName price")
      .populate("assignedTo", "username email")
      .sort({ assignedAt: -1 });

    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
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

    if (order.assignmentStatus !== "assigned") {
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
    const { reason } = req.body; // optional

    const order = await Order.findById(req.params.id);

    if (!order) return res.status(404).json({ message: "Order not found" });

    if (String(order.assignedTo) !== String(req.user._id)) {
      return res.status(403).json({ message: "This order is not assigned to you" });
    }

    if (order.assignmentStatus !== "assigned") {
      return res.status(400).json({ message: "Order cannot be rejected at this stage" });
    }

    order.assignmentStatus = "rejected";
    // You can store rejection reason if you want
    // order.rejectionReason = reason || "No reason provided";

    await order.save();

    // Optional: You can make order available for reassignment again
    // order.assignedTo = null;
    // order.assignmentStatus = "pending_assignment";

    res.json({ message: "Order rejected", order });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const getDeliveredOrdersForAdmin = async (req, res) => {
  try {
    // Admin can view all delivered orders
    const orders = await Order.find({ 
      status: "delivered",
      deliveredQuantity: { $gt: 0 }
    })
      .populate("customer", "name email phoneNumber address pincode")
      .populate("product", "productName price")
      .populate("assignedTo", "username") // Delivery partner info
      .sort({ orderDate: -1 });

    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const getMyOrders = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "Customer") {
      return res.status(403).json({ message: "Access denied - Customers only" });
    }

    // Find the Customer profile linked to this logged-in User
    const customer = await Customer.findOne({ user: req.user._id });
    if (!customer) {
      return res.status(404).json({ message: "Your customer profile not found. Contact admin." });
    }

    const orders = await Order.find({ customer: customer._id })
      .populate("product", "productName price quantity")
      .populate("assignedTo", "username email") // Delivery partner if assigned
      .sort({ orderDate: -1 });

    res.json(orders);
  } catch (error) {
    console.error("Get customer orders error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const getCustomerOrders = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "Customer") {
      return res.status(403).json({ message: "Access denied" });
    }

    // Find the Customer document linked to this logged-in User
    const customer = await Customer.findOne({ user: req.user._id });
    if (!customer) {
      return res.status(404).json({ message: "Customer profile not found" });
    }

    const orders = await Order.find({ customer: customer._id })
      .populate("product", "productName price")
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

    const order = await Order.findById(req.params.id)
      .populate("customer", "name email phoneNumber address pincode balanceCreditLimit")
      .populate("product", "productName price quantity")
      .populate("assignedTo", "username");

    if (!order || order.customer.toString() !== req.user._id.toString()) {
      return res.status(404).json({ message: "Order not found" });
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
  rejectAssignedOrder,getDeliveredOrdersForAdmin,getCustomerOrders,getCustomerOrderById,getMyOrders
};