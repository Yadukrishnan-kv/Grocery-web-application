const Customer = require("../models/Customer");
const User = require("../models/User");
const CustomerRequest = require("../models/CustomerRequest");
const Bill = require("../models/Bill");
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
      statementType,
      dueDays,
      openingBalance = 0,
      openingBalanceDueDays,
      salesmanId,
    } = req.body;

    // Validation
    if (
      !name?.trim() ||
      !email?.trim() ||
      !phoneNumber?.trim() ||
      !address?.trim() ||
      !pincode?.trim() ||
      !creditLimit
    ) {
      return res.status(400).json({ message: "All core fields are required" });
    }

    const parsedCreditLimit = parseFloat(creditLimit);
    if (isNaN(parsedCreditLimit) || parsedCreditLimit < 0) {
      return res.status(400).json({ message: "Invalid credit limit value" });
    }

    let parsedStatementType = null;
    let parsedDueDays = null;
    if (billingType === "Credit limit") {
      if (!statementType || !["invoice-based", "monthly"].includes(statementType)) {
        return res.status(400).json({ message: "Invalid statement type" });
      }
      if (!dueDays || isNaN(dueDays) || parseInt(dueDays) < 0) {
        return res.status(400).json({ message: "Due days must be non-negative" });
      }
      parsedStatementType = statementType;
      parsedDueDays = parseInt(dueDays);
    }

    // Opening balance validation
    const parsedOpeningBalance = parseFloat(openingBalance) || 0;
    let parsedOpeningBalanceDueDays = null;
    if (parsedOpeningBalance > 0) {
      if (!openingBalanceDueDays || isNaN(openingBalanceDueDays) || parseInt(openingBalanceDueDays) < 0) {
        return res.status(400).json({ message: "Valid due days required for opening balance > 0" });
      }
      parsedOpeningBalanceDueDays = parseInt(openingBalanceDueDays);
    }

    // Check duplicates
    const existingCustomer = await Customer.findOne({ email: email.trim().toLowerCase() });
    if (existingCustomer) {
      return res.status(400).json({ message: "Email already in use" });
    }

    const existingUser = await User.findOne({ email: email.trim().toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // Create user
    const defaultPassword = process.env.NODE_ENV === "production"
      ? crypto.randomBytes(10).toString("hex")
      : "customer123";

    const user = await User.create({
      username: name.trim(),
      email: email.trim().toLowerCase(),
      password: defaultPassword,
      role: "Customer",
    });

    // Create customer with new fields
    const customer = await Customer.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phoneNumber: phoneNumber.trim(),
      address: address.trim(),
      pincode: pincode.trim(),
      creditLimit: parsedCreditLimit,
      balanceCreditLimit: parsedCreditLimit - parsedOpeningBalance,
      billingType,
      statementType: parsedStatementType,
      dueDays: parsedDueDays,
      openingBalance: parsedOpeningBalance,
      openingBalanceDueDays: parsedOpeningBalanceDueDays,
      user: user._id,
      salesman: salesmanId || null,
    });

    // Create bill for opening balance if applicable
    if (parsedOpeningBalance > 0 && parsedOpeningBalanceDueDays) {
      const openingDueDate = new Date();
      openingDueDate.setDate(openingDueDate.getDate() + parsedOpeningBalanceDueDays);

      // Generate OB invoice number: OB-YYYYMMDD-XXXX
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const timestamp = String(now.getTime()).slice(-4); // Last 4 digits of timestamp
      const invoiceNumber = `OB-${year}${month}${day}-${timestamp}`;

      await Bill.create({
        customer: customer._id,
        cycleStart: new Date(),
        cycleEnd: new Date(),
        totalUsed: parsedOpeningBalance,
        amountDue: parsedOpeningBalance,
        dueDate: openingDueDate,
        paidAmount: 0,
        status: "pending",
        orders: [],
        invoiceNumber,
        isOpeningBalance: true,
      });
    }

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
        statementType: customer.statementType,
        dueDays: customer.dueDays,
        openingBalance: customer.openingBalance,
        openingBalanceDueDays: customer.openingBalanceDueDays,
        createdAt: customer.createdAt,
      },
      note: process.env.NODE_ENV === "production"
        ? "Login credentials prepared (temporary password sent via email)"
        : "Development mode: temporary password is 'customer123'",
    };

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
    res.status(500).json({ message: "Server error", error: error.message });
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

const getSalesmanCustomers = async (req, res) => {
  try {
    // Only allow salesmen to access
    if (req.user.role !== "Sales man") {
      return res.status(403).json({ message: "Access denied - Salesmen only" });
    }

    // Get customers assigned to this salesman
    const customers = await Customer.find({ salesman: req.user._id })
      .select("name email phoneNumber _id")
      .sort({ name: 1 });

    res.json(customers);
  } catch (error) {
    console.error("Get salesman customers error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const updateCustomer = async (req, res) => {
  try {
    const updateData = {};
    
    // Allow updating these fields (expanded list)
    const allowedFields = [
      "name",
      "email",
      "phoneNumber",
      "address",
      "pincode",
      "creditLimit",
      "billingType",
      "statementType",
      "dueDays",
      "openingBalance",
      "openingBalanceDueDays",
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    // Special handling for creditLimit / openingBalance changes
    if (updateData.creditLimit !== undefined || updateData.openingBalance !== undefined) {
      const customer = await Customer.findById(req.params.id);
      if (!customer) return res.status(404).json({ message: "Customer not found" });

      const newCreditLimit = updateData.creditLimit !== undefined 
        ? parseFloat(updateData.creditLimit) 
        : customer.creditLimit;

      const newOpeningBalance = updateData.openingBalance !== undefined 
        ? parseFloat(updateData.openingBalance) 
        : customer.openingBalance;

      // Validate
      if (isNaN(newCreditLimit) || newCreditLimit < 0) {
        return res.status(400).json({ message: "Invalid credit limit" });
      }
      if (newOpeningBalance < 0) {
        return res.status(400).json({ message: "Opening balance cannot be negative" });
      }
      if (newOpeningBalance > newCreditLimit) {
        return res.status(400).json({ message: "Opening balance cannot exceed credit limit" });
      }

      // Recalculate balanceCreditLimit
      updateData.balanceCreditLimit = newCreditLimit - newOpeningBalance;
    }

    // Email uniqueness check
    if (updateData.email) {
      const existing = await Customer.findOne({
        email: updateData.email.trim().toLowerCase(),
        _id: { $ne: req.params.id }
      });
      if (existing) {
        return res.status(400).json({ message: "Email already in use" });
      }
      updateData.email = updateData.email.trim().toLowerCase();
    }

    // If changing billingType to "Cash", clear credit-related fields
    if (updateData.billingType === "Cash") {
      updateData.statementType = null;
      updateData.dueDays = null;
      updateData.balanceCreditLimit = 0;
    }

    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // Optional: If openingBalance changed, you could create/update a bill here
    // But for simplicity, we assume admin handles bills separately

    res.json(customer);
  } catch (error) {
    console.error("Update customer error:", error);
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

    // Include new fields
    const customer = await Customer.findOne({ user: req.user._id })
      .select('name email phoneNumber address pincode creditLimit balanceCreditLimit billingType statementType dueDays salesman openingBalance openingBalanceDueDays');

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
      statementType,  // NEW
      dueDays,        // NEW
      openingBalance = 0,
      openingBalanceDueDays,
    } = req.body;

    // Validation
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

    // NEW: Validate billing config if "Credit limit"
    let parsedStatementType = null;
    let parsedDueDays = null;
    if (billingType === "Credit limit") {
      if (!statementType || !["invoice-based", "monthly"].includes(statementType)) {
        return res.status(400).json({ message: "Invalid statement type. Must be 'invoice-based' or 'monthly'" });
      }
      if (!dueDays || isNaN(dueDays) || parseInt(dueDays) < 0) {
        return res.status(400).json({ message: "Due days must be a non-negative number" });
      }
      parsedStatementType = statementType;
      parsedDueDays = parseInt(dueDays);
    }

    // Opening balance validation
    const parsedOpeningBalance = parseFloat(openingBalance) || 0;
    let parsedOpeningBalanceDueDays = null;
    if (parsedOpeningBalance > 0) {
      if (!openingBalanceDueDays || isNaN(openingBalanceDueDays) || parseInt(openingBalanceDueDays) < 0) {
        return res.status(400).json({ message: "Valid due days required for opening balance > 0" });
      }
      parsedOpeningBalanceDueDays = parseInt(openingBalanceDueDays);
    }

    // Check duplicates
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
      statementType: parsedStatementType,  // NEW
      dueDays: parsedDueDays,              // NEW
      openingBalance: parsedOpeningBalance,
      openingBalanceDueDays: parsedOpeningBalanceDueDays,
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

    // Use same default password logic
    const defaultPassword = process.env.NODE_ENV === "production" 
      ? crypto.randomBytes(10).toString("hex") 
      : "customer123";

    const user = await User.create({
      username: request.name.trim(),
      email: request.email,
      password: defaultPassword,
      role: "Customer",
    });

    const customer = await Customer.create({
      user: user._id,
      name: request.name,
      email: request.email,
      phoneNumber: request.phoneNumber,
      address: request.address,
      pincode: request.pincode,
      creditLimit: request.creditLimit,
      balanceCreditLimit: request.creditLimit - (request.openingBalance || 0),
      billingType: request.billingType,
      statementType: request.statementType,  // NEW — copy from request
      dueDays: request.dueDays,              // NEW — copy from request
      openingBalance: request.openingBalance || 0,
      openingBalanceDueDays: request.openingBalanceDueDays || null,
      salesman: request.salesman,            // NEW — copy from request
    });

    // Create bill for opening balance if applicable
    if ((request.openingBalance || 0) > 0 && request.openingBalanceDueDays) {
      const openingDueDate = new Date();
      openingDueDate.setDate(openingDueDate.getDate() + request.openingBalanceDueDays);

      // Generate OB invoice number: OB-YYYYMMDD-XXXX
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const timestamp = String(now.getTime()).slice(-4); // Last 4 digits of timestamp
      const invoiceNumber = `OB-${year}${month}${day}-${timestamp}`;

      await Bill.create({
        customer: customer._id,
        cycleStart: new Date(),
        cycleEnd: new Date(),
        totalUsed: request.openingBalance,
        amountDue: request.openingBalance,
        dueDate: openingDueDate,
        paidAmount: 0,
        status: "pending",
        orders: [],
        invoiceNumber,
        isOpeningBalance: true,
      });
    }

    request.status = "accepted";
    await request.save();

    const responseData = {
      message: "Request accepted - Customer created",
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
        statementType: customer.statementType,  // NEW
        dueDays: customer.dueDays,              // NEW
        openingBalance: customer.openingBalance,
        openingBalanceDueDays: customer.openingBalanceDueDays,
        createdAt: customer.createdAt,
      },
    }

    res.status(201).json(responseData);
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
function getDaysRemaining(dueDate) {
  const today = new Date();
  const due = new Date(dueDate);
  const diffTime = due - today;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

const getAllCustomersWithDue = async (req, res) => {
  try {
    const customers = await Customer.find()
      .populate("salesman", "username email")
      .sort({ name: 1 });

    const customersWithDue = await Promise.all(
      customers.map(async (customer) => {
        const latestPendingBill = await Bill.findOne({
          customer: customer._id,
          status: "pending"
        }).sort({ cycleEnd: -1 });

        const daysLeft = latestPendingBill
          ? getDaysRemaining(latestPendingBill.dueDate)
          : null;

        return {
          ...customer.toObject(),
          pendingBillDaysLeft: daysLeft,
          pendingDueDate: latestPendingBill?.dueDate
        };
      })
    );

    res.json(customersWithDue);
  } catch (error) {
    console.error("Error in getAllCustomersWithDue:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// NEW: Get all customers for a salesman
const getMyCustomers = async (req, res) => {
  try {
    // If user is salesman, get customers assigned to them
    if (req.user.role !== "Sales man") {
      return res.status(403).json({ message: "Only salesmen can access this" });
    }

    const customers = await Customer.find({ salesman: req.user._id })
      .sort({ name: 1 });

    res.json(customers);
  } catch (error) {
    console.error("Error in getMyCustomers:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// NEW: Get all customers with outstanding balances for a salesman
const getMyCustomersWithDue = async (req, res) => {
  try {
    if (req.user.role !== "Sales man") {
      return res.status(403).json({ message: "Only salesmen can access this" });
    }

    const customers = await Customer.find({ salesman: req.user._id })
      .select('name email phoneNumber address pincode creditLimit balanceCreditLimit billingType openingBalance')
      .sort({ name: 1 });

    const customersWithDetails = await Promise.all(
      customers.map(async (customer) => {
        // Get latest pending bill for due date info
        const latestPendingBill = await Bill.findOne({
          customer: customer._id,
          status: "pending"
        }).sort({ cycleEnd: -1 });

        // Get total outstanding amount from all pending bills
        const pendingBills = await Bill.find({
          customer: customer._id,
          status: "pending"
        });
        
        const totalOutstanding = pendingBills.reduce((sum, bill) => 
          sum + (bill.amountDue - bill.paidAmount), 0);

        const daysLeft = latestPendingBill
          ? Math.ceil((new Date(latestPendingBill.dueDate) - new Date()) / (1000 * 60 * 60 * 24))
          : null;

        return {
          _id: customer._id,
          name: customer.name,
          email: customer.email,
          phoneNumber: customer.phoneNumber,
          address: customer.address,
          pincode: customer.pincode,
          creditLimit: customer.creditLimit,
          balanceCreditLimit: customer.balanceCreditLimit,
          usedCredit: customer.creditLimit - customer.balanceCreditLimit,
          billingType: customer.billingType,
          openingBalance: customer.openingBalance,
          totalOutstanding,
          pendingBillDaysLeft: daysLeft,
          pendingDueDate: latestPendingBill?.dueDate,
          createdAt: customer.createdAt
        };
      })
    );

    res.json(customersWithDetails);
  } catch (error) {
    console.error("Error in getMyCustomersWithDue:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getCustomerOutstandingDetails = async (req, res) => {
  try {
    const { customerId } = req.params;
    
    // Verify salesman can only access their assigned customers
    if (req.user.role === "Sales man") {
      const customer = await Customer.findOne({ 
        _id: customerId, 
        salesman: req.user._id 
      });
      if (!customer) {
        return res.status(403).json({ message: "Access denied - Customer not assigned to you" });
      }
    }

    // Fetch customer with full details
    const customer = await Customer.findById(customerId)
      .populate("salesman", "username email");
    
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // Fetch all pending bills for this customer
    const pendingBills = await Bill.find({
      customer: customerId,
      status: { $in: ["pending", "overdue", "partial", "pending_payment"] }
    })
    .populate({
      path: "orders",
      populate: {
        path: "orderItems.product",
        select: "productName unit"
      }
    })
    .sort({ dueDate: 1 });

    // Calculate totals
    const totalOutstanding = pendingBills.reduce((sum, bill) => 
      sum + (bill.amountDue - bill.paidAmount), 0);
    
    const totalBills = pendingBills.length;
    const overdueBills = pendingBills.filter(bill => 
      bill.status === "overdue" || new Date() > new Date(bill.dueDate)
    ).length;

    // Format bills with computed fields
    const formattedBills = pendingBills.map(bill => {
      const remainingDue = bill.amountDue - bill.paidAmount;
      const daysLeft = Math.ceil((new Date(bill.dueDate) - new Date()) / (1000 * 60 * 60 * 24));
      
      return {
        _id: bill._id,
        invoiceNumber: bill.invoiceNumber || `BILL-${bill._id.toString().slice(-8)}`,
        cycleStart: bill.cycleStart,
        cycleEnd: bill.cycleEnd,
        totalUsed: bill.totalUsed,
        amountDue: bill.amountDue,
        paidAmount: bill.paidAmount,
        remainingDue,
        dueDate: bill.dueDate,
        status: bill.status,
        daysLeft,
        isOpeningBalance: bill.isOpeningBalance,
        orders: bill.orders.map(order => ({
          _id: order._id,
          invoiceNumber: order.invoiceNumber,
          orderDate: order.orderDate,
          status: order.status,
          payment: order.payment,
          totalAmount: order.orderItems?.reduce((sum, item) => 
            sum + (item.totalAmount || item.price * item.orderedQuantity), 0) || 0,
          items: order.orderItems?.map(item => ({
            product: item.product?.productName || "Unknown",
            unit: item.product?.unit || "",
            orderedQuantity: item.orderedQuantity,
            deliveredQuantity: item.deliveredQuantity,
            price: item.price,
            totalAmount: item.totalAmount
          })) || []
        }))
      };
    });

    res.json({
      customer: {
        _id: customer._id,
        name: customer.name,
        email: customer.email,
        phoneNumber: customer.phoneNumber,
        address: customer.address,
        pincode: customer.pincode,
        creditLimit: customer.creditLimit,
        balanceCreditLimit: customer.balanceCreditLimit,
        usedCredit: customer.creditLimit - customer.balanceCreditLimit,
        billingType: customer.billingType,
        statementType: customer.statementType,
        dueDays: customer.dueDays,
        openingBalance: customer.openingBalance,
        salesman: customer.salesman
      },
      summary: {
        totalOutstanding,
        totalBills,
        overdueBills,
        availableCredit: customer.balanceCreditLimit
      },
      bills: formattedBills
    });

  } catch (error) {
    console.error("Error fetching customer outstanding details:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getCustomerReceipts = async (req, res) => {
  try {
    if (req.user.role !== "Sales man") {
      return res.status(403).json({ message: "Only salesmen can access this" });
    }

    // Get all customers assigned to this salesman
    const myCustomers = await Customer.find({ salesman: req.user._id })
      .select("_id name email phoneNumber");
    
    const customerIds = myCustomers.map(c => c._id);
    
    if (customerIds.length === 0) {
      return res.json([]);
    }

    // Fetch PAID bills for these customers
    const paidBills = await Bill.find({
      customer: { $in: customerIds },
      status: "paid"
    })
    .populate("customer", "name email phoneNumber")
    .populate("orders", "invoiceNumber orderDate totalAmount")
    .sort({ updatedAt: -1 });

    // Format receipts with summary
    const receipts = paidBills.map(bill => {
      const paidDate = bill.updatedAt || bill.createdAt;
      const totalPaid = bill.paidAmount || bill.amountDue;
      
      return {
        _id: bill._id,
        billId: bill._id,
        invoiceNumber: bill.invoiceNumber || `BILL-${bill._id.toString().slice(-8)}`,
        customer: bill.customer,
        cycleStart: bill.cycleStart,
        cycleEnd: bill.cycleEnd,
        totalUsed: bill.totalUsed,
        amountDue: bill.amountDue,
        paidAmount: bill.paidAmount,
        paidDate,
        dueDate: bill.dueDate,
        status: bill.status,
        isOpeningBalance: bill.isOpeningBalance,
        orderCount: bill.orders?.length || 0,
        orders: bill.orders?.map(order => ({
          _id: order._id,
          invoiceNumber: order.invoiceNumber,
          orderDate: order.orderDate,
          totalAmount: order.totalAmount
        })) || []
      };
    });

    res.json(receipts);
  } catch (error) {
    console.error("Error fetching customer receipts:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  createCustomer,
  getAllCustomers,
  getCustomerById,
  getSalesmanCustomers,
  updateCustomer,
  deleteCustomer,
  getMyCustomerProfile,
  createCustomerProfile,
  createCustomerRequest,
  getMyCustomerRequests,
  getPendingCustomerRequests,
  acceptCustomerRequest,
  rejectCustomerRequest,
  getAllCustomersWithDue,
  getMyCustomers,
  getMyCustomersWithDue,
  getCustomerOutstandingDetails,
  getCustomerReceipts
};