const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
  createCompanySettings,
  getCompanySettings,
  updateCompanySettings,
  getInvoiceStatus,
} = require("../controllers/settingsController");

// All routes protected (logged-in user)
router.use(protect);

router.post("/company-settings", createCompanySettings);           // Create
router.get("/company-settings", getCompanySettings);               // View
router.put("/company-settings/:id", updateCompanySettings);        // Update by ID
router.get("/invoice-status", getInvoiceStatus);                   // InvoiceCounter existence check

module.exports = router;