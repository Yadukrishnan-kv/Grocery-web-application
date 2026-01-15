// routes/orderRoutes.js
const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware"); // Make sure you have this middleware
const {
  createOrder,
  getAllOrders,
  getOrderById,
  updateOrder,
  deleteOrder,
  deliverOrder,
  cancelOrder,
  getDeliveredInvoice,
  getPendingInvoice,
  assignOrderToDeliveryMan,
  getMyAssignedOrders,
  acceptAssignedOrder,
  rejectAssignedOrder,
} = require("../controllers/orderController");

// Public routes (if any)
// router.post("/createorder", createOrder);

// Protected routes - ADD AUTH MIDDLEWARE
router.use(protect); // This applies auth middleware to all routes below

router.post("/createorder", createOrder);
router.get("/getallorders", getAllOrders);
router.get("/getorderbyid/:id", getOrderById);
router.put("/updateorder/:id", updateOrder);
router.delete("/deleteorder/:id", deleteOrder);
router.post("/deliverorder/:id", deliverOrder);
router.post("/cancelorder/:id", cancelOrder);
router.get("/getdeliveredinvoice/:id", getDeliveredInvoice);
router.get("/getpendinginvoice/:id", getPendingInvoice);
router.post("/assign/:id", assignOrderToDeliveryMan);
router.get("/my-assigned-orders", getMyAssignedOrders);
router.post("/accept/:id", acceptAssignedOrder);
router.post("/reject/:id", rejectAssignedOrder);

module.exports = router;