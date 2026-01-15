const Order = require("../models/Order");
const Product = require("../models/Product");
const Customer = require("../models/Customer");
const User = require("../models/User");

const createOrder = async (req, res) => {
  try {
    const { customerId, productId, orderedQuantity, payment } = req.body;

    // Fetch product
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    if (product.quantity < orderedQuantity) {
      return res.status(400).json({ message: "Insufficient product quantity" });
    }

    // Fetch customer
    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // Calculate totals
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

    // Update product quantity
    product.quantity -= orderedQuantity;
    await product.save();

    // Create order
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

    const invoice = {
      orderId: order._id,
      customer: order.customer,
      product: order.product,
      quantity: order.deliveredQuantity,
      price: order.price,
      amount: order.deliveredQuantity * order.price,
      payment: order.payment,
      date: order.orderDate,
      type: "delivered",
    };

    res.json(invoice);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
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

    const invoice = {
      orderId: order._id,
      customer: order.customer,
      product: order.product,
      quantity: remaining,
      price: order.price,
      amount: remaining * order.price,
      payment: order.payment,
      date: order.orderDate,
      type: "pending",
    };

    res.json(invoice);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
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
};