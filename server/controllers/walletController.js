// controllers/walletController.js
const PaymentTransaction = require("../models/PaymentTransaction");
const Customer = require("../models/Customer");
const PDFDocument = require('pdfkit');
const Order = require('../models/Order');
const User = require('../models/User');
const CompanySettings = require('../models/CompanySettings');
const Bill = require('../models/Bill');

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

    // Attach returnCreditUsed from paired return_credit transactions for each order
    const cashOrderIds = transactions.map(tx => tx.order?._id).filter(Boolean);
    const cashReturnCreditTxs = await PaymentTransaction.find({
      order: { $in: cashOrderIds },
      method: 'return_credit',
    }).lean();
    const cashReturnCreditByOrder = {};
    cashReturnCreditTxs.forEach(tx => {
      const oid = String(tx.order);
      cashReturnCreditByOrder[oid] = (cashReturnCreditByOrder[oid] || 0) + tx.amount;
    });
    transactions.forEach(tx => {
      tx.returnCreditUsed = cashReturnCreditByOrder[String(tx.order?._id)] || 0;
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

    // Attach returnCreditUsed from paired return_credit transactions for each order
    const chequeOrderIds = transactions.map(tx => tx.order?._id).filter(Boolean);
    const chequeReturnCreditTxs = await PaymentTransaction.find({
      order: { $in: chequeOrderIds },
      method: 'return_credit',
    }).lean();
    const chequeReturnCreditByOrder = {};
    chequeReturnCreditTxs.forEach(tx => {
      const oid = String(tx.order);
      chequeReturnCreditByOrder[oid] = (chequeReturnCreditByOrder[oid] || 0) + tx.amount;
    });
    transactions.forEach(tx => {
      tx.returnCreditUsed = chequeReturnCreditByOrder[String(tx.order?._id)] || 0;
    });

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
    const transactions = await PaymentTransaction.find({
      method: { $in: ['cash', 'cheque'] },
    })
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
      .sort({ date: -1 })
      .lean();

    // Attach returnCreditUsed from paired return_credit transactions for each order
    const adminOrderIds = transactions.map(tx => tx.order?._id).filter(Boolean);
    const adminReturnCreditTxs = await PaymentTransaction.find({
      order: { $in: adminOrderIds },
      method: 'return_credit',
    }).lean();
    const adminReturnCreditByOrder = {};
    adminReturnCreditTxs.forEach(tx => {
      const oid = String(tx.order);
      adminReturnCreditByOrder[oid] = (adminReturnCreditByOrder[oid] || 0) + tx.amount;
    });
    transactions.forEach(tx => {
      tx.returnCreditUsed = adminReturnCreditByOrder[String(tx.order?._id)] || 0;
    });

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
        populate: [{ path: 'customer', select: 'name phoneNumber address' }],
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
    
    // Calculate total due for this customer across all bills
    const allBills = await Bill.find({ customer: order.customer._id });
    const totalDue = allBills.reduce((sum, b) => {
      const remaining = Math.max(0, (b.grandTotal || b.amountDue || 0) - (b.paidAmount || 0));
      return sum + remaining;
    }, 0);

    // Determine correct invoice number for this transaction
    let correctInvoiceNumber = 'N/A';
    if (transaction.invoiceNumber) {
      correctInvoiceNumber = transaction.invoiceNumber;
    } else if (order.invoiceHistory?.length > 0) {
      const txAmount = transaction.amount;
      const txDate = new Date(transaction.date || transaction.createdAt);
      const amountMatch = order.invoiceHistory.find(hist => Math.abs(hist.amount - txAmount) < 0.01);
      if (amountMatch) {
        correctInvoiceNumber = amountMatch.invoiceNumber;
      } else {
        const timeWindowMs = 5 * 60 * 1000;
        const dateMatch = order.invoiceHistory.find(hist =>
          Math.abs(txDate - new Date(hist.createdAt)) <= timeWindowMs
        );
        correctInvoiceNumber = dateMatch?.invoiceNumber || order.invoiceNumber || 'N/A';
      }
    } else {
      correctInvoiceNumber = order.invoiceNumber || 'N/A';
    }

    const company = (await CompanySettings.findOne()) || { companyName: 'INGOUDE COMPANY' };

    // 80mm thermal receipt style (matches admin/salesman bill receipts)
    const pageWidth = 226;
    const margin = 10;
    const contentWidth = pageWidth - margin * 2;
    const centerX = margin;
    const labelW = 75;
    const valueW = contentWidth - labelW;

    const doc = new PDFDocument({ size: [pageWidth, 800], margin, bufferPages: true });
    const filename = `receipt-${correctInvoiceNumber}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    doc.pipe(res);

    let y = margin;

    const drawDashedLine = (yPos) => {
      doc.save();
      doc.strokeColor('#000').lineWidth(0.5);
      const dashLen = 3, gap = 2;
      for (let x = margin; x < pageWidth - margin; x += dashLen + gap) {
        doc.moveTo(x, yPos).lineTo(Math.min(x + dashLen, pageWidth - margin), yPos).stroke();
      }
      doc.restore();
      return yPos + 6;
    };

    const printRow = (label, value) => {
      doc.fontSize(7).font('Helvetica-Bold').fillColor('#000').text(label, centerX, y, { width: labelW });
      doc.fontSize(7).font('Helvetica').fillColor('#000').text(String(value), centerX + labelW, y, { width: valueW, align: 'right' });
      y += 11;
    };

    // ===== COMPANY HEADER =====
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#000')
      .text((company.companyName || 'COMPANY').toUpperCase(), centerX, y, { width: contentWidth, align: 'center' });
    y += 14;
    if (company.companyAddress) {
      doc.fontSize(6).font('Helvetica').fillColor('#000')
        .text(company.companyAddress, centerX, y, { width: contentWidth, align: 'center' });
      y += 9;
    }
    if (company.companyPhone) {
      doc.fontSize(6).font('Helvetica').fillColor('#000')
        .text(`Mob: ${company.companyPhone}`, centerX, y, { width: contentWidth, align: 'center' });
      y += 9;
    }
    if (company.companyTel) {
      doc.fontSize(6).font('Helvetica').fillColor('#000')
        .text(`Tel.: ${company.companyTel}`, centerX, y, { width: contentWidth, align: 'center' });
      y += 9;
    }
    if (company.companyWebsite) {
      doc.fontSize(6).font('Helvetica').fillColor('#000')
        .text(company.companyWebsite, centerX, y, { width: contentWidth, align: 'center' });
      y += 9;
    }

    y = drawDashedLine(y + 2);

    // ===== TITLE =====
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#000')
      .text('PAYMENT RECEIPT', centerX, y, { width: contentWidth, align: 'center' });
    y += 14;

    y = drawDashedLine(y);

    // ===== RECEIPT INFO =====

    printRow('Invoice No:', correctInvoiceNumber);
    printRow('Date:', new Date(transaction.date).toLocaleDateString('en-IN'));

    y = drawDashedLine(y + 2);

    // ===== CUSTOMER INFO =====
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#000').text('CUSTOMER:', centerX, y);
    y += 11;
    doc.fontSize(7).font('Helvetica').fillColor('#000').text(order.customer?.name || 'N/A', centerX, y);
    y += 10;
    if (order.customer?.phoneNumber) {
      doc.fontSize(7).font('Helvetica').fillColor('#000').text(order.customer.phoneNumber, centerX, y);
      y += 10;
    }
    if (order.customer?.address) {
      doc.fontSize(7).font('Helvetica').fillColor('#000').text(order.customer.address, centerX, y, { width: contentWidth });
      y += 10;
    }

    y = drawDashedLine(y + 2);

    // ===== PAYMENT DETAILS =====
    printRow('Delivery Man:', transaction.deliveryMan?.username || 'N/A');
    printRow('Amount Paid:', `AED ${transaction.amount.toFixed(2)}`);
    printRow('Method:', transaction.method.charAt(0).toUpperCase() + transaction.method.slice(1));

    if (transaction.method === 'cheque' && transaction.chequeDetails) {
      y = drawDashedLine(y + 2);
      doc.fontSize(7).font('Helvetica-Bold').fillColor('#000').text('CHEQUE DETAILS:', centerX, y);
      y += 11;
      printRow('Cheque No:', transaction.chequeDetails.number || 'N/A');
      printRow('Bank:', transaction.chequeDetails.bank || 'N/A');
      if (transaction.chequeDetails.date) {
        printRow('Cheque Date:', new Date(transaction.chequeDetails.date).toLocaleDateString('en-IN'));
      }
    }

    y = drawDashedLine(y + 2);

    // ===== GRAND TOTAL DUE =====
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#000')
      .text('BALANCE DUE', centerX, y, { width: labelW + 10 });
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#000')
      .text(`AED ${totalDue.toFixed(2)}`, centerX + labelW + 10, y, { width: valueW - 10, align: 'right' });
    y += 14;

    y = drawDashedLine(y);

    // ===== FOOTER =====
    y += 4;
    doc.fontSize(6).font('Helvetica').fillColor('#000')
      .text('Thank you for your payment!', centerX, y, { width: contentWidth, align: 'center' });
    y += 9;
    doc.text('This is a computer-generated receipt.', centerX, y, { width: contentWidth, align: 'center' });

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
        select: 'customer invoiceNumber _id orderDate invoiceHistory',
        populate: { path: 'customer', select: 'name phoneNumber address' },
      })
      .populate('deliveryMan', 'username')
      .lean();

    if (transactions.length !== transactionIds.length) {
      return res.status(404).json({ message: "Some transactions not found" });
    }

    const company = (await CompanySettings.findOne()) || { companyName: 'INGOUDE COMPANY' };

    const firstTx = transactions[0];
    const firstCustomerId = firstTx.order?.customer?._id?.toString();
    const firstDate = new Date(firstTx.date).toDateString();

    const allSameCustomerAndDay = transactions.every(tx => {
      const customerId = tx.order?.customer?._id?.toString();
      const txDate = new Date(tx.date).toDateString();
      return customerId === firstCustomerId && txDate === firstDate;
    });
    
    // Calculate total due for the customer (same for all transactions on same day)
    let totalDue = 0;
    if (firstCustomerId) {
      const allBills = await Bill.find({ customer: firstCustomerId });
      totalDue = allBills.reduce((sum, b) => {
        const remaining = Math.max(0, (b.grandTotal || b.amountDue || 0) - (b.paidAmount || 0));
        return sum + remaining;
      }, 0);
    }

    const useSingleReceipt = allSameCustomerAndDay && transactions.length > 1;
    const finalReceiptNumber = useSingleReceipt
      ? receiptNumber || `REC-CASH-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`
      : null;

    // 80mm thermal receipt style (matches admin/salesman bill receipts)
    const pageWidth = 226;
    const margin = 10;
    const contentWidth = pageWidth - margin * 2;
    const centerX = margin;
    const labelW = 75;
    const valueW = contentWidth - labelW;

    const doc = new PDFDocument({ size: [pageWidth, 800], margin, bufferPages: true });

    res.setHeader('Content-Type', 'application/pdf');
    const filename = useSingleReceipt
      ? `${finalReceiptNumber}.pdf`
      : transactions.length === 1
        ? `receipt-${transactions[0].invoiceNumber || transactions[0].order?.invoiceNumber || 'N/A'}.pdf`
        : `bulk-cash-receipts-${Date.now()}.pdf`;
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    doc.pipe(res);

    const drawDashedLine = (yPos) => {
      doc.save();
      doc.strokeColor('#000').lineWidth(0.5);
      const dashLen = 3, gap = 2;
      for (let x = margin; x < pageWidth - margin; x += dashLen + gap) {
        doc.moveTo(x, yPos).lineTo(Math.min(x + dashLen, pageWidth - margin), yPos).stroke();
      }
      doc.restore();
      return yPos + 6;
    };

    transactions.forEach((tx, index) => {
      if (index > 0) doc.addPage();

      let y = margin;

      const makePrintRow = (label, value) => {
        doc.fontSize(7).font('Helvetica-Bold').fillColor('#000').text(label, centerX, y, { width: labelW });
        doc.fontSize(7).font('Helvetica').fillColor('#000').text(String(value), centerX + labelW, y, { width: valueW, align: 'right' });
        y += 11;
      };

      // Determine correct invoice number
      let correctInvoiceNumber = 'N/A';
      if (tx.invoiceNumber) {
        correctInvoiceNumber = tx.invoiceNumber;
      } else if (tx.order?.invoiceHistory?.length > 0) {
        const txAmount = tx.amount;
        const txDate = new Date(tx.date || tx.createdAt);
        const amountMatch = tx.order.invoiceHistory.find(hist => Math.abs(hist.amount - txAmount) < 0.01);
        if (amountMatch) {
          correctInvoiceNumber = amountMatch.invoiceNumber;
        } else {
          const timeWindowMs = 5 * 60 * 1000;
          const dateMatch = tx.order.invoiceHistory.find(hist =>
            Math.abs(txDate - new Date(hist.createdAt)) <= timeWindowMs
          );
          correctInvoiceNumber = dateMatch?.invoiceNumber || tx.order.invoiceNumber || 'N/A';
        }
      } else {
        correctInvoiceNumber = tx.order?.invoiceNumber || 'N/A';
      }

      // ===== COMPANY HEADER =====
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#000')
        .text((company.companyName || 'COMPANY').toUpperCase(), centerX, y, { width: contentWidth, align: 'center' });
      y += 14;
      if (company.companyAddress) {
        doc.fontSize(6).font('Helvetica').fillColor('#000')
          .text(company.companyAddress, centerX, y, { width: contentWidth, align: 'center' });
        y += 9;
      }
      if (company.companyPhone) {
        doc.fontSize(6).font('Helvetica').fillColor('#000')
          .text(`Mob: ${company.companyPhone}`, centerX, y, { width: contentWidth, align: 'center' });
        y += 9;
      }
      if (company.companyTel) {
        doc.fontSize(6).font('Helvetica').fillColor('#000')
          .text(`Tel.: ${company.companyTel}`, centerX, y, { width: contentWidth, align: 'center' });
        y += 9;
      }
      if (company.companyWebsite) {
        doc.fontSize(6).font('Helvetica').fillColor('#000')
          .text(company.companyWebsite, centerX, y, { width: contentWidth, align: 'center' });
        y += 9;
      }

      y = drawDashedLine(y + 2);

      // ===== TITLE =====
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#000')
        .text('CASH PAYMENT RECEIPT', centerX, y, { width: contentWidth, align: 'center' });
      y += 14;
      if (useSingleReceipt) {
        doc.fontSize(7).font('Helvetica').fillColor('#000')
          .text(finalReceiptNumber, centerX, y, { width: contentWidth, align: 'center' });
        y += 11;
      }

      y = drawDashedLine(y);

      // ===== RECEIPT INFO =====
      makePrintRow('Invoice No:', correctInvoiceNumber);
      makePrintRow('Date:', new Date(tx.date).toLocaleDateString('en-IN'));

      y = drawDashedLine(y + 2);

      // ===== CUSTOMER INFO =====
      const order = tx.order || {};
      doc.fontSize(7).font('Helvetica-Bold').fillColor('#000').text('CUSTOMER:', centerX, y);
      y += 11;
      doc.fontSize(7).font('Helvetica').fillColor('#000').text(order.customer?.name || 'N/A', centerX, y);
      y += 10;
      if (order.customer?.phoneNumber) {
        doc.fontSize(7).font('Helvetica').fillColor('#000').text(order.customer.phoneNumber, centerX, y);
        y += 10;
      }
      if (order.customer?.address) {
        doc.fontSize(7).font('Helvetica').fillColor('#000').text(order.customer.address, centerX, y, { width: contentWidth });
        y += 10;
      }

      y = drawDashedLine(y + 2);

      // ===== PAYMENT DETAILS =====
      makePrintRow('Delivery Man:', tx.deliveryMan?.username || 'N/A');
      makePrintRow('Amount Paid:', `AED ${tx.amount.toFixed(2)}`);
      makePrintRow('Method:', tx.method.charAt(0).toUpperCase() + tx.method.slice(1));

      if (tx.method === 'cheque' && tx.chequeDetails) {
        y = drawDashedLine(y + 2);
        doc.fontSize(7).font('Helvetica-Bold').fillColor('#000').text('CHEQUE DETAILS:', centerX, y);
        y += 11;
        makePrintRow('Cheque No:', tx.chequeDetails.number || 'N/A');
        makePrintRow('Bank:', tx.chequeDetails.bank || 'N/A');
        if (tx.chequeDetails.date) {
          makePrintRow('Cheque Date:', new Date(tx.chequeDetails.date).toLocaleDateString('en-IN'));
        }
      }

      y = drawDashedLine(y + 2);

      // ===== GRAND TOTAL DUE =====
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#000')
        .text('BALANCE DUE', centerX, y, { width: labelW + 10 });
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#000')
        .text(`AED ${totalDue.toFixed(2)}`, centerX + labelW + 10, y, { width: valueW - 10, align: 'right' });
      y += 14;

      y = drawDashedLine(y);

      // ===== FOOTER =====
      y += 4;
      doc.fontSize(6).font('Helvetica').fillColor('#000')
        .text('Thank you for your payment!', centerX, y, { width: contentWidth, align: 'center' });
      y += 9;
      doc.text('This is a computer-generated receipt.', centerX, y, { width: contentWidth, align: 'center' });
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