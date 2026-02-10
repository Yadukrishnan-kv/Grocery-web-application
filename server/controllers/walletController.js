// controllers/walletController.js
const PaymentTransaction = require("../models/PaymentTransaction");
const Order = require("../models/Order");
const Customer = require("../models/Customer");

const getDeliveryWallet = async (req, res) => {
  try {
    const transactions = await PaymentTransaction.find({ deliveryMan: req.user._id })
      .populate({
        path: 'order',
        populate: [
          { path: 'customer', select: 'name' },
        ]
      })
      .sort({ date: -1 });

    // Only sum amounts that are still "received" (not yet paid to admin)
    const totalAmount = transactions
      .filter(tx => tx.status === "received")
      .reduce((sum, tx) => sum + tx.amount, 0);

    res.json({
      totalAmount,
      transactions,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const payToAdmin = async (req, res) => {
  try {
    const { transactionId } = req.body;
    const transaction = await PaymentTransaction.findById(transactionId);
    if (!transaction) return res.status(404).json({ message: "Transaction not found" });
    if (String(transaction.deliveryMan) !== String(req.user._id)) {
      return res.status(403).json({ message: "Not your transaction" });
    }
    if (transaction.status === "paid_to_admin") {
      return res.status(400).json({ message: "Already paid to admin" });
    }

    transaction.status = "paid_to_admin";
    await transaction.save();

    res.json({ message: "Payment marked as given to admin" });
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
  getDeliveryWallet,
  payToAdmin,
  getAdminWalletMoney,
  markAsReceived,
};