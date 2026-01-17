const Bill = require("../models/Bill");
const Order = require("../models/Order");
const Customer = require("../models/Customer");
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

const payBill = async (req, res) => {
  try {
    const { paymentAmount } = req.body;
    const bill = await Bill.findById(req.params.id);
    if (!bill) {
      return res.status(404).json({ message: "Bill not found" });
    }

    if (bill.status === "paid") {
      return res.status(400).json({ message: "Bill already paid" });
    }

    if (paymentAmount <= 0 || paymentAmount > bill.amountDue) {
      return res.status(400).json({ message: "Invalid payment amount" });
    }

    bill.paidAmount += paymentAmount;
    bill.amountDue -= paymentAmount;

    if (bill.amountDue === 0) {
      bill.status = "paid";
    } else {
      bill.status = "partial";
    }

    // Restore customer's balanceCreditLimit
    const customer = await Customer.findById(bill.customer);
    customer.balanceCreditLimit += paymentAmount;
    await customer.save();

    await bill.save();

    res.json({ message: "Payment successful", bill });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getCustomerBills = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "Customer") {
      return res.status(403).json({ message: "Access denied" });
    }

    const bills = await Bill.find({ customer: req.user._id })
      .sort({ cycleEnd: -1 });

    res.json(bills);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const getCustomerBillById = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "Customer") {
      return res.status(403).json({ message: "Access denied" });
    }

    const bill = await Bill.findById(req.params.id)
      .populate("customer", "name email phoneNumber address pincode balanceCreditLimit billingType")
      .populate("orders", "product orderedQuantity totalAmount orderDate status");

    if (!bill || bill.customer.toString() !== req.user._id.toString()) {
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

module.exports = {
  generateBill,
  getAllBills,
  getBillById,
  payBill,getCustomerBills,getCustomerBillById
};