const Customer = require("../models/Customer");
const User = require("../models/User");
const CustomerRequest = require("../models/CustomerRequest");

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
      billingType = "Credit limit",
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



// Salesman creates request
const createCustomerRequest = async (req, res) => {
  try {
    if (req.user.role !== "Sales man") {
      return res.status(403).json({ message: "Only salesmen can create customer requests" });
    }

    const {
      name,
      email,
      phoneNumber,
      address,
      pincode,
      creditLimit,
      billingType = "Credit limit",
    } = req.body;

    // Validation (same as direct create)
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

    // Check if email already exists in customers or requests
    const existingCustomer = await Customer.findOne({ email: email.trim().toLowerCase() });
    const existingRequest = await CustomerRequest.findOne({
      email: email.trim().toLowerCase(),
      status: { $in: ["pending", "accepted"] }
    });
    if (existingCustomer || existingRequest) {
      return res.status(400).json({ message: "Email already in use or pending request" });
    }

    const request = await CustomerRequest.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phoneNumber: phoneNumber.trim(),
      address: address.trim(),
      pincode: pincode.trim(),
      creditLimit: parsedCreditLimit,
      billingType,
      salesman: req.user._id,
    });

    res.status(201).json({
      message: "Customer creation request submitted successfully",
      request
    });
  } catch (error) {
    console.error("Customer request creation error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Salesman gets their own requests
const getMyCustomerRequests = async (req, res) => {
  try {
    if (req.user.role !== "Sales man") {
      return res.status(403).json({ message: "Access denied" });
    }

    const requests = await CustomerRequest.find({ salesman: req.user._id })
      .sort({ createdAt: -1 });

    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// Admin gets pending requests
const getPendingCustomerRequests = async (req, res) => {
  try {
    if (req.user.role !== "Admin") {
      return res.status(403).json({ message: "Access denied - Admin only" });
    }

    const requests = await CustomerRequest.find({ status: "pending" })
      .populate("salesman", "username email")
      .sort({ createdAt: -1 });

    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// Admin accepts request (creates Customer + User)
const acceptCustomerRequest = async (req, res) => {
  try {
    if (req.user.role !== "Admin") {
      return res.status(403).json({ message: "Access denied - Admin only" });
    }

    const request = await CustomerRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    if (request.status !== "pending") {
      return res.status(400).json({ message: "Request already processed" });
    }

    // Create User
    const defaultPassword = crypto.randomBytes(10).toString("hex");

    const user = await User.create({
      username: request.name.trim(),
      email: request.email,
      password: defaultPassword,
      role: "Customer",
    });

    // Create Customer
    const customer = await Customer.create({
      user: user._id,
      name: request.name,
      email: request.email,
      phoneNumber: request.phoneNumber,
      address: request.address,
      pincode: request.pincode,
      creditLimit: request.creditLimit,
      balanceCreditLimit: request.creditLimit,
      billingType: request.billingType,
    });

    // Update request to accepted
    request.status = "accepted";
    await request.save();

    res.json({
      message: "Request accepted - Customer created",
      customer,
      note: `Login credentials: Email ${user.email}, Temp Password: ${defaultPassword} (change immediately)`
    });
  } catch (error) {
    console.error("Accept request error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Admin rejects request
const rejectCustomerRequest = async (req, res) => {
  try {
    if (req.user.role !== "Admin") {
      return res.status(403).json({ message: "Access denied - Admin only" });
    }

    const { rejectionReason } = req.body;

    const request = await CustomerRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    if (request.status !== "pending") {
      return res.status(400).json({ message: "Request already processed" });
    }

    request.status = "rejected";
    request.rejectionReason = rejectionReason || "No reason provided";
    await request.save();

    res.json({ message: "Request rejected successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};



module.exports = {
  createCustomer,
  getAllCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  getMyCustomerProfile,
  createCustomerProfile,
  createCustomerRequest,
  getMyCustomerRequests,
  getPendingCustomerRequests,
  acceptCustomerRequest,
  rejectCustomerRequest
};