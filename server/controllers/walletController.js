// controllers/walletController.js
const PaymentTransaction = require("../models/PaymentTransaction");
const Order = require("../models/Order");
const Customer = require("../models/Customer");

const getDeliveryCashWallet = async (req, res) => {
  try {
    const transactions = await PaymentTransaction.find({
      deliveryMan: req.user._id,
      method: "cash"
    })
      .populate({
        path: 'order',
        populate: [
          { path: 'customer', select: 'name' },
        ]
      })
      .sort({ date: -1 });

    const totalAmount = transactions
      .filter(tx => tx.status === "received" || tx.status === "pending")
      .reduce((sum, tx) => sum + tx.amount, 0);

    res.json({
      totalAmount,
      transactions,
    });
  } catch (error) {
    console.error("Cash wallet error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const getDeliveryChequeWallet = async (req, res) => {
  try {
    const transactions = await PaymentTransaction.find({
      deliveryMan: req.user._id,
      method: "cheque"
    })
      .populate({
        path: 'order',
        populate: [
          { path: 'customer', select: 'name' },
        ]
      })
      .sort({ date: -1 });

    const totalAmount = transactions
      .filter(tx => tx.status === "received" || tx.status === "pending")
      .reduce((sum, tx) => sum + tx.amount, 0);

    res.json({
      totalAmount,
      transactions,
    });
  } catch (error) {
    console.error("Cheque wallet error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const requestPayCashToAdmin = async (req, res) => {
  try {
    const { transactionId } = req.body;
    const transaction = await PaymentTransaction.findById(transactionId);
    
    if (!transaction) return res.status(404).json({ message: "Transaction not found" });
    if (String(transaction.deliveryMan) !== String(req.user._id)) {
      return res.status(403).json({ message: "Not your transaction" });
    }
    if (transaction.method !== "cash") {
      return res.status(400).json({ message: "This is not a cash transaction" });
    }
    if (transaction.status !== "received") {
      return res.status(400).json({ message: "Invalid status for request" });
    }

    transaction.status = "pending";
    await transaction.save();

    res.json({ message: "Request sent for cash payment approval" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const requestPayChequeToAdmin = async (req, res) => {
  try {
    const { transactionId } = req.body;
    const transaction = await PaymentTransaction.findById(transactionId);
    
    if (!transaction) return res.status(404).json({ message: "Transaction not found" });
    if (String(transaction.deliveryMan) !== String(req.user._id)) {
      return res.status(403).json({ message: "Not your transaction" });
    }
    if (transaction.method !== "cheque") {
      return res.status(400).json({ message: "This is not a cheque transaction" });
    }
    if (transaction.status !== "received") {
      return res.status(400).json({ message: "Invalid status for request" });
    }

    transaction.status = "pending";
    await transaction.save();

    res.json({ message: "Request sent for cheque payment approval" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const acceptPayment = async (req, res) => {
  try {
    const { transactionId } = req.body;
    const transaction = await PaymentTransaction.findById(transactionId);
    
    if (!transaction) return res.status(404).json({ message: "Transaction not found" });
    if (transaction.status !== "pending") {
      return res.status(400).json({ message: "Not pending" });
    }

    transaction.status = "paid_to_admin";
    await transaction.save();

    res.json({ message: "Payment accepted and marked as received" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const rejectPayment = async (req, res) => {
  try {
    const { transactionId } = req.body;
    const transaction = await PaymentTransaction.findById(transactionId);
    
    if (!transaction) return res.status(404).json({ message: "Transaction not found" });
    if (transaction.status !== "pending") {
      return res.status(400).json({ message: "Not pending" });
    }

    transaction.status = "received";
    await transaction.save();

    res.json({ message: "Payment request rejected" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const getAdminWalletMoney = async (req, res) => {
  try {
    const transactions = await PaymentTransaction.find({})
      .populate({
        path: 'deliveryMan',
        select: 'username'
      })
      .populate({
        path: 'order',
        populate: [
          { path: 'customer', select: 'name' },
        ]
      })
      .sort({ date: -1 });

    res.json(transactions);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const markAsReceived = async (req, res) => {
  try {
    const { transactionId } = req.body;
    const transaction = await PaymentTransaction.findById(transactionId);
    if (!transaction) return res.status(404).json({ message: "Transaction not found" });
    if (transaction.status === "paid_to_admin") {
      return res.status(400).json({ message: "Already received" });
    }

    transaction.status = "paid_to_admin";
    await transaction.save();

    res.json({ message: "Marked as received" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getDeliveryCashWallet,
  getDeliveryChequeWallet,
  requestPayCashToAdmin,
  requestPayChequeToAdmin,
  acceptPayment,
  rejectPayment,
  getAdminWalletMoney,
  markAsReceived,
};