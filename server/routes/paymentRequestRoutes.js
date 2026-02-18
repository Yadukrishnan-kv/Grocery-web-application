// routes/paymentRequestRoutes.js
const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
  createPaymentRequest,
  getMyPaymentRequests,
  acceptPaymentRequest,
  rejectPaymentRequest,
} = require("../controllers/paymentRequestController");

router.post("/create", protect, createPaymentRequest);
router.get("/my-requests", protect, getMyPaymentRequests);
router.post("/accept/:id", protect, acceptPaymentRequest);
router.post("/reject/:id", protect, rejectPaymentRequest);

module.exports = router;