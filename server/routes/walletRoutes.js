// routes/walletRoutes.js or add to existing routes
const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
  getDeliveryWallet,
  payToAdmin,
  getAdminWalletMoney,
  markAsReceived,
} = require("../controllers/walletController");

router.get("/delivery/wallet", protect, getDeliveryWallet);
router.post("/delivery/pay-to-admin", protect, payToAdmin);
router.get("/admin/wallet-money", protect, getAdminWalletMoney);
router.post("/admin/mark-received", protect, markAsReceived);

module.exports = router;