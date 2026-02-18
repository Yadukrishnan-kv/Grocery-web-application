// controllers/billTransactionController.js
const BillTransaction = require("../models/BillTransaction");
const BillAdminRequest = require("../models/BillAdminRequest");

const getMyTransactions = async (req, res) => {
  try {
    const transactions = await BillTransaction.find({ recipient: req.user._id })
      .populate("customer", "name")
      .populate("bill", "amountDue status")
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
    const tx = await BillTransaction.findById(id);

    if (!tx) return res.status(404).json({ message: "Transaction not found" });
    if (String(tx.recipient) !== String(req.user._id)) {
      return res.status(403).json({ message: "Not your transaction" });
    }
    if (tx.status !== "received") {
      return res.status(400).json({ message: "Transaction not in received state" });
    }

    await BillAdminRequest.create({
      transaction: tx._id,
      sender: req.user._id,
      amount: tx.amount,
      method: tx.method,
      chequeDetails: tx.chequeDetails,
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

module.exports = {
  getMyTransactions,
  payToAdmin,
  adminAccept,
  adminReject,
  getAdminPending,
  getAdminAll,
};