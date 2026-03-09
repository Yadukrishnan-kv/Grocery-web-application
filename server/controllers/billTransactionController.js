// controllers/billTransactionController.js
const BillTransaction = require("../models/BillTransaction");
const BillAdminRequest = require("../models/BillAdminRequest");

const getMyTransactions = async (req, res) => {
  try {
    const transactions = await BillTransaction.find({ recipient: req.user._id })
      .populate("customer", "name")
      .populate("bill", "amountDue status invoiceNumber totalExclVat totalVatAmount grandTotal")
      .populate({
        path: "order",
        select: "invoiceNumber totalAmount totalExclVat totalVatAmount grandTotal"
      })
      .sort({ createdAt: -1 });
    
    res.json(transactions);
  } catch (error) {
    console.error("Get my transactions error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
const payToAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    // ✅ Accept method (cash/cheque) and optional chequeDetails from frontend
    const { method, chequeDetails } = req.body; 

    const tx = await BillTransaction.findById(id);
    if (!tx) return res.status(404).json({ message: "Transaction not found" });
    if (String(tx.recipient) !== String(req.user._id)) {
      return res.status(403).json({ message: "Not your transaction" });
    }
    if (tx.status !== "received") {
      return res.status(400).json({ message: "Transaction not in received state" });
    }

    // ✅ Update transaction with payment method & cheque details if provided
    if (method) tx.method = method;  // method can be "cash" OR "cheque"
    if (chequeDetails && method === "cheque") {
      tx.chequeDetails = chequeDetails;
    }

    await BillAdminRequest.create({
      transaction: tx._id,
      sender: req.user._id,
      amount: tx.amount,
      method: tx.method,  // ✅ Stores "cash" or "cheque"
      chequeDetails: tx.chequeDetails,  // ✅ Stores cheque info if applicable
      status: "pending",
    });

    tx.status = "pending";
    await tx.save();

    res.json({ message: "Payment request sent to admin successfully" });
  } catch (error) {
    console.error("Pay to admin error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ FIXED: Use req.params.id (matches route :id)
const adminAccept = async (req, res) => {
  try {
    const { id } = req.params; // ✅ Changed from transactionId to id
    
    console.log("🔍 Admin Accept - Received ID:", id);
    
    // Validate ObjectId format
    if (!id || id.length !== 24) {
      console.error("❌ Invalid ID format:", id);
      return res.status(400).json({ message: "Invalid transaction ID format" });
    }

    const tx = await BillTransaction.findById(id);
    
    console.log("🔍 Found Transaction:", tx ? tx._id : "NOT FOUND", "Status:", tx?.status);
    
    if (!tx) {
      console.error("❌ Transaction not found in DB for ID:", id);
      return res.status(404).json({ message: "Transaction not found" });
    }
    
    if (tx.status !== "pending") {
      return res.status(400).json({ 
        message: `Transaction not in pending state (current: ${tx.status})` 
      });
    }

    // Find related pending BillAdminRequest
    const adminReq = await BillAdminRequest.findOne({
      transaction: id,
      status: "pending",
    });

    console.log("🔍 Found Admin Request:", adminReq ? adminReq._id : "NOT FOUND");

    if (!adminReq) {
      return res.status(404).json({ message: "Admin request not found or already processed" });
    }

    // Update both records
    adminReq.status = "accepted";
    await adminReq.save();

    tx.status = "paid_to_admin";
    await tx.save();

    console.log("✅ Payment accepted - Transaction:", tx._id, "now status:", tx.status);
    
    res.json({ message: "Payment accepted successfully – amount credited to admin" });
  } catch (error) {
    console.error("❌ Admin accept error:", error);
    res.status(500).json({ message: "Server error: " + error.message });
  }
};

const adminReject = async (req, res) => {
  try {
    const { id } = req.params; // ✅ Changed from transactionId to id
    
    const tx = await BillTransaction.findById(id);
    if (!tx) return res.status(404).json({ message: "Transaction not found" });
    
    if (tx.status !== "pending") {
      return res.status(400).json({ message: "Transaction not in pending state" });
    }

    const adminReq = await BillAdminRequest.findOne({
      transaction: id,
      status: "pending",
    });

    if (!adminReq) {
      return res.status(404).json({ message: "Admin request not found" });
    }

    adminReq.status = "rejected";
    await adminReq.save();

    tx.status = "received"; // Revert so delivery can resend
    await tx.save();

    res.json({ message: "Request rejected – delivery/sales can resend" });
  } catch (error) {
    console.error("Admin reject error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const getAdminPending = async (req, res) => {
  try {
    const requests = await BillAdminRequest.find({ status: "pending" })
      .populate({
        path: "transaction",
        populate: [
          { path: "customer", select: "name" },
          { path: "bill", select: "_id" }
        ]
      })
      .populate("sender", "username role")
      .sort({ createdAt: -1 });
    res.json(requests);
  } catch (error) {
    console.error("Get admin pending error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const getAdminAll = async (req, res) => {
  try {
    const transactions = await BillTransaction.find({})
      .populate("recipient", "username role")
      .populate("customer", "name")
      .populate("bill", "_id")
      .populate({
        path: "adminRequest",  // Virtual populate (see Step 2)
        select: "status updatedAt",
        match: { status: { $in: ["accepted", "rejected"] } } // Only show final decisions
      })
      .sort({ createdAt: -1 });
    
    res.json(transactions);
  } catch (error) {
    console.error("Get admin all error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const adminMarkReceived = async (req, res) => {
  try {
    const { id } = req.params;
    // ✅ Accept method (cash/cheque) and optional chequeDetails
    const { method, chequeDetails } = req.body;

    const tx = await BillTransaction.findById(id);
    if (!tx) return res.status(404).json({ message: "Transaction not found" });
    if (tx.status !== "received") {
      return res.status(400).json({
        message: `Can only mark 'received' transactions (current: ${tx.status})`,
      });
    }

    // ✅ Update with selected method & cheque details
    if (method) tx.method = method;  // "cash" or "cheque"
    if (chequeDetails && method === "cheque") {
      tx.chequeDetails = chequeDetails;
    }

    tx.status = "paid_to_admin";
    await tx.save();

    res.json({
      message: "Payment marked as received – amount credited to admin wallet",
      transactionId: tx._id,
      amount: tx.amount,
      method: tx.method,  // Returns "cash" or "cheque"
    });
  } catch (error) {
    console.error("Admin mark received error:", error);
    res.status(500).json({ message: "Server error: " + error.message });
  }
};
// Generate bulk receipt PDF for multiple transactions
const generateBulkReceipt = async (req, res) => {
  try {
    const { transactionIds } = req.body;

    if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
      return res.status(400).json({ message: "Invalid transaction IDs" });
    }

    // Fetch all transactions with order and invoice info
    const transactions = await BillTransaction.find({ _id: { $in: transactionIds } })
      .populate("customer", "name address")
      .populate("bill", "_id totalUsed amountDue paidAmount batchReceiptNumber invoiceNumber") // ✅ Ensure invoiceNumber is populated
      .populate("recipient", "username")
      .populate("order", "invoiceNumber");

    if (transactions.length === 0) {
      return res.status(404).json({ message: "No transactions found" });
    }

    // Verify all transactions belong to the current user
    const allOwned = transactions.every(tx => String(tx.recipient._id) === String(req.user._id));
    if (!allOwned) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // Extract common batch ID if all share one
    const commonBatch = transactions[0]?.bill?.batchReceiptNumber;
    const allSameBatch = transactions.every(tx => tx.bill?.batchReceiptNumber === commonBatch);
    const batchTitle = allSameBatch && commonBatch ? `BULK RECEIPT (Batch: ${commonBatch})` : "BULK RECEIPT";

    // Generate PDF with PDFKit
    const PDFDocument = require("pdfkit");
    const doc = new PDFDocument({ margin: 40 });

    // ✅ Improved filename: Use unique invoices or generic
    const uniqueInvoices = [...new Set(transactions.map(tx => 
      tx.bill?.invoiceNumber || tx.invoiceNumber || tx.order?.invoiceNumber || "NA"
    ))];
    let suggestedFilename = uniqueInvoices.length === 1 && uniqueInvoices[0] !== "NA" 
      ? `bulk-receipt-${uniqueInvoices[0]}` 
      : `bulk-receipt-${uniqueInvoices.length}-invoices`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${suggestedFilename}.pdf"`);

    // Handle stream errors
    doc.on("error", (err) => {
      console.error("PDF generation error:", err);
      if (!res.headersSent) {
        res.status(500).json({ message: "Error generating PDF" });
      }
    });
    doc.pipe(res);

    // Header
    doc.fontSize(20).font("Helvetica-Bold").text(batchTitle, { align: "center" });
    doc.fontSize(10).font("Helvetica").text(`Generated: ${new Date().toLocaleDateString()}`, { align: "center" });
    doc.moveDown();

    // Recipient info
    doc.fontSize(12).font("Helvetica-Bold").text("Recipient:");
    doc.fontSize(10).font("Helvetica").text(`Name: ${transactions[0].recipient.username}`);
    doc.moveDown();

    // Table header
    const tableX = doc.x;
    const colWidth = 85;
    const row1Y = doc.y;
    doc.font("Helvetica-Bold").fontSize(9);
    doc.text("Customer", tableX, row1Y, { width: colWidth });
   
    doc.text("Invoice #", tableX + colWidth * 2, row1Y, { width: colWidth });
    doc.text("Amount", tableX + colWidth * 3, row1Y, { width: colWidth });
    doc.text("Method", tableX + colWidth * 4, row1Y, { width: colWidth });
    doc.moveTo(tableX, row1Y + 15).lineTo(tableX + colWidth * 5, row1Y + 15).stroke();
    doc.moveDown(1.5);

    // Table rows - ✅ FIXED: Prioritize bill/transaction invoice over order (for partial deliveries)
    let totalAmount = 0;
    doc.font("Helvetica").fontSize(9);
    transactions.forEach((tx, idx) => {
      const rowY = doc.y;
      doc.text(tx.customer?.name || "N/A", tableX, rowY, { width: colWidth });

     

      // ✅ FIXED PRIORITY: bill.invoiceNumber > tx.invoiceNumber > tx.order.invoiceNumber
      // This ensures DEL-01 shows for its bill, even if order is shared/updated
      const invoiceNum = tx.bill?.invoiceNumber || tx.invoiceNumber || tx.order?.invoiceNumber || "N/A";
      doc.text(invoiceNum, tableX + colWidth * 2, rowY, { width: colWidth });

      doc.text((tx.amount || 0).toFixed(2), tableX + colWidth * 3, rowY, { width: colWidth, align: "right" });
      doc.text(tx.method?.charAt(0).toUpperCase() + (tx.method?.slice(1) || ""), tableX + colWidth * 4, rowY, { width: colWidth });
      totalAmount += tx.amount || 0;
      doc.moveDown();
    });

    doc.moveTo(tableX, doc.y).lineTo(tableX + colWidth * 5, doc.y).stroke();
    doc.moveDown(0.5);

    // Total
    doc.font("Helvetica-Bold").fontSize(11);
    doc.text(`TOTAL AMOUNT: AED ${totalAmount.toFixed(2)}`, { align: "right" });
    doc.moveDown();

    // Footer
    doc.fontSize(9).font("Helvetica");
    doc.text("This is a bulk receipt covering all transactions listed above.", { align: "center" });
    doc.text(`Total Transactions: ${transactions.length}`, { align: "center" });
    doc.end();
  } catch (error) {
    console.error("Generate bulk receipt error:", error);
    if (!res.headersSent) {
      res.status(500).json({ message: "Server error" });
    }
  }
};

module.exports = {
  getMyTransactions,
  payToAdmin,
  adminAccept,
  adminReject,
  getAdminPending,
  getAdminAll,
  adminMarkReceived,
  generateBulkReceipt,
};