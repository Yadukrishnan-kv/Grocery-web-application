const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
  createCompanySettings,
  getCompanySettings,
  updateCompanySettings,
} = require("../controllers/settingsController");

// All routes protected (logged-in user)
router.use(protect);

router.post("/company-settings", createCompanySettings);           // Create
router.get("/company-settings", getCompanySettings);               // View
router.put("/company-settings/:id", updateCompanySettings);        // Update by ID

module.exports = router;