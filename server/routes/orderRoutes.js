// routes/orderRoutes.js
const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware"); // Make sure you have this middleware
const {
  createOrder,
  getAllOrders,
  getOrderById,
  getSalesmanOrders,
  getSalesmanDeliveredOrders,
  updateOrder,
  deleteOrder,
  deliverOrder,
  cancelOrder,
  getDeliveredInvoice,
  getPendingInvoice,
  assignOrderToDeliveryMan,
  getMyAssignedOrders,
  acceptAssignedOrder,
  rejectAssignedOrder,getDeliveredOrdersForAdmin,getCustomerOrders,getCustomerOrderById,
  getMyOrders,getOrderInvoice,getlastorderdetails,checkFirstOrder,
  getPendingOrderRequests,approveOrderRequest,rejectOrderRequest,getCustomerOrderHistory,createOrderRequest,packOrder,getPendingForPacking,getMyPendingOrders,getPackedToday,
  getReadyToDeliver,getPackedInvoice,getUnifiedInvoice,getAllOrdersForStorekeeper
} = require("../controllers/orderController");



// Protected routes - ADD AUTH MIDDLEWARE
router.use(protect); // This applies auth middleware to all routes below

router.post("/createorder", createOrder);
router.get("/getallorders", getAllOrders);
router.get("/getorderbyid/:id", getOrderById);
router.get("/salesman-orders",  getSalesmanOrders)
router.get("/salesman-delivered-orders",  getSalesmanDeliveredOrders);
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
router.get("/admin-delivered-orders", getDeliveredOrdersForAdmin);
router.get("/customerorders", getCustomerOrders);
router.get("/customerorder/:id", getCustomerOrderById);
router.get("/my-orders", getMyOrders);
router.get('/invoice/:id', getOrderInvoice);
router.get('/previous-price', getlastorderdetails); 
// Check if first order for customer
router.get("/check-first-order/:customerId", protect, checkFirstOrder);
router.post("/order-request", createOrderRequest);
router.get("/pending-requests", protect, getPendingOrderRequests);
router.post("/approve-request/:requestId", protect, approveOrderRequest);
router.post("/reject-request/:requestId", protect, rejectOrderRequest);
router.get("/customer-history", protect, getCustomerOrderHistory);
router.post("/pack/:orderId", protect, packOrder);
// routes/orderRoutes.js

router.get("/pending-for-packing", protect, getPendingForPacking);
router.get("/my-pending-orders", protect, getMyPendingOrders);
// routes/orderRoutes.js
router.get("/packed-today", protect, getPackedToday);
router.get("/ready-to-deliver", protect, getReadyToDeliver);
router.get("/packed-invoice/:id", protect, getPackedInvoice);
// ✅ NEW: Unified invoice showing Ordered/Packed/Delivered quantities
router.get("/unified-invoice/:id", protect, getUnifiedInvoice);
router.get('/all-orders', protect, getAllOrdersForStorekeeper);
module.exports = router;