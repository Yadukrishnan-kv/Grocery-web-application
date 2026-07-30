const express = require("express");
const router = express.Router();
const {
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  changePassword,
  editProfile,getMyProfile,updateMyProfile,getDeliveryMen,getSalesMen
} = require("../controllers/userController");
const { protect } = require("../middleware/authMiddleware");


// Personal profile routes
router.put("/edit-profile", protect, editProfile);

// Superadmin only: Manage all users
router.get("/getAllUsers", protect, getAllUsers);
router.post("/createUser", protect, createUser);
router.put("/updateUser/:id", protect, updateUser);
router.delete("/deleteUser/:id", protect, deleteUser);
router.get("/my-profile", protect, getMyProfile);
router.put("/my-profile", protect, updateMyProfile);
router.put("/change-password", protect, changePassword);
// routes/userRoutes.js (add these)
router.get("/delivery-men", protect, getDeliveryMen);
router.get("/sales-men", protect, getSalesMen);
module.exports = router;