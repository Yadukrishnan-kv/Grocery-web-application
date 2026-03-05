// controllers/billController.js
const Bill = require("../models/Bill");
const Order = require("../models/Order");
const Customer = require("../models/Customer");
const BillTransaction = require("../models/BillTransaction");
const CompanySettings = require("../models/CompanySettings");
const PDFDocument = require("pdfkit");
const moment = require("moment"); 

const generateBill = async (req, res) => {
  try {
    const { customerId, cycleStart, cycleEnd } = req.body; // Or automate via cron

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // Find credit orders in this cycle that are not yet billed
    const orders = await Order.find({
      customer: customerId,
      payment: "credit",
      orderDate: { $gte: new Date(cycleStart), $lte: new Date(cycleEnd) },
      bill: { $exists: false }, // Assume add 'bill' field to Order model if needed
    });

    if (orders.length === 0) {
      return res.status(400).json({ message: "No credit orders in this cycle" });
    }

    const totalUsed = orders.reduce((sum, order) => sum + order.totalAmount, 0);

    // Calculate due date based on billingType
    let dueDate;
    const cycleEndDate = moment(cycleEnd);
    if (customer.billingType === "creditcard") {
      dueDate = cycleEndDate.add(30, "days").toDate(); // 30 days grace
    } else {
      dueDate = cycleEndDate.add(1, "days").toDate(); // Immediate: next day
    }

    const bill = await Bill.create({
      customer: customerId,
      cycleStart: new Date(cycleStart),
      cycleEnd: new Date(cycleEnd),
      totalUsed,
      amountDue: totalUsed,
      dueDate,
      orders: orders.map((o) => o._id),
    });

    // Optional: Mark orders as billed (add to Order model: bill: Schema.Types.ObjectId, ref: "Bill")
    // await Order.updateMany({ _id: { $in: orders.map(o => o._id) } }, { bill: bill._id });

    res.status(201).json(bill);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getAllBills = async (req, res) => {
  try {
    const bills = await Bill.find().populate("customer", "name email balanceCreditLimit").sort({ cycleEnd: -1 });
    res.json(bills);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const getBillById = async (req, res) => {
  try {
    let query = Bill.findById(req.params.id)
      .populate("customer", "name email phoneNumber address pincode balanceCreditLimit billingType salesman");
    
    // ✅ Always populate orders with orderItems and product for receipt details
    query = query.populate({
      path: "orders",
      populate: [
        { path: "orderItems.product", select: "productName price unit" },
        { path: "assignedTo", select: "username email role" }
      ]
    });

    // Support additional dynamic populate from query param
    if (req.query.populate) {
      const paths = req.query.populate.split(",");
      paths.forEach(path => {
        if (!path.includes("orders.")) { // Avoid duplicating orders population
          if (path.includes(".")) {
            const [mainPath, subPath] = path.split(".");
            query = query.populate({
              path: mainPath,
              populate: { path: subPath }
            });
          } else {
            query = query.populate(path);
          }
        }
      });
    }

    const bill = await query;
    if (!bill) {
      return res.status(404).json({ message: "Bill not found" });
    }

    // Authorization check for customers
    if (req.user.role === "Customer") {
      const customer = await Customer.findOne({ user: req.user._id });
      if (!customer || String(customer._id) !== String(bill.customer._id)) {
        return res.status(403).json({ message: "Not authorized to view this bill" });
      }
    }

    // Mark overdue if needed
    if (bill.status === "pending" && new Date() > bill.dueDate) {
      bill.status = "overdue";
      await bill.save();
    }

    res.json(bill);
  } catch (error) {
    console.error("getBillById error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getCustomerBills = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "Customer") {
      return res.status(403).json({ message: "Access denied" });
    }

    const customer = await Customer.findOne({ user: req.user._id });
    if (!customer) {
      return res.status(404).json({ message: "Customer profile not found" });
    }

    const bills = await Bill.find({ customer: customer._id }).sort({ cycleEnd: -1 }).populate("orders", "product orderedQuantity totalAmount orderDate status");
    res.json(bills);
  } catch (error) {
    console.error("getCustomerBills error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
const getCustomerBillById = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "Customer") {
      return res.status(403).json({ message: "Access denied" });
    }

    const customer = await Customer.findOne({ user: req.user._id });
    if (!customer) {
      return res.status(404).json({ message: "Customer profile not found" });
    }

    const bill = await Bill.findOne({
      _id: req.params.id,
      customer: customer._id  // ← must match customer, not user
    })
      .populate("customer", "name email phoneNumber address pincode balanceCreditLimit billingType")
      .populate("orders", "product orderedQuantity totalAmount orderDate status");

    if (!bill) {
      return res.status(404).json({ message: "Bill not found or not yours" });
    }

    // Check overdue
    if (bill.status === "pending" && new Date() > bill.dueDate) {
      bill.status = "overdue";
      await bill.save();
    }

    res.json(bill);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// billController.js (or wherever createInvoiceBasedBill is defined)
const createInvoiceBasedBill = async (order, specificAmount = null, specificInvoiceNumber = null) => {
  try {
    const customer = await Customer.findById(order.customer);
    if (!customer || customer.statementType !== "invoice-based") {
      return null;
    }

    // ✅ Use specific amount if provided (for partial delivery)
    const totalUsed =
      specificAmount !== null
        ? specificAmount
        : order.orderItems.reduce((sum, item) => {
            const deliveredQty = item.deliveredQuantity || item.orderedQuantity || 0;
            return sum + deliveredQty * item.price;
          }, 0);

    if (totalUsed <= 0) {
      console.log(`Order ${order._id} has no delivered value → no bill created`);
      return null;
    }

    const deliveryDate = order.deliveredAt || new Date();
    const dueDate = new Date(deliveryDate);
    if (customer.dueDays) {
      dueDate.setDate(dueDate.getDate() + customer.dueDays);
    }

    // ✅ ALWAYS CREATE NEW BILL - DO NOT SEARCH FOR EXISTING
    // This ensures DEL-01 and DEL-02 remain separate immutable records
    const bill = await Bill.create({
      customer: order.customer,
      cycleStart: deliveryDate,
      cycleEnd: deliveryDate,
      totalUsed,
      amountDue: totalUsed,
      dueDate,
      paidAmount: 0,
      status: "pending",
      orders: [order._id],
      // ✅ Use provided invoice number (DEL-XX from pack event)
      invoiceNumber: specificInvoiceNumber || order.invoiceNumber || `BILL-${order._id.toString().slice(-8)}`,
      isOpeningBalance: false,
    });

    console.log(`✅ New Invoice-based bill created for order ${order._id}: ${bill._id} (Inv: ${bill.invoiceNumber})`);
    return bill;
  } catch (error) {
    console.error("Error creating invoice-based bill:", error);
    return null;
  }
};
const getAllPendingBills = async (req, res) => {
  try {
    const bills = await Bill.find({ status: { $in: ["pending", "overdue", "partial"] } })
      .populate("customer", "name")
      .populate("orders", "invoiceNumber")
      .sort({ dueDate: 1 });
    res.json(bills);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const markBillReceived = async (req, res) => {
  try {
    const { billId, amount, method, chequeDetails, batchId } = req.body; // ✅ Added batchId
    if (!req.user || !["Delivery Man", "Sales Man"].includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied" });
    }
    const bill = await Bill.findById(billId).populate("customer").populate("orders");
    if (!bill) return res.status(404).json({ message: "Bill not found" });
    const actualPayment = Math.min(amount, bill.amountDue);
    if (actualPayment <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }
    const firstOrderId = bill.orders && bill.orders.length > 0 ? bill.orders[0]._id : null;
    bill.paidAmount += actualPayment;
    bill.amountDue -= actualPayment;
    if (bill.amountDue < 0) bill.amountDue = 0;
    bill.status = bill.amountDue <= 0 ? "paid" : "partial";
    
    // ✅ NEW: Assign batch receipt number if provided (bulk operation)
    if (batchId) {
      bill.batchReceiptNumber = batchId; // e.g. REC-BATCH-20250305-7842
    }
    
    await bill.save();
    await BillTransaction.create({
      bill: bill._id,
      customer: bill.customer._id,
      recipient: req.user._id,
      recipientType: req.user.role === "Delivery Man" ? "delivery" : "sales",
      amount: actualPayment,
      method,
      chequeDetails: method === "cheque" ? chequeDetails : undefined,
      status: "received",
      order: firstOrderId,
      invoiceNumber: bill.invoiceNumber,
      batchReceiptNumber: batchId || null, // ✅ Store in transaction too if needed
    });
    const customer = bill.customer;
    if (customer && customer.billingType === "Credit limit") {
      customer.balanceCreditLimit += actualPayment;
      await customer.save();
    }
    res.json({
      message: "Payment received – bill updated & credit restored",
      newStatus: bill.status,
      remainingDue: bill.amountDue,
      batchReceiptNumber: bill.batchReceiptNumber,
    });
  } catch (error) {
    console.error("Mark received error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const getBillReceipt = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Not authorized, no token provided" });
    }
    const bill = await Bill.findById(req.params.id).populate("customer", "name email phoneNumber address pincode");
    if (!bill) {
      return res.status(404).json({ message: "Bill not found" });
    }
    // ✅ Use batchReceiptNumber if available, else fall back to invoice-based
    const displayReceiptNo = bill.batchReceiptNumber || `REC-${bill.invoiceNumber || "N/A"}`;
    const filename = `receipt-${displayReceiptNo}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    doc.pipe(res);
    const pageWidth = doc.page.width;
    const margin = 50;
    // Title
    doc.fontSize(24).font("Helvetica-Bold").fillColor("#1e293b").text("PAYMENT RECEIPT", { align: "center" });
    doc.moveDown(0.5);
    // Receipt & Date - ✅ Use batch if available
    doc
      .fontSize(12)
      .font("Helvetica")
      .text(`Receipt No: ${displayReceiptNo}`, { align: "center" })
      .text(`Date: ${new Date(bill.updatedAt || bill.createdAt || Date.now()).toLocaleDateString()}`, { align: "center" });
    doc.moveDown(1.5);
    // Customer Details
    doc.fontSize(14).font("Helvetica-Bold").text("Customer Details:");
    doc
      .fontSize(12)
      .font("Helvetica")
      .text(`Name: ${bill.customer?.name || "N/A"}`)
      .text(`Phone: ${bill.customer?.phoneNumber || "N/A"}`)
      .text(`Address: ${bill.customer?.address || "N/A"}`)
      .text(`Pincode: ${bill.customer?.pincode || "N/A"}`);
    doc.moveDown(1.5);
    // Bill Summary
    doc.fontSize(14).font("Helvetica-Bold").text("Bill Summary:");
    doc.moveDown(0.5);
    const summaryStartY = doc.y;
    const labelX = margin + 20;
    const valueX = margin + 220;
    doc.fontSize(12).font("Helvetica-Bold").text("Invoice Number:", labelX, summaryStartY);
    doc.font("Helvetica").text(bill.invoiceNumber || "N/A", valueX, summaryStartY); // ✅ Keep individual invoice here
    doc.moveDown(0.8);
    doc.font("Helvetica-Bold").text("Total Amount of Bill:", labelX, doc.y);
    doc.font("Helvetica").text(`AED ${bill.totalUsed?.toFixed(2) || "0.00"}`, valueX, doc.y);
    doc.moveDown(0.8);
    doc.font("Helvetica-Bold").text("Paid Amount:", labelX, doc.y);
    doc.font("Helvetica").text(`AED ${bill.paidAmount?.toFixed(2) || "0.00"}`, valueX, doc.y);
    doc.moveDown(0.8);
    doc.font("Helvetica-Bold").text("Remaining Due:", labelX, doc.y);
    const remaining = bill.amountDue?.toFixed(2) || "0.00";
    doc.font("Helvetica").fillColor(remaining === "0.00" ? "#16a34a" : "#dc2626").text(`AED ${remaining}`, valueX, doc.y);
    doc.moveDown(2);
    // Footer
    doc
      .fontSize(10)
      .font("Helvetica-Oblique")
      .fillColor("#6b7280")
      .text("Thank you for your payment!", { align: "center" })
      .text("This is a computer-generated receipt.", { align: "center" });
    doc.end();
    console.log(`Receipt generated for bill ${bill._id} (Receipt: ${displayReceiptNo})`);
  } catch (error) {
    console.error("Receipt generation error:", error);
    if (!res.headersSent) {
      res.status(500).json({ message: "Failed to generate receipt", error: error.message });
    }
  }
};

// Download bill invoice (with invoice number)
const downloadBillInvoice = async (req, res) => {
  try {
    const { billId } = req.params;
    const bill = await Bill.findById(billId)
      .populate("customer", "name email phoneNumber address pincode")
      .populate("orders", "invoiceNumber");

    if (!bill) {
      return res.status(404).json({ message: "Bill not found" });
    }

    if (req.user && req.user.role === "Customer") {
      const customer = await Customer.findOne({ user: req.user._id });
      if (!customer || String(customer._id) !== String(bill.customer._id)) {
        return res.status(403).json({ message: "Not authorized to download this bill" });
      }
    }

    const company = await CompanySettings.findOne() || { companyName: "Ingoude Company" };
    const filename = `bill-invoice-${bill.invoiceNumber || bill._id.toString().slice(-8)}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ size: "A4", margin: 50 });
    doc.pipe(res);

    doc.fontSize(20).font("Helvetica-Bold").text(company.companyName.toUpperCase(), { align: "center" });
    doc.fontSize(14).moveDown(0.3).text("BILL INVOICE", { align: "center" });
    doc.moveDown(1);

    doc.fontSize(11).font("Helvetica-Bold").text("INVOICE DETAILS", { underline: true });
    doc.fontSize(10).font("Helvetica");
    doc.text(`Invoice Number: ${bill.invoiceNumber || "N/A"}`);
    if (bill.isOpeningBalance) {
      doc.fillColor("#ef4444").text("⚠️  OPENING BALANCE", { align: "right" }).fillColor("#000");
    }
    doc.text(`Bill ID: ${bill._id.toString().slice(-8)}`);
    doc.text(`Bill Date: ${new Date(bill.createdAt).toLocaleDateString()}`);
    doc.moveDown(0.5);

    doc.fontSize(11).font("Helvetica-Bold").text("BILL TO", { underline: true });
    doc.fontSize(10).font("Helvetica");
    doc.text(`Name: ${bill.customer.name}`);
    doc.text(`Email: ${bill.customer.email}`);
    doc.text(`Phone: ${bill.customer.phoneNumber}`);
    doc.text(`Address: ${bill.customer.address}, ${bill.customer.pincode}`);
    doc.moveDown(1);

    doc.fontSize(11).font("Helvetica-Bold").text("BILL DETAILS", { underline: true });
    doc.moveDown(0.5);

    const tableX = 50;
    const col1 = 150;
    const col2 = 100;
    const rows = [
      ["Cycle Start", new Date(bill.cycleStart).toLocaleDateString()],
      ["Cycle End", new Date(bill.cycleEnd).toLocaleDateString()],
      ["Total Used", `AED ${bill.totalUsed.toFixed(2)}`],
      ["Paid Amount", `AED ${bill.paidAmount.toFixed(2)}`],
      ["Amount Due", `AED ${bill.amountDue.toFixed(2)}`],
      ["Due Date", new Date(bill.dueDate).toLocaleDateString()],
      ["Status", bill.status.toUpperCase()],
    ];

    doc.fontSize(9).font("Helvetica");
    rows.forEach(([label, value]) => {
      doc.text(label, tableX, doc.y, { width: col1 });
      doc.text(value, tableX + col1, doc.y - doc.currentLineHeight(), { width: col2, align: "right" });
      doc.moveDown();
    });

    doc.moveDown(1);
    doc.fontSize(9).font("Helvetica").fillColor("#555");
    doc.text("Thank you for your business!", { align: "center" });
    doc.text("This is a system-generated invoice.", { align: "center" });
    doc.text(`Generated on: ${new Date().toLocaleString()}`, { align: "center" });

    doc.end();
  } catch (error) {
    console.error("Download bill invoice error:", error);
    if (!res.headersSent) {
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
};


module.exports = {
  generateBill,
  getAllBills,
  getBillById,
  getCustomerBills,
  getCustomerBillById,
  createInvoiceBasedBill,
  getAllPendingBills,
  markBillReceived,
  getBillReceipt,
  downloadBillInvoice
};