// routes/salesReturnRoutes.js
const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
  createSalesReturn,
  getAllSalesReturns,
  getSalesReturnById,
  approveSalesReturn,
  rejectSalesReturn,
  assignReturnPickup,
  cancelSalesReturn,
  confirmPickup,
  confirmReturnReceived,
  getMyReturnPickups,
  getPickedUpReturns,
  getSalesReturnsByOrder,
  getDeliveredOrdersForReturn,
  getReturnInvoice,
} = require("../controllers/salesReturnController");

router.use(protect);

// Read
router.get("/getall", getAllSalesReturns);
router.get("/delivered-orders", getDeliveredOrdersForReturn);
router.get("/my-pickups", getMyReturnPickups);
router.get("/picked-up", getPickedUpReturns);
router.get("/by-order/:orderId", getSalesReturnsByOrder);
router.get("/invoice/:id", getReturnInvoice);
router.get("/:id", getSalesReturnById);

// Write
router.post("/create", createSalesReturn);
router.post("/approve/:id", approveSalesReturn);
router.post("/reject/:id", rejectSalesReturn);
router.post("/assign-pickup/:id", assignReturnPickup);
router.post("/cancel/:id", cancelSalesReturn);
router.post("/confirm-pickup/:id", confirmPickup);
router.post("/confirm-received/:id", confirmReturnReceived);

module.exports = router;
