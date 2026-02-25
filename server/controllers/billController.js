// controllers/billController.js
const Bill = require("../models/Bill");
const Order = require("../models/Order");
const Customer = require("../models/Customer");
const BillTransaction = require("../models/BillTransaction");
const PDFDocument = require("pdfkit");
const moment = require("moment"); 

const generateBill = async (req, res) => {
  try {
    const { customerId, cycleStart, cycleEnd } = req.body; // Or automate via cron

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // Find credit orders in this cycle that are not yet billed
    const orders = await Order.find({
      customer: customerId,
      payment: "credit",
      orderDate: { $gte: new Date(cycleStart), $lte: new Date(cycleEnd) },
      bill: { $exists: false }, // Assume add 'bill' field to Order model if needed
    });

    if (orders.length === 0) {
      return res.status(400).json({ message: "No credit orders in this cycle" });
    }

    const totalUsed = orders.reduce((sum, order) => sum + order.totalAmount, 0);

    // Calculate due date based on billingType
    let dueDate;
    const cycleEndDate = moment(cycleEnd);
    if (customer.billingType === "creditcard") {
      dueDate = cycleEndDate.add(30, "days").toDate(); // 30 days grace
    } else {
      dueDate = cycleEndDate.add(1, "days").toDate(); // Immediate: next day
    }

    const bill = await Bill.create({
      customer: customerId,
      cycleStart: new Date(cycleStart),
      cycleEnd: new Date(cycleEnd),
      totalUsed,
      amountDue: totalUsed,
      dueDate,
      orders: orders.map((o) => o._id),
    });

    // Optional: Mark orders as billed (add to Order model: bill: Schema.Types.ObjectId, ref: "Bill")
    // await Order.updateMany({ _id: { $in: orders.map(o => o._id) } }, { bill: bill._id });

    res.status(201).json(bill);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getAllBills = async (req, res) => {
  try {
    const bills = await Bill.find()
      .populate("customer", "name email balanceCreditLimit")
      .sort({ cycleEnd: -1 });
    res.json(bills);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const getBillById = async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.id)
      .populate("customer", "name email phoneNumber address pincode balanceCreditLimit billingType")
      .populate("orders", "product orderedQuantity totalAmount orderDate");
    if (!bill) {
      return res.status(404).json({ message: "Bill not found" });
    }

    // Check if overdue
    if (bill.status === "pending" && new Date() > bill.dueDate) {
      bill.status = "overdue";
      await bill.save();
    }

    res.json(bill);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const getCustomerBills = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "Customer") {
      return res.status(403).json({ message: "Access denied" });
    }

    // Step 1: Find the Customer document linked to this user
    const customer = await Customer.findOne({ user: req.user._id });
    if (!customer) {
      return res.status(404).json({ message: "Customer profile not found" });
    }

    // Step 2: Find bills using the CUSTOMER _id
    const bills = await Bill.find({ customer: customer._id })
      .sort({ cycleEnd: -1 })
      .populate("orders", "product orderedQuantity totalAmount orderDate status"); // optional

    res.json(bills);
  } catch (error) {
    console.error("getCustomerBills error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const getCustomerBillById = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "Customer") {
      return res.status(403).json({ message: "Access denied" });
    }

    const customer = await Customer.findOne({ user: req.user._id });
    if (!customer) {
      return res.status(404).json({ message: "Customer profile not found" });
    }

    const bill = await Bill.findOne({
      _id: req.params.id,
      customer: customer._id  // ← must match customer, not user
    })
      .populate("customer", "name email phoneNumber address pincode balanceCreditLimit billingType")
      .populate("orders", "product orderedQuantity totalAmount orderDate status");

    if (!bill) {
      return res.status(404).json({ message: "Bill not found or not yours" });
    }

    // Check overdue
    if (bill.status === "pending" && new Date() > bill.dueDate) {
      bill.status = "overdue";
      await bill.save();
    }

    res.json(bill);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// billController.js (or wherever createInvoiceBasedBill is defined)
const createInvoiceBasedBill = async (order) => {
  try {
    // Step 1: Prevent duplicate bill creation
    const existingBill = await Bill.findOne({ orders: order._id });
    if (existingBill) {
      console.log(`Bill already exists for order ${order._id} → skipping`);
      return existingBill; // Return existing instead of creating new
    }

    const customer = await Customer.findById(order.customer);
    if (!customer || customer.statementType !== "invoice-based") {
      return null; // Not invoice-based → skip
    }

    // Calculate total used (only delivered quantity!)
    const totalUsed = order.orderItems.reduce((sum, item) => {
      const deliveredQty = item.deliveredQuantity || item.orderedQuantity || 0;
      return sum + (deliveredQty * item.price);
    }, 0);

    if (totalUsed <= 0) {
      console.log(`Order ${order._id} has no delivered value → no bill created`);
      return null;
    }

    const deliveryDate = order.deliveredAt || new Date();

    // Due date based on customer's dueDays
    const dueDate = new Date(deliveryDate);
    if (customer.dueDays) {
      dueDate.setDate(dueDate.getDate() + customer.dueDays);
    }

    const bill = await Bill.create({
      customer: order.customer,
      cycleStart: deliveryDate,
      cycleEnd: deliveryDate,
      totalUsed,
      amountDue: totalUsed,
      dueDate,
      paidAmount: 0,
      status: "pending",
      orders: [order._id],
    });

    // Link bill back to order (prevents future duplicate checks from failing)
    order.bill = bill._id;
    await order.save();

    console.log(`✅ Invoice-based bill created for order ${order._id}: ${bill._id}`);
    return bill;
  } catch (error) {
    console.error("Error creating invoice-based bill:", error);
    return null;
  }
};
const getAllPendingBills = async (req, res) => {
  try {
    const bills = await Bill.find({ status: { $in: ["pending", "overdue", "partial"] } })
      .populate("customer", "name")
      .sort({ dueDate: 1 });
    res.json(bills);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const markBillReceived = async (req, res) => {
  try {
    const { billId, amount, method, chequeDetails } = req.body;

    // Role check
    if (!req.user || !["Delivery Man", "Sales Man"].includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const bill = await Bill.findById(billId).populate("customer");
    if (!bill) return res.status(404).json({ message: "Bill not found" });

    const actualPayment = Math.min(amount, bill.amountDue);
    if (actualPayment <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    // Update bill
    bill.paidAmount += actualPayment;
    bill.amountDue -= actualPayment;
    if (bill.amountDue < 0) bill.amountDue = 0;
    bill.status = bill.amountDue <= 0 ? "paid" : "partial";
    await bill.save();

    // Create transaction → delivery/sales wallet
    await BillTransaction.create({
      bill: bill._id,
      customer: bill.customer._id,
      recipient: req.user._id,
      recipientType: req.user.role === "Delivery Man" ? "delivery" : "sales",
      amount: actualPayment,
      method,
      chequeDetails: method === "cheque" ? chequeDetails : undefined,
      status: "received",
    });

    // Restore credit limit
    const customer = bill.customer; // already populated
    if (customer && customer.billingType === "Credit limit") {
      customer.balanceCreditLimit += actualPayment;
      await customer.save();
    }

    res.json({
      message: "Payment received – bill updated & credit restored",
      newStatus: bill.status,
      remainingDue: bill.amountDue,
    });
  } catch (error) {
    console.error("Mark received error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const getBillReceipt = async (req, res) => {
  try {
    // Optional: Keep auth check if you want
    if (!req.user) {
      return res.status(401).json({ message: "Not authorized, no token provided" });
    }

    const bill = await Bill.findById(req.params.id)
      .populate("customer", "name email phoneNumber address pincode");

    if (!bill) {
      return res.status(404).json({ message: "Bill not found" });
    }

    const filename = `receipt_${bill._id.toString().slice(-8)}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ size: "A4", margin: 50 });
    doc.pipe(res);

    // ─── Receipt Content (Bill Details Only) ────────────────────────
    const pageWidth = doc.page.width;
    const margin = 50;

    // Title
    doc
      .fontSize(24)
      .font("Helvetica-Bold")
      .fillColor("#1e293b")
      .text("PAYMENT RECEIPT", { align: "center" });

    doc.moveDown(0.5);

    // Receipt & Date
    doc
      .fontSize(12)
      .font("Helvetica")
      .text(`Receipt No: REC-${bill._id.toString().slice(-8)}`, { align: "center" })
      .text(`Date: ${new Date(bill.updatedAt || bill.createdAt || Date.now()).toLocaleDateString()}`, { align: "center" });

    doc.moveDown(1.5);

    // Customer Details
    doc
      .fontSize(14)
      .font("Helvetica-Bold")
      .text("Customer Details:");
    doc
      .fontSize(12)
      .font("Helvetica")
      .text(`Name: ${bill.customer?.name || "N/A"}`)
      .text(`Phone: ${bill.customer?.phoneNumber || "N/A"}`)
      .text(`Address: ${bill.customer?.address || "N/A"}`)
      .text(`Pincode: ${bill.customer?.pincode || "N/A"}`)
      .moveDown(1);

    // Bill Summary
    doc
      .fontSize(14)
      .font("Helvetica-Bold")
      .text("Bill Summary:");
    doc
      .fontSize(12)
      .font("Helvetica")
      .text(`Bill ID: ${bill._id.toString().slice(-8)}`)
      .text(`Total Amount Due: AED ${bill.amountDue?.toFixed(2) || "0.00"}`)
      .text(`Paid Amount: AED ${bill.paidAmount?.toFixed(2) || "0.00"}`)
      .text(`Remaining Due: AED ${bill.amountDue?.toFixed(2) || "0.00"}`)
      .moveDown(1);

    // Footer
    doc.moveDown(3);
    doc
      .fontSize(10)
      .font("Helvetica-Oblique")
      .fillColor("#6b7280")
      .text("Thank you for your payment!", { align: "center" })
      .text("This is a computer-generated receipt.", { align: "center" });

    doc.end();

    console.log(`Receipt generated for bill ${bill._id}`);
  } catch (error) {
    console.error("Receipt generation error:", error);
    if (!res.headersSent) {
      res.status(500).json({ 
        message: "Failed to generate receipt", 
        error: error.message 
      });
    }
  }
};
module.exports = {
  generateBill,
  getAllBills,
  getBillById,
  getCustomerBills,
  getCustomerBillById,
  createInvoiceBasedBill,
  getAllPendingBills,
  markBillReceived,getBillReceipt
};