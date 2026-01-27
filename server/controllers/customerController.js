const Customer = require("../models/Customer");
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const createCustomer = async (req, res) => {
  try {
    const {
      name,
      email,
      phoneNumber,
      address,
      pincode,
      creditLimit,
      billingType = "creditcard",
    } = req.body;

    // 1. Basic validation
    if (
      !name?.trim() ||
      !email?.trim() ||
      !phoneNumber?.trim() ||
      !address?.trim() ||
      !pincode?.trim() ||
      !creditLimit
    ) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const parsedCreditLimit = parseFloat(creditLimit);
    if (isNaN(parsedCreditLimit) || parsedCreditLimit < 0) {
      return res.status(400).json({ message: "Invalid credit limit value" });
    }

    // 2. Check duplicates
    const existingCustomer = await Customer.findOne({ email: email.trim().toLowerCase() });
    if (existingCustomer) {
      return res.status(400).json({ message: "A customer with this email already exists" });
    }

    const existingUser = await User.findOne({ email: email.trim().toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: "This email is already registered as a user account" });
    }

    // 3. Create USER first (so we can get user._id)
    const defaultPassword = process.env.NODE_ENV === "production" 
      ? crypto.randomBytes(10).toString("hex") 
      : "customer123";

    const user = await User.create({
      username: name.trim(),
      email: email.trim().toLowerCase(),
      password: defaultPassword,          // plain → will be hashed by pre-save hook
      role: "Customer",
    });

    // 4. Now create CUSTOMER and link it to the user
    const customer = await Customer.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phoneNumber: phoneNumber.trim(),
      address: address.trim(),
      pincode: pincode.trim(),
      creditLimit: parsedCreditLimit,
      billingType,
      user: user._id,                      // ← now safe to use user._id
    });

    // 5. Response (never expose password in production)
    const responseData = {
      message: "Customer and login account created successfully",
      customer: {
        _id: customer._id,
        name: customer.name,
        email: customer.email,
        phoneNumber: customer.phoneNumber,
        address: customer.address,
        pincode: customer.pincode,
        creditLimit: customer.creditLimit,
        balanceCreditLimit: customer.balanceCreditLimit,
        billingType: customer.billingType,
        createdAt: customer.createdAt,
      },
      note: process.env.NODE_ENV === "production"
        ? "Login credentials prepared (temporary password sent via email)"
        : "Development mode: temporary password is 'customer123'",
    };

    // Only show temp password in development (REMOVE in production!)
    if (process.env.NODE_ENV !== "production") {
      responseData.defaultLoginInfo = {
        email: user.email,
        temporaryPassword: defaultPassword,
        note: "Please change your password immediately after first login",
      };
    }

    res.status(201).json(responseData);
  } catch (error) {
    console.error("Customer creation error:", error);

    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: "Validation failed", errors });
    }

    res.status(500).json({
      message: "Server error while creating customer and login account",
      error: error.message,
    });
  }
};

const getAllCustomers = async (req, res) => {
  try {
    const customers = await Customer.find().sort({ name: 1 });
    res.json(customers);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const getCustomerById = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }
    res.json(customer);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const updateCustomer = async (req, res) => {
  try {
    const updateData = {};
    const allowedFields = ["name", "email", "phoneNumber", "address", "pincode", "creditLimit"];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    // Check for email uniqueness if updating email
    if (updateData.email) {
      const existing = await Customer.findOne({
        email: updateData.email,
        _id: { $ne: req.params.id }
      });
      if (existing) {
        return res.status(400).json({ message: "Email already in use" });
      }
    }

    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    res.json(customer);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const deleteCustomer = async (req, res) => {
  try {
    const customerId = req.params.id;

    // 1. Find the customer
    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // 2. Find and delete corresponding user (if exists)
    const user = await User.findOneAndDelete({ email: customer.email });
    if (user) {
      console.log(`Deleted user account for customer: ${customer.email}`);
    }

    // 3. Delete the customer
    await Customer.findByIdAndDelete(customerId);

    res.json({ message: "Customer and associated user account deleted successfully" });
  } catch (error) {
    console.error("Delete customer error:", error);
    res.status(500).json({
      message: "Server error while deleting customer",
      error: error.message,
    });
  }
};

const getMyCustomerProfile = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "Customer") {
      return res.status(403).json({ message: "Access denied - Customers only" });
    }

    // Find Customer where user field matches logged-in User _id
    const customer = await Customer.findOne({ user: req.user._id })
      .select('name email phoneNumber address pincode creditLimit balanceCreditLimit billingType');

    if (!customer) {
      return res.status(404).json({ message: "Customer profile not found" });
    }

    res.json(customer);
  } catch (error) {
    console.error("Get my customer profile error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
const createCustomerProfile = async (req, res) => {
  try {
    const { name, phoneNumber, address, pincode } = req.body;
    const existing = await Customer.findOne({ user: req.user._id });
    if (existing) return res.status(400).json({ message: 'Profile already exists' });

    const customer = await Customer.create({
      user: req.user._id,
      name,
      phoneNumber,
      address,
      pincode,
      creditLimit: 0,
      usedCredit: 0,
    });

    res.status(201).json(customer);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  createCustomer,
  getAllCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,getMyCustomerProfile,createCustomerProfile
};