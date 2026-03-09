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
    const { customerId, cycleStart, cycleEnd } = req.body;

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    const orders = await Order.find({
      customer: customerId,
      payment: "credit",
      orderDate: { $gte: new Date(cycleStart), $lte: new Date(cycleEnd) },
      bill: { $exists: false },
    });

    if (orders.length === 0) {
      return res.status(400).json({ message: "No credit orders in this cycle" });
    }

    // ✅ FIXED: Use totalAmount (includes VAT) instead of recalculating
    const totalUsed = orders.reduce((sum, order) => {
      const orderTotal = order.orderItems.reduce((itemSum, item) => {
        // Use stored totalAmount which includes VAT
        return itemSum + (item.totalAmount || item.price * item.orderedQuantity);
      }, 0);
      return sum + orderTotal;
    }, 0);

    let dueDate;
    const cycleEndDate = moment(cycleEnd);
    if (customer.billingType === "creditcard") {
      dueDate = cycleEndDate.add(30, "days").toDate();
    } else {
      dueDate = cycleEndDate.add(1, "days").toDate();
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

    res.status(201).json(bill);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getAllBills = async (req, res) => {
  try {
    const bills = await Bill.find()
      .populate("customer", "name email balanceCreditLimit")
      .sort({ cycleEnd: -1 });
    res.json(bills);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const getBillById = async (req, res) => {
  try {
    let query = Bill.findById(req.params.id)
      .populate("customer", "name email phoneNumber address pincode balanceCreditLimit billingType salesman");

    query = query.populate({
      path: "orders",
      populate: [
        { path: "orderItems.product", select: "productName price unit vatPercentage exclVatAmount vatAmount totalAmount" },
        { path: "assignedTo", select: "username email role" },
        {
          path: "invoiceHistory",
          populate: [
            {
              path: "items.product",
              select: "productName unit price vatPercentage exclVatAmount vatAmount totalAmount"
            }
          ]
        }
      ]
    });

    if (req.query.populate) {
      const paths = req.query.populate.split(",");
      const additionalPopulates = [];
      paths.forEach(path => {
        if (!path.includes("orders.")) {
          if (path.includes(".")) {
            const [mainPath, subPath] = path.split(".");
            additionalPopulates.push({ path: mainPath, populate: { path: subPath } });
          } else {
            additionalPopulates.push(path);
          }
        } else if (path.startsWith("orders.invoiceHistory.items.product")) {
          additionalPopulates.push({
            path: "orders",
            populate: {
              path: "invoiceHistory",
              populate: {
                path: "items.product",
                select: "productName unit price vatPercentage exclVatAmount vatAmount totalAmount"
              }
            }
          });
        }
      });
      additionalPopulates.forEach(populatePath => {
        if (typeof populatePath === "string") {
          query = query.populate(populatePath);
        } else {
          query = query.populate(populatePath);
        }
      });
    }

    const bill = await query.lean();
    if (!bill) {
      return res.status(404).json({ message: "Bill not found" });
    }

    if (req.user.role === "Customer") {
      const customer = await Customer.findOne({ user: req.user._id });
      if (!customer || String(customer._id) !== String(bill.customer._id)) {
        return res.status(403).json({ message: "Not authorized to view this bill" });
      }
    }

    if (bill.status === "pending" && new Date() > bill.dueDate) {
      bill.status = "overdue";
      await Bill.findByIdAndUpdate(req.params.id, { status: "overdue" });
    }

    const enrichedBill = await Bill.findById(req.params.id)
      .populate({
        path: "orders.invoiceHistory.items.product",
        select: "productName unit price vatPercentage exclVatAmount vatAmount totalAmount"
      })
      .lean();

    const formattedBills = [{
      _id: bill._id,
      invoiceNumber: bill.invoiceNumber || `BILL-${bill._id.toString().slice(-8)}`,
      cycleStart: bill.cycleStart,
      cycleEnd: bill.cycleEnd,
      totalUsed: bill.totalUsed,
      amountDue: bill.amountDue,
      paidAmount: bill.paidAmount,
      remainingDue: Math.max(0, bill.amountDue - bill.paidAmount),
      dueDate: bill.dueDate,
      status: bill.status,
      daysLeft: Math.ceil((new Date(bill.dueDate) - new Date()) / (1000 * 60 * 60 * 24)),
      isOpeningBalance: bill.isOpeningBalance,
      // ✅ VAT Breakdown for the bill
      totalExclVat: bill.totalExclVat || 0,
      totalVatAmount: bill.totalVatAmount || 0,
      grandTotal: bill.grandTotal || bill.amountDue,
      orders: bill.orders.map((order) => {
        const matchingHistory = order.invoiceHistory?.find(
          (h) => h.invoiceNumber === bill.invoiceNumber
        ) || { items: [], amount: 0 };

        // ✅ Calculate VAT breakdown for this order's contribution to the bill
        let orderExclVat = 0;
        let orderVatAmount = 0;
        let orderGrandTotal = 0;

        const items = matchingHistory.items?.map((histItem) => {
          const productName = histItem.product?.productName || "Unknown Product";
          const unit = histItem.product?.unit || order.orderItems?.find(oi => String(oi.product) === String(histItem.product))?.unit || "kg";
          const vatPercent = histItem.product?.vatPercentage || 5;
          
          // ✅ Use stored VAT fields if available, otherwise calculate
          const exclVat = histItem.exclVatAmount !== undefined 
            ? histItem.exclVatAmount 
            : (histItem.quantity || 0) * (histItem.price || 0);
          const vatAmount = histItem.vatAmount !== undefined 
            ? histItem.vatAmount 
            : (exclVat * vatPercent) / 100;
          const total = histItem.totalAmount !== undefined 
            ? histItem.totalAmount 
            : exclVat + vatAmount;

          orderExclVat += exclVat;
          orderVatAmount += vatAmount;
          orderGrandTotal += total;

          return {
            product: productName,
            unit,
            quantity: histItem.quantity || 0,
            price: histItem.price || 0,
            vatPercentage: vatPercent,
            exclVat: exclVat,
            vatAmount: vatAmount,
            total: total,
          };
        }).filter(item => item.quantity > 0) || [];

        return {
          _id: order._id,
          invoiceNumber: bill.invoiceNumber,
          orderDate: order.orderDate,
          status: order.status,
          payment: order.payment,
          totalAmount: matchingHistory.amount || order.grandTotal || 0,
          // ✅ Include VAT breakdown per order
          totalExclVat: orderExclVat,
          totalVatAmount: orderVatAmount,
          grandTotal: orderGrandTotal,
          items,
        };
      }).filter(order => order.items.length > 0),
    }];

    res.json({
      ...bill,
      formattedBills,
      enrichedBill
    });
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

    const bills = await Bill.find({ customer: customer._id })
      .sort({ cycleEnd: -1 })
      .populate("orders", "product orderedQuantity totalAmount orderDate status vatPercentage exclVatAmount vatAmount");
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
      customer: customer._id
    })
      .populate("customer", "name email phoneNumber address pincode balanceCreditLimit billingType")
      .populate("orders", "product orderedQuantity totalAmount orderDate status vatPercentage exclVatAmount vatAmount");

    if (!bill) {
      return res.status(404).json({ message: "Bill not found or not yours" });
    }

    if (bill.status === "pending" && new Date() > bill.dueDate) {
      bill.status = "overdue";
      await bill.save();
    }

    res.json(bill);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ FIXED: createInvoiceBasedBill - Properly handles VAT-inclusive amounts
const createInvoiceBasedBill = async (order, specificAmount = null, specificInvoiceNumber = null) => {
  try {
    const customer = await Customer.findById(order.customer);
    if (!customer || customer.statementType !== "invoice-based") {
      return null;
    }

    // ✅ FIXED: Calculate totalUsed with VAT-inclusive amounts
    let totalUsed = 0;
    let totalExclVat = 0;
    let totalVatAmount = 0;

    if (specificAmount !== null) {
      // When specificAmount is provided (partial delivery), we need to calculate VAT proportionally
      // Find the items that were delivered and calculate their VAT breakdown
      for (const item of order.orderItems) {
        const deliveredQty = item.deliveredQuantity || 0;
        if (deliveredQty > 0 && item.orderedQuantity > 0) {
          // Calculate proportional amounts based on delivered quantity
          const ratio = deliveredQty / item.orderedQuantity;
          const itemExclVat = (item.exclVatAmount || 0) * ratio;
          const itemVatAmount = (item.vatAmount || 0) * ratio;
          const itemTotal = (item.totalAmount || 0) * ratio;
          
          totalExclVat += itemExclVat;
          totalVatAmount += itemVatAmount;
          totalUsed += itemTotal;
        }
      }
    } else {
      // Full order - use stored VAT fields directly
      for (const item of order.orderItems) {
        const deliveredQty = item.deliveredQuantity || item.orderedQuantity || 0;
        if (deliveredQty > 0 && item.orderedQuantity > 0) {
          const ratio = deliveredQty / item.orderedQuantity;
          totalExclVat += (item.exclVatAmount || 0) * ratio;
          totalVatAmount += (item.vatAmount || 0) * ratio;
          totalUsed += (item.totalAmount || 0) * ratio;
        }
      }
    }

    if (totalUsed <= 0) {
      console.log(`Order ${order._id} has no delivered value → no bill created`);
      return null;
    }

    const deliveryDate = order.deliveredAt || new Date();
    const dueDate = new Date(deliveryDate);
    if (customer.dueDays) {
      dueDate.setDate(dueDate.getDate() + customer.dueDays);
    }

    // ✅ Create bill with VAT breakdown fields
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
      invoiceNumber: specificInvoiceNumber || order.invoiceNumber || `BILL-${order._id.toString().slice(-8)}`,
      isOpeningBalance: false,
      // ✅ Store VAT breakdown for reporting
      totalExclVat: parseFloat(totalExclVat.toFixed(2)),
      totalVatAmount: parseFloat(totalVatAmount.toFixed(2)),
      grandTotal: parseFloat(totalUsed.toFixed(2)),
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
      .populate("orders", "invoiceNumber totalAmount totalExclVat totalVatAmount grandTotal")
      .sort({ dueDate: 1 });
    res.json(bills);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const markBillReceived = async (req, res) => {
  try {
    const { billId, amount, method, chequeDetails, batchId } = req.body;
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
    
    if (batchId) {
      bill.batchReceiptNumber = batchId;
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
      batchReceiptNumber: batchId || null,
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
    
    // Receipt & Date
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
    
    // Bill Summary - ✅ FIXED: Show Grand Total (Incl. VAT)
    doc.fontSize(14).font("Helvetica-Bold").text("Bill Summary:");
    doc.moveDown(0.5);
    
    const summaryStartY = doc.y;
    const labelX = margin + 20;
    const valueX = margin + 220;
    
    doc.fontSize(12).font("Helvetica-Bold").text("Invoice Number:", labelX, summaryStartY);
    doc.font("Helvetica").text(bill.invoiceNumber || "N/A", valueX, summaryStartY);
    doc.moveDown(0.8);
    
    // ✅ Show VAT breakdown if available
    if (bill.totalExclVat !== undefined && bill.totalVatAmount !== undefined) {
      doc.font("Helvetica-Bold").text("Total (Excl. VAT):", labelX, doc.y);
      doc.font("Helvetica").text(`AED ${bill.totalExclVat?.toFixed(2) || "0.00"}`, valueX, doc.y);
      doc.moveDown(0.8);
      
      doc.font("Helvetica-Bold").text(`VAT ${bill.orders?.[0]?.orderItems?.[0]?.vatPercentage || 5}%:`, labelX, doc.y);
      doc.font("Helvetica").text(`AED ${bill.totalVatAmount?.toFixed(2) || "0.00"}`, valueX, doc.y);
      doc.moveDown(0.8);
    }
    
    doc.font("Helvetica-Bold").text("Grand Total (Incl. VAT):", labelX, doc.y);
    const grandTotal = bill.grandTotal || bill.amountDue;
    doc.font("Helvetica").fillColor("#16a34a").text(`AED ${grandTotal?.toFixed(2) || "0.00"}`, valueX, doc.y);
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
      .populate("orders", "invoiceNumber totalAmount totalExclVat totalVatAmount grandTotal");

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
    
    // ✅ Show VAT breakdown in invoice
    const rows = [
      ["Cycle Start", new Date(bill.cycleStart).toLocaleDateString()],
      ["Cycle End", new Date(bill.cycleEnd).toLocaleDateString()],
    ];
    
    // Add VAT breakdown if available
    if (bill.totalExclVat !== undefined) {
      rows.push(["Total (Excl. VAT)", `AED ${bill.totalExclVat.toFixed(2)}`]);
    }
    if (bill.totalVatAmount !== undefined) {
      rows.push([`VAT ${bill.orders?.[0]?.orderItems?.[0]?.vatPercentage || 5}%`, `AED ${bill.totalVatAmount.toFixed(2)}`]);
    }
    
    rows.push(
      ["Grand Total (Incl. VAT)", `AED ${(bill.grandTotal || bill.amountDue).toFixed(2)}`],
      ["Paid Amount", `AED ${bill.paidAmount?.toFixed(2) || "0.00"}`],
      ["Amount Due", `AED ${bill.amountDue?.toFixed(2) || "0.00"}`],
      ["Due Date", new Date(bill.dueDate).toLocaleDateString()],
      ["Status", bill.status.toUpperCase()]
    );

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