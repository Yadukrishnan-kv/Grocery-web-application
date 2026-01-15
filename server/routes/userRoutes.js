const express = require("express");
const router = express.Router();
const {
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  changePassword,
  editProfile,
} = require("../controllers/userController");


// Personal profile routes
router.put("/change-password", changePassword);
router.put("/edit-profile", editProfile);

// Superadmin only: Manage all users
router.get("/getAllUsers", getAllUsers);
router.post("/createUser",  createUser);
router.put("/updateUser/:id",  updateUser);
router.delete("/deleteUser/:id",  deleteUser);

module.exports = router;