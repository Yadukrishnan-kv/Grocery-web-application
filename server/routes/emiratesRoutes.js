// routes/emiratesRoutes.js
const express = require("express");
const router = express.Router();
const {
  createEmirates,
  getAllEmirates,
  getEmiratesById,
  updateEmirates,
  deleteEmirates,
} = require("../controllers/emiratesController");
const { protect } = require("../middleware/authMiddleware");

router.get("/getAll", protect, getAllEmirates);
router.get("/get/:id", protect, getEmiratesById);
router.post("/create", protect, createEmirates);
router.put("/update/:id", protect, updateEmirates);
router.delete("/delete/:id", protect, deleteEmirates);

module.exports = router;
