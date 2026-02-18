// controllers/paymentRequestController.js
const PaymentRequest = require("../models/PaymentRequest");
const Bill = require("../models/Bill");
const PaymentTransaction = require("../models/PaymentTransaction");
const BillTransaction = require("../models/BillTransaction");
const User = require("../models/User");
const Customer = require("../models/Customer");

const createPaymentRequest = async (req, res) => {
  try {
    const { billId, amount, method, chequeDetails, recipientType, recipientId } = req.body;

    const bill = await Bill.findById(billId);
    if (!bill) return res.status(404).json({ message: "Bill not found" });

    if (bill.status === "paid") return res.status(400).json({ message: "Bill already paid" });

    const customer = await Customer.findOne({ user: req.user._id });
    if (!customer || String(bill.customer) !== String(customer._id)) {
      return res.status(403).json({ message: "Not your bill" });
    }

    if (amount <= 0 || amount > bill.amountDue) {
      return res.status(400).json({ message: "Invalid payment amount" });
    }

    const recipient = await User.findById(recipientId);
    if (!recipient) return res.status(404).json({ message: "Recipient not found" });

    if (recipientType === "delivery" && recipient.role !== "Delivery Man") {
      return res.status(400).json({ message: "Invalid delivery man" });
    }

    if (recipientType === "sales" && recipient.role !== "Sales Man") {
      return res.status(400).json({ message: "Invalid sales man" });
    }

    const paymentRequest = await PaymentRequest.create({
      bill: billId,
      customer: customer._id,
      amount,
      method,
      chequeDetails: method === "cheque" ? chequeDetails : undefined,
      recipientType,
      recipient: recipientId,
    });

    // Update bill status to pending_payment
    bill.status = "pending_payment";
    await bill.save();

    res.status(201).json({ message: "Payment request sent successfully", paymentRequest });
  } catch (error) {
    console.error("Create payment request error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getMyPaymentRequests = async (req, res) => {
  try {
    if (!req.user || (req.user.role !== "Delivery Man" && req.user.role !== "Sales Man")) {
      return res.status(403).json({ message: "Access denied" });
    }

    const requests = await PaymentRequest.find({ recipient: req.user._id })
      .populate("bill", "amountDue totalUsed dueDate status")
      .populate("customer", "name")
      .sort({ createdAt: -1 });

    res.json(requests);
  } catch (error) {
    console.error("Get payment requests error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const acceptPaymentRequest = async (req, res) => {
  try {
    const { id } = req.params;

    const paymentRequest = await PaymentRequest.findById(id);
    if (!paymentRequest) return res.status(404).json({ message: "Payment request not found" });

    if (String(paymentRequest.recipient) !== String(req.user._id)) {
      return res.status(403).json({ message: "Not your request" });
    }

    if (paymentRequest.status !== "pending") {
      return res.status(400).json({ message: `Request is not pending (current: ${paymentRequest.status})` });
    }

    const bill = await Bill.findById(paymentRequest.bill);
    if (!bill) return res.status(404).json({ message: "Bill not found" });

    // Cap payment to remaining due (prevents negative amountDue)
    const actualPayment = Math.min(paymentRequest.amount, bill.amountDue);

    // If nothing left to pay → still record transaction but don't change bill
    if (actualPayment <= 0) {
      // Still create transaction record (for audit/history)
      await BillTransaction.create({
        bill: bill._id,
        customer: paymentRequest.customer,
        recipient: req.user._id,
        recipientType: paymentRequest.recipientType,
        amount: actualPayment, // will be 0
        method: paymentRequest.method,
        chequeDetails: paymentRequest.chequeDetails,
        status: "received",
        paymentRequest: paymentRequest._id,
      });

      paymentRequest.status = "accepted";
      await paymentRequest.save();

      return res.json({
        message: "Request accepted, but bill already fully paid (no change to amount due)",
        actualPaid: 0,
        remainingDue: bill.amountDue,
      });
    }

    // Normal case: there is amount left to pay
    bill.paidAmount += actualPayment;
    bill.amountDue -= actualPayment;

    // Safety: never allow negative
    if (bill.amountDue < 0) bill.amountDue = 0;

    bill.status = bill.amountDue <= 0 ? "paid" : "partial";
    await bill.save();

    // Create transaction record
    await BillTransaction.create({
      bill: bill._id,
      customer: paymentRequest.customer,
      recipient: req.user._id,
      recipientType: paymentRequest.recipientType,
      amount: actualPayment,
      method: paymentRequest.method,
      chequeDetails: paymentRequest.chequeDetails,
      status: "received",
      paymentRequest: paymentRequest._id,
    });

    // Mark request as accepted
    paymentRequest.status = "accepted";
    await paymentRequest.save();

    res.json({
      message: "Payment request accepted successfully",
      actualPaid: actualPayment,
      remainingDue: bill.amountDue,
    });
  } catch (error) {
    console.error("Accept payment request error:", error);
    res.status(500).json({
      message: "Failed to accept payment request",
      error: error.message,
    });
  }
};

const rejectPaymentRequest = async (req, res) => {
  try {
    const { id } = req.params;

    const paymentRequest = await PaymentRequest.findById(id);
    if (!paymentRequest) return res.status(404).json({ message: "Payment request not found" });

    if (String(paymentRequest.recipient) !== String(req.user._id)) {
      return res.status(403).json({ message: "Not your request" });
    }

    if (paymentRequest.status !== "pending") {
      return res.status(400).json({ message: "Request not pending" });
    }

    const bill = await Bill.findById(paymentRequest.bill);
    if (bill) {
      bill.status = "pending"; // or "overdue" if needed
      await bill.save();
    }

    paymentRequest.status = "rejected";
    await paymentRequest.save();

    res.json({ message: "Payment request rejected" });
  } catch (error) {
    console.error("Reject payment request error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  createPaymentRequest,
  getMyPaymentRequests,
  acceptPaymentRequest,
  rejectPaymentRequest,
};