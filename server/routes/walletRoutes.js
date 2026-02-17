// routes/walletRoutes.js
const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
  getDeliveryCashWallet,
  getDeliveryChequeWallet,
  requestPayCashToAdmin,     // NEW
  requestPayChequeToAdmin,   // NEW
  acceptPayment,             // NEW - for admin accept
  rejectPayment,             // NEW - for admin reject
  getAdminWalletMoney,
  markAsReceived,            // Optional - keep if still needed
} = require("../controllers/walletController");

// ────────────────────────────────────────────────
// Delivery Partner Routes (Cash & Cheque Wallets)
// ────────────────────────────────────────────────
router.get("/delivery/cash-wallet", protect, getDeliveryCashWallet);
router.get("/delivery/cheque-wallet", protect, getDeliveryChequeWallet);

// NEW: Request endpoints (replaces direct pay)
router.post("/delivery/request-pay-cash-to-admin", protect, requestPayCashToAdmin);
router.post("/delivery/request-pay-cheque-to-admin", protect, requestPayChequeToAdmin);

// ────────────────────────────────────────────────
// Admin Routes
// ────────────────────────────────────────────────
router.get("/admin/wallet-money", protect, getAdminWalletMoney);

// NEW: Accept / Reject payment requests
router.post("/admin/accept-payment", protect, acceptPayment);
router.post("/admin/reject-payment", protect, rejectPayment);

// Optional: Keep if you still want manual mark-received (fallback)
router.post("/admin/mark-received", protect, markAsReceived);

module.exports = router;