const User = require("../models/User");
const Customer = require("../models/Customer");
const Role = require("../models/Role");

const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const createUser = async (req, res) => {
  try {
    const { username, email, password, role } = req.body;

    

    const existing = await User.findOne({ $or: [{ email }, { username }] });
    if (existing) {
      return res.status(400).json({ message: "Username or email already in use" });
    }

    const user = await User.create({ username, email, password, role });
    const safeUser = await User.findById(user._id).select("-password");

    res.status(201).json(safeUser);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const updateUser = async (req, res) => {
  try {
    const { username, email, role } = req.body;

    

    if (email) {
      const existing = await User.findOne({ email });
      if (existing && existing._id.toString() !== req.params.id) {
        return res.status(400).json({ message: "Email already in use" });
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { username, email, role },
      { new: true, runValidators: true }
    ).select("-password");

    if (!updatedUser) return res.status(404).json({ message: "User not found" });

    res.json(updatedUser);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};



const editProfile = async (req, res) => {
  try {
    const { username, email } = req.body;

    if (email) {
      const existing = await User.findOne({ email });
      if (existing && existing._id.toString() !== req.user._id) {
        return res.status(400).json({ message: "Email already in use" });
      }
    }

    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { username, email },
      { new: true, runValidators: true }
    ).select("-password");

    res.json({ message: "Profile updated successfully", user: updated });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};
const getMyProfile = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const user = await User.findById(req.user._id).select("username email role");

    let profile = { ...user.toObject() };

    // If Customer → attach customer details
    if (user.role === "Customer") {
      const customer = await Customer.findOne({ user: req.user._id }).select(
        "name phoneNumber address pincode creditLimit balanceCreditLimit billingType"
      );

      if (customer) {
        profile.customerDetails = customer.toObject();
      }
    }

    res.json(profile);
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// 2. Update basic profile (username & email only)
const updateMyProfile = async (req, res) => {
  try {
    const { username, email } = req.body;

    if (!username && !email) {
      return res.status(400).json({ message: "No fields to update" });
    }

    const updateFields = {};
    if (username) updateFields.username = username.trim();
    if (email) {
      const existing = await User.findOne({ email: email.trim().toLowerCase() });
      if (existing && existing._id.toString() !== req.user._id.toString()) {
        return res.status(400).json({ message: "Email already in use" });
      }
      updateFields.email = email.trim().toLowerCase();
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      updateFields,
      { new: true, runValidators: true }
    ).select("username email role");

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ message: "Profile updated successfully", user: updatedUser });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// 3. Change password (already good, but included for completeness)
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select("+password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    user.password = newPassword; // ← pre-save hook will hash it
    await user.save();

    res.json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  changePassword,
  editProfile,getMyProfile,updateMyProfile
};