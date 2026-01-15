const express = require("express");
const router = express.Router();

const {
  generateBill,
  getAllBills,
  getBillById,
  payBill,
} = require("../controllers/billController");


router.post("/generatebill", generateBill);
router.get("/getallbills", getAllBills);
router.get("/getbillbyid/:id", getBillById);
router.post("/paybill/:id", payBill);

module.exports = router;