const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
  getCustomerPrices,
  upsertCustomerPrice,
  deleteCustomerPrice,
} = require("../controllers/customerProductPriceController");

router.use(protect);

router.get("/", getCustomerPrices);
router.post("/", upsertCustomerPrice);
router.delete("/:id", deleteCustomerPrice);

module.exports = router;
