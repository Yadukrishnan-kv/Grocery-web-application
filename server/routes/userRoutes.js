const express = require("express");
const router = express.Router();
const {
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  changePassword,
  editProfile,getMyProfile,updateMyProfile
} = require("../controllers/userController");
const { protect } = require("../middleware/authMiddleware");


// Personal profile routes
router.put("/edit-profile", editProfile);

// Superadmin only: Manage all users
router.get("/getAllUsers", getAllUsers);
router.post("/createUser",  createUser);
router.put("/updateUser/:id",  updateUser);
router.delete("/deleteUser/:id",  deleteUser);
router.get("/my-profile", protect, getMyProfile);
router.put("/my-profile", protect, updateMyProfile);
router.put("/change-password", protect, changePassword);
module.exports = router;