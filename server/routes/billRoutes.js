const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
router.use(protect);
const {
  generateBill,
  getAllBills,
  getBillById,
  getCustomerBills,
  getCustomerBillById,
  markBillReceived,
  getAllPendingBills,
  getBillReceipt,
  downloadBillInvoice
} = require("../controllers/billController");


router.post("/generatebill", generateBill);
router.get("/getallbills", getAllBills);
router.get("/getbillbyid/:id", getBillById);
router.get("/customer-bills", getCustomerBills);
router.get("/customer-bill/:id", getCustomerBillById);
router.post("/mark-received", protect, markBillReceived); // NEW
router.get("/all-pending", protect, getAllPendingBills); // NEW to fetch pending bills
router.get("/receipt/:id", getBillReceipt);
router.get("/invoice/download/:billId", downloadBillInvoice);
module.exports = router;