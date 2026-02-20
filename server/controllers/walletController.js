// controllers/walletController.js
const PaymentTransaction = require("../models/PaymentTransaction");
const Customer = require("../models/Customer");
const PDFDocument = require('pdfkit');
const Order = require('../models/Order');
const User = require('../models/User');
const CompanySettings = require('../models/CompanySettings');

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
const generatePaymentReceipt = async (req, res) => {
  try {
    const { transactionId } = req.params;

    // Fetch transaction with deep population
    const transaction = await PaymentTransaction.findById(transactionId)
      .populate({
        path: 'order',
        select: 'customer orderItems deliveredInvoiceNumber pendingInvoiceNumber payment orderDate _id',
        populate: [
          { path: 'customer', select: 'name phoneNumber' }, // Get customer name
        ],
      })
      .populate('deliveryMan', 'username') // Delivery man name
      .lean(); // Faster, since we don't modify

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    // Authorization check (already handled by protect middleware, but extra safety)
    if (
      String(transaction.deliveryMan?._id) !== String(req.user._id) &&
      req.user.role !== 'Admin'
    ) {
      return res.status(403).json({ message: 'Not authorized to print this receipt' });
    }

    const order = transaction.order;
    if (!order) {
      return res.status(404).json({ message: 'Associated order not found' });
    }

    const company = (await CompanySettings.findOne()) || { companyName: 'INGOUDE COMPANY' };

    const doc = new PDFDocument({ size: 'A5', margin: 40 });
    const filename = `receipt-${transaction._id.toString().slice(-8)}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`); // 'inline' to view in browser

    doc.pipe(res);

    // Header
    doc.fontSize(18).font('Helvetica-Bold').text(company.companyName.toUpperCase(), { align: 'center' });
    doc.fontSize(14).moveDown(0.3).text('PAYMENT RECEIPT', { align: 'center' });
    doc.moveDown(1.2);

    // Receipt Details (left-aligned, clean layout)
    doc.fontSize(11).font('Helvetica');
    doc.text(`Receipt No: REC-${transaction._id.toString().slice(-6)}`);
    doc.text(`Invoice No: ${order.deliveredInvoiceNumber || order.pendingInvoiceNumber || 'N/A'}`);
    doc.text(`Order ID: ${order._id.toString().slice(-8)}`);
    doc.text(`Customer: ${order.customer?.name || 'N/A'}`);
    doc.text(`Delivery Man: ${transaction.deliveryMan?.username || 'N/A'}`);
    doc.text(`Amount: AED ${transaction.amount.toFixed(2)}`);
    doc.text(`Method: ${transaction.method.charAt(0).toUpperCase() + transaction.method.slice(1)}`);
    doc.text(`Date: ${new Date(transaction.date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);

    if (transaction.method === 'cheque' && transaction.chequeDetails) {
      doc.moveDown(0.8);
      doc.fontSize(11).text('Cheque Details:', { underline: true });
      doc.fontSize(10).moveDown(0.3);
      doc.text(`  • Number : ${transaction.chequeDetails.number || 'N/A'}`);
      doc.text(`  • Bank   : ${transaction.chequeDetails.bank || 'N/A'}`);
      doc.text(`  • Date   : ${transaction.chequeDetails.date ? new Date(transaction.chequeDetails.date).toLocaleDateString('en-IN') : 'N/A'}`);
    }

    // Footer
    doc.moveDown(2.5);
    doc.fontSize(9).font('Helvetica-Oblique').fillColor('#555').text('Thank you for your payment!', { align: 'center' });
    doc.moveDown(0.3);
    doc.text('This is a system-generated receipt.', { align: 'center' });

    doc.end();
  } catch (error) {
    console.error('Receipt generation error:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Failed to generate receipt' });
    }
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
  markAsReceived,generatePaymentReceipt
};