const express = require("express");
const router = express.Router();
const {
  createRole,
  getAllRoles,
  updateRolePermissions,
  deleteRole,
  getPermissions,
  getRoleById
} = require("../controllers/roleController");




// routes/roleRoutes.js
const { protect } = require('../middleware/authMiddleware'); // Make sure you have this middleware

// Get own role permissions (for frontend menu) - ADD AUTH MIDDLEWARE
router.get("/my-permissions", protect, getPermissions);

// Superadmin only: Manage roles
router.post("/createRole", protect,  createRole);
router.get("/getAllRoles", protect,  getAllRoles);
router.get("/getrole/:id", protect,  getRoleById);
router.put("/updatepermissions/:id", protect,  updateRolePermissions);
router.delete("/deleteRole/:id", protect, deleteRole);
module.exports = router;