const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
router.use(protect);
const {
  generateBill,
  getAllBills,
  getBillById,
  payBill,
  getCustomerBills,
  getCustomerBillById,generateTestMonthlyBill
} = require("../controllers/billController");


router.post("/generatebill", generateBill);
router.get("/getallbills", getAllBills);
router.get("/getbillbyid/:id", getBillById);
router.post("/paybill/:id", payBill);
router.get("/customer-bills", getCustomerBills);
router.get("/customer-bill/:id", getCustomerBillById);

module.exports = router;