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
        select: 'customer invoiceNumber _id orderDate invoiceHistory',
        populate: [{ path: 'customer', select: 'name phoneNumber' }]
      })
      .sort({ date: -1 })
      .lean();

    // ✅ IMPROVED: Assign correct invoice number to each transaction
    transactions.forEach(tx => {
      const order = tx.order || {};
      const paymentDate = new Date(tx.date || tx.createdAt);
      const txAmount = tx.amount;

      // Priority 1: Transaction has its own invoiceNumber (best case)
      if (tx.invoiceNumber) {
        tx.displayInvoiceNumber = tx.invoiceNumber;
        return;
      }

      // Priority 2: Match against invoiceHistory by amount (with small tolerance)
      const history = order.invoiceHistory || [];
      const exactMatch = history.find(hist => 
        Math.abs(hist.amount - txAmount) < 0.01
      );
      
      if (exactMatch) {
        tx.displayInvoiceNumber = exactMatch.invoiceNumber;
        return;
      }

      // Priority 3: Match by date proximity within same order (for partials without exact amount match)
      // Sort history by createdAt descending and find closest match within 5-minute window
      const sortedHistory = [...history].sort((a, b) => 
        new Date(b.createdAt) - new Date(a.createdAt)
      );
      
      const timeWindowMs = 5 * 60 * 1000; // 5 minutes
      const dateMatch = sortedHistory.find(hist => {
        const histDate = new Date(hist.createdAt);
        return Math.abs(paymentDate - histDate) <= timeWindowMs;
      });
      
      if (dateMatch) {
        tx.displayInvoiceNumber = dateMatch.invoiceNumber;
        return;
      }

      // Priority 4: Fallback - use order's current invoiceNumber (last resort)
      tx.displayInvoiceNumber = order.invoiceNumber || 'N/A';
    });

    const totalAmount = transactions
      .filter(tx => tx.status === "received" || tx.status === "pending")
      .reduce((sum, tx) => sum + tx.amount, 0);

    res.json({ totalAmount, transactions });
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

    const transaction = await PaymentTransaction.findById(transactionId)
      .populate({
        path: 'order',
        select: 'customer orderItems invoiceNumber payment orderDate invoiceHistory _id',
        populate: [{ path: 'customer', select: 'name phoneNumber' }],
      })
      .populate('deliveryMan', 'username')
      .lean();

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    // Authorization check
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

    // ✅ CRITICAL FIX: Determine correct invoice number for this transaction
    let correctInvoiceNumber = 'N/A';
    
    // Priority 1: Transaction has its own invoiceNumber (best case)
    if (transaction.invoiceNumber) {
      correctInvoiceNumber = transaction.invoiceNumber;
    } 
    // Priority 2: Match against invoiceHistory by amount
    else if (order.invoiceHistory?.length > 0) {
      const txAmount = transaction.amount;
      const txDate = new Date(transaction.date || transaction.createdAt);
      
      // Find exact amount match
      const amountMatch = order.invoiceHistory.find(hist => 
        Math.abs(hist.amount - txAmount) < 0.01
      );
      
      if (amountMatch) {
        correctInvoiceNumber = amountMatch.invoiceNumber;
      } 
      // Fallback: Find closest by date within 5-minute window
      else {
        const timeWindowMs = 5 * 60 * 1000;
        const dateMatch = order.invoiceHistory.find(hist => {
          const histDate = new Date(hist.createdAt);
          return Math.abs(txDate - histDate) <= timeWindowMs;
        });
        
        if (dateMatch) {
          correctInvoiceNumber = dateMatch.invoiceNumber;
        } else {
          // Last resort: use order's current invoiceNumber
          correctInvoiceNumber = order.invoiceNumber || 'N/A';
        }
      }
    } 
    // Fallback
    else {
      correctInvoiceNumber = order.invoiceNumber || 'N/A';
    }

    const company = (await CompanySettings.findOne()) || { companyName: 'INGOUDE COMPANY' };

    const doc = new PDFDocument({ size: 'A5', margin: 40 });
    
    // ✅ Use correct invoice number in filename
    const filename = `receipt-${correctInvoiceNumber}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

    doc.pipe(res);

    // Header
    doc.fontSize(18).font('Helvetica-Bold').text(company.companyName.toUpperCase(), { align: 'center' });
    doc.fontSize(14).moveDown(0.3).text('PAYMENT RECEIPT', { align: 'center' });
    doc.moveDown(1.2);

    // Receipt Details - ✅ Use correctInvoiceNumber
    doc.fontSize(11).font('Helvetica');
    doc.text(`Receipt No: REC-${transaction._id.toString().slice(-6)}`);
    doc.text(`Invoice No: ${correctInvoiceNumber}`);  // ✅ FIXED
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
const generateBulkPaymentReceipt = async (req, res) => {
  try {
    const { transactionIds, receiptNumber } = req.body;

    if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
      return res.status(400).json({ message: "No transaction IDs provided" });
    }

    // Fetch transactions with necessary populated data
    const transactions = await PaymentTransaction.find({ _id: { $in: transactionIds } })
      .populate({
        path: 'order',
        select: 'customer invoiceNumber _id orderDate',
        populate: { path: 'customer', select: 'name phoneNumber' },
      })
      .populate('deliveryMan', 'username')
      .lean();

    if (transactions.length !== transactionIds.length) {
      return res.status(404).json({ message: "Some transactions not found" });
    }

    const company = (await CompanySettings.findOne()) || { companyName: 'INGOUDE COMPANY' };

    // ────────────────────────────────────────────────
    // Decide if we generate ONE receipt or multiple
    // ────────────────────────────────────────────────
    const firstTx = transactions[0];
    const firstCustomerId = firstTx.order?.customer?._id?.toString();
    const firstDate = new Date(firstTx.date).toDateString();

    const allSameCustomerAndDay = transactions.every(tx => {
      const customerId = tx.order?.customer?._id?.toString();
      const txDate = new Date(tx.date).toDateString();
      return customerId === firstCustomerId && txDate === firstDate;
    });

    const useSingleReceipt = allSameCustomerAndDay && transactions.length > 1;
    const finalReceiptNumber = useSingleReceipt 
      ? receiptNumber || `REC-CASH-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(1000 + Math.random() * 9000)}`
      : null;

    const doc = new PDFDocument({ size: 'A5', margin: 40 });

    res.setHeader('Content-Type', 'application/pdf');

    // Filename
    const filename = useSingleReceipt
      ? `${finalReceiptNumber}.pdf`
      : transactions.length === 1
        ? `receipt-${transactions[0].invoiceNumber || transactions[0].order?.invoiceNumber || 'N/A'}.pdf`
        : `bulk-cash-receipts-${Date.now()}.pdf`;

    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

    doc.pipe(res);

    // ────────────────────────────────────────────────
    // Generate PDF content
    // ────────────────────────────────────────────────
   transactions.forEach((tx, index) => {
  if (index > 0) doc.addPage();

  // Header
  doc.fontSize(18).font('Helvetica-Bold').text(company.companyName.toUpperCase(), { align: 'center' });
  doc.fontSize(14).moveDown(0.3).text('CASH PAYMENT RECEIPT', { align: 'center' });
  doc.moveDown(0.5);

  // Receipt number logic...
  
  doc.moveDown(1);

  // ✅ CRITICAL FIX: Get correct invoice number for EACH transaction
  let correctInvoiceNumber = 'N/A';
  
  if (tx.invoiceNumber) {
    correctInvoiceNumber = tx.invoiceNumber;
  } else if (tx.order?.invoiceHistory?.length > 0) {
    const txAmount = tx.amount;
    const txDate = new Date(tx.date || tx.createdAt);
    
    const amountMatch = tx.order.invoiceHistory.find(hist => 
      Math.abs(hist.amount - txAmount) < 0.01
    );
    
    if (amountMatch) {
      correctInvoiceNumber = amountMatch.invoiceNumber;
    } else {
      const timeWindowMs = 5 * 60 * 1000;
      const dateMatch = tx.order.invoiceHistory.find(hist => {
        const histDate = new Date(hist.createdAt);
        return Math.abs(txDate - histDate) <= timeWindowMs;
      });
      
      if (dateMatch) {
        correctInvoiceNumber = dateMatch.invoiceNumber;
      } else {
        correctInvoiceNumber = tx.order.invoiceNumber || 'N/A';
      }
    }
  } else {
    correctInvoiceNumber = tx.order?.invoiceNumber || 'N/A';
  }

  // Transaction details - ✅ Use correctInvoiceNumber
  const order = tx.order || {};
  doc.fontSize(11).font('Helvetica');
  doc.text(`Invoice No: ${correctInvoiceNumber}`);  // ✅ FIXED - shows DEL-01 or DEL-02 correctly
  doc.text(`Customer: ${order.customer?.name || 'N/A'}`);
  doc.text(`Delivery Partner: ${tx.deliveryMan?.username || 'N/A'}`);
  doc.text(`Amount Paid: AED ${tx.amount.toFixed(2)}`);
  doc.text(`Payment Method: ${tx.method.charAt(0).toUpperCase() + tx.method.slice(1)}`);
  doc.text(`Payment Date: ${new Date(tx.date).toLocaleString('en-IN')}`);
  

      // Cheque details if applicable
      if (tx.method === 'cheque' && tx.chequeDetails) {
        doc.moveDown(0.8);
        doc.fontSize(11).text('Cheque Details:', { underline: true });
        doc.moveDown(0.3);
        doc.fontSize(10).text(`  • Cheque No : ${tx.chequeDetails.number || 'N/A'}`);
        doc.text(`  • Bank      : ${tx.chequeDetails.bank || 'N/A'}`);
        doc.text(`  • Date      : ${tx.chequeDetails.date ? new Date(tx.chequeDetails.date).toLocaleDateString('en-IN') : 'N/A'}`);
      }

      doc.moveDown(1.5);
      doc.fontSize(9).font('Helvetica-Oblique').fillColor('#555').text('Thank you for your payment!', { align: 'center' });
      doc.text('This is a system-generated receipt.', { align: 'center' });
    });

    doc.end();
  } catch (error) {
    console.error('Bulk receipt generation error:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Failed to generate bulk receipt' });
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
  markAsReceived,generatePaymentReceipt,generateBulkPaymentReceipt
};