const User = require("../models/User");
const Customer = require("../models/Customer");
const Role = require("../models/Role");

// Helper function to filter salesman-specific fields based on role
const filterUserData = (user) => {
  if (!user) return user;
  
  const userObj = user.toObject ? user.toObject() : user;
  
  // Only keep salesmanCreditLimit and salesmanBalanceCreditLimit for Sales man role
  if (userObj.role !== "Sales man") {
    delete userObj.salesmanCreditLimit;
    delete userObj.salesmanBalanceCreditLimit;
  }
  
  return userObj;
};

const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password");
    const filteredUsers = users.map(user => filterUserData(user));
    res.json(filteredUsers);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const createUser = async (req, res) => {
  try {
    const { username, email, password, role, emiratesName, emiratesCode, creditLimit } = req.body;

    let parsedCreditLimit = 0;
    if (role === "Sales man") {
      parsedCreditLimit = creditLimit !== undefined && creditLimit !== null && creditLimit !== "" ? parseFloat(creditLimit) : 0;
      if (isNaN(parsedCreditLimit) || parsedCreditLimit < 0) {
        return res.status(400).json({ message: "Invalid credit limit value" });
      }
    }

    const existing = await User.findOne({ $or: [{ email }, { username }] });
    if (existing) {
      return res.status(400).json({ message: "Username or email already in use" });
    }

    const user = await User.create({
      username,
      email,
      password,
      role,
      emiratesName: role === "Sales man" ? (emiratesName || null) : null,
      emiratesCode: role === "Sales man" ? (emiratesCode || null) : null,
      salesmanCreditLimit: role === "Sales man" ? parsedCreditLimit : undefined,
      salesmanBalanceCreditLimit: role === "Sales man" ? parsedCreditLimit : undefined,
    });
    const safeUser = await User.findById(user._id).select("-password");
    const filteredUser = filterUserData(safeUser);

    res.status(201).json(filteredUser);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const updateUser = async (req, res) => {
  try {
    const { username, email, role, emiratesName, emiratesCode, creditLimit } = req.body;

    

    if (email) {
      const existing = await User.findOne({ email });
      if (existing && existing._id.toString() !== req.params.id) {
        return res.status(400).json({ message: "Email already in use" });
      }
    }

    const updateFields = {
      username,
      email,
      role,
      emiratesName: role === "Sales man" ? (emiratesName || null) : null,
      emiratesCode: role === "Sales man" ? (emiratesCode || null) : null,
    };

    // Clear salesman fields for non-Sales man roles
    if (role !== "Sales man") {
      updateFields.salesmanCreditLimit = undefined;
      updateFields.salesmanBalanceCreditLimit = undefined;
    }

    if (role === "Sales man" && creditLimit !== undefined) {
      const parsedCreditLimit = parseFloat(creditLimit);
      if (isNaN(parsedCreditLimit) || parsedCreditLimit < 0) {
        return res.status(400).json({ message: "Invalid credit limit value" });
      }
      const userToUpdate = await User.findById(req.params.id);
      if (!userToUpdate) return res.status(404).json({ message: "User not found" });
      const usedCredit = (userToUpdate.salesmanCreditLimit || 0) - (userToUpdate.salesmanBalanceCreditLimit || 0);
      if (parsedCreditLimit < usedCredit) {
        return res.status(400).json({ message: "Cannot reduce credit limit below already allocated credit" });
      }
      updateFields.salesmanCreditLimit = parsedCreditLimit;
      updateFields.salesmanBalanceCreditLimit = parsedCreditLimit - usedCredit;
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      updateFields,
      { new: true, runValidators: true }
    ).select("-password");

    if (!updatedUser) return res.status(404).json({ message: "User not found" });
    
    const filteredUser = filterUserData(updatedUser);
    res.json(filteredUser);
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

    let selectFields = "username email role";
    if (req.user.role === "Sales man") {
      selectFields += " salesmanCreditLimit salesmanBalanceCreditLimit emiratesName emiratesCode";
    }

    const user = await User.findById(req.user._id).select(selectFields);

    let profile = { ...user.toObject() };

    // If Customer → attach customer details
    if (user.role === "Customer") {
      const customer = await Customer.findOne({ user: req.user._id }).select(
        "name phoneNumber address pincode creditLimit balanceCreditLimit billingType statementType dueDays openingBalance openingBalanceDueDays contactPersonName contactPersonPhone contactPersonAddress latitude longitude emiratesName emiratesCode returnCreditBalance"
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
    ).select("username email role salesmanCreditLimit salesmanBalanceCreditLimit emiratesName emiratesCode");

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
// controllers/userController.js (add this)
const getDeliveryMen = async (req, res) => {
  try {
    const deliveryMen = await User.find({ role: { $regex: /delivery/i } }).select("username _id");
    res.json(deliveryMen);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const getSalesMen = async (req, res) => {
  try {
    const salesMen = await User.find({ role: "Sales man" }).select("username _id emiratesName emiratesCode salesmanCreditLimit salesmanBalanceCreditLimit");
    res.json(salesMen);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};


const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select(
      "username name email role phoneNumber"  // choose what you want to expose
    );

    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: "User not found" 
      });
    }

    // Optional: You can add authorization logic here later
    // Example: only allow admins or the user themselves to see full details
    // if (req.user.role !== "Admin" && req.user._id.toString() !== user._id.toString()) {
    //   return res.status(403).json({ message: "Not authorized to view this user" });
    // }

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error("Error in getUserById:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};


module.exports = {
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  changePassword,
  editProfile,getMyProfile,updateMyProfile,getDeliveryMen,getSalesMen,getDeliveryMen,getUserById,
  getSalesMen,
};