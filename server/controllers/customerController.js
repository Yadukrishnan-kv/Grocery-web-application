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

    // 2. Check for duplicate customer
    const existingCustomer = await Customer.findOne({ email: email.trim().toLowerCase() });
    if (existingCustomer) {
      return res.status(400).json({
        message: "A customer with this email already exists",
      });
    }

    // 3. Check for duplicate user/login
    const existingUser = await User.findOne({ email: email.trim().toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        message: "This email is already registered as a user account",
      });
    }

    // 4. Create Customer document
    const customer = await Customer.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phoneNumber: phoneNumber.trim(),
      address: address.trim(),
      pincode: pincode.trim(),
      creditLimit: parsedCreditLimit,
      billingType,
      // balanceCreditLimit is automatically set by schema default function
    });

    // 5. Create corresponding User (login) account
    // For development/testing - fixed password
    // In production: generate random password & send via email
    const isProduction = process.env.NODE_ENV === "production";

    let passwordForUser;
    let passwordMessage = "";

    if (isProduction) {
      // Production: random temporary password (recommended)
      passwordForUser = crypto.randomBytes(10).toString("hex");
      passwordMessage = "Login credentials have been prepared (temporary password sent via email)";
      // TODO: Implement email sending here
      // await sendWelcomeEmail(customer.email, customer.name, passwordForUser);
    } else {
      // Development/testing only - fixed password
      passwordForUser = "customer123";
      passwordMessage = "Development mode: temporary password is 'customer123'";
    }

    const user = await User.create({
      username: name.trim(),
      email: email.trim().toLowerCase(),
      password: passwordForUser, // ← plain text → will be hashed by pre-save hook
      role: "Customer",
    });

    // 6. Final response
    // IMPORTANT: NEVER send real password in production response!
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
      note: passwordMessage,
    };

    // Only include temporary password info in development mode
    if (!isProduction) {
      responseData.defaultLoginInfo = {
        email: user.email,
        temporaryPassword: passwordForUser,
        note: "Please change your password immediately after first login",
      };
    }

    res.status(201).json(responseData);
  } catch (error) {
    console.error("Customer creation error:", error);

    // Handle mongoose validation errors more gracefully
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        message: "Validation failed",
        errors,
      });
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

module.exports = {
  createCustomer,
  getAllCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer
};