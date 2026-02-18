// routes/billTransactionRoutes.js
const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/authMiddleware");

const {
  getMyTransactions,
  payToAdmin,
  adminAccept,
  adminReject,
  getAdminPending,
  getAdminAll,
} = require("../controllers/billTransactionController");

// Delivery/Sales routes
router.get("/my-transactions", protect, getMyTransactions);
router.post("/pay-to-admin/:id", protect, payToAdmin);

// Admin routes - NOTE: parameter is :id (matches controller)
router.get("/admin-all", protect, getAdminAll);
router.get("/admin-pending", protect,  getAdminPending);
router.post("/admin-accept/:id", protect,  adminAccept);  // ✅ :id
router.post("/admin-reject/:id", protect,  adminReject);  // ✅ :id

module.exports = router;