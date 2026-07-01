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

    const billIds = bills.map((bill) => bill._id);
    const latestTransactions = await BillTransaction.find({ bill: { $in: billIds } })
      .sort({ createdAt: -1 })
      .select("bill _id");

    const latestTransactionByBill = latestTransactions.reduce((acc, tx) => {
      const billId = String(tx.bill);
      if (!acc[billId]) {
        acc[billId] = tx._id;
      }
      return acc;
    }, {});

    const billsWithTransactionId = bills.map((bill) => {
      const billObj = bill.toObject();
      billObj.receiptTransactionId = latestTransactionByBill[billObj._id.toString()] || null;
      return billObj;
    });

    res.json(billsWithTransactionId);
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

// ✅ FIXED: createInvoiceBasedBill - Properly handles VAT-inclusive amounts and credit limit used
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

    // First, calculate the total delivered amount based on deliveredQuantity
    let totalDelivered = 0;
    for (const item of order.orderItems) {
      const deliveredQty = item.deliveredQuantity || 0;
      if (deliveredQty > 0 && item.orderedQuantity > 0) {
        const ratio = deliveredQty / item.orderedQuantity;
        totalDelivered += (item.totalAmount || 0) * ratio;
      }
    }

    if (specificAmount !== null) {
      // When specificAmount is provided (e.g., only credit limit used portion for billing),
      // use that as the total, but calculate VAT proportionally
      totalUsed = specificAmount;
      
      // Calculate the scaling ratio to apply to VAT
      const scalingRatio = totalDelivered > 0 ? specificAmount / totalDelivered : 0;
      
      // Calculate VAT breakdown proportional to the delivered items
      for (const item of order.orderItems) {
        const deliveredQty = item.deliveredQuantity || 0;
        if (deliveredQty > 0 && item.orderedQuantity > 0) {
          const ratio = deliveredQty / item.orderedQuantity;
          const itemExclVat = (item.exclVatAmount || 0) * ratio * scalingRatio;
          const itemVatAmount = (item.vatAmount || 0) * ratio * scalingRatio;
          
          totalExclVat += itemExclVat;
          totalVatAmount += itemVatAmount;
        }
      }
    } else {
      // Full order - use delivered amounts directly
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
      console.log(`Order ${order._id} has no billing value → no bill created`);
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
      totalUsed: parseFloat(totalUsed.toFixed(2)),
      amountDue: parseFloat(totalUsed.toFixed(2)),
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

    console.log(`✅ New Invoice-based bill created for order ${order._id}: ${bill._id} (Inv: ${bill.invoiceNumber}) - Amount: AED ${totalUsed.toFixed(2)}`);
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
    // Allow: delivery, deliveryman, delivery man, sales, salesman, sales man (case-insensitive, partial match)
    const role = req.user && req.user.role ? String(req.user.role).toLowerCase() : "";
    const allowedRoles = ["delivery", "deliveryman", "delivery man", "sales", "salesman", "sales man"];
    if (!req.user || !allowedRoles.some(r => role.includes(r))) {
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
    
    const transaction = await BillTransaction.create({
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
      transactionId: transaction._id,
      paidAmount: actualPayment,
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
    
    const { transactionId } = req.query;
    let receiptTransaction = null;
    if (transactionId) {
      receiptTransaction = await BillTransaction.findById(transactionId)
        .populate("customer", "name phoneNumber address")
        .populate("recipient", "username")
        .populate("order", "invoiceNumber");
    }

    if (!receiptTransaction) {
      receiptTransaction = await BillTransaction.findOne({ bill: bill._id })
        .sort({ createdAt: -1 })
        .populate("customer", "name phoneNumber address")
        .populate("recipient", "username")
        .populate("order", "invoiceNumber");
    }

    const receiptAmount = receiptTransaction?.amount ?? bill.paidAmount ?? 0;
    const receiptMethod = receiptTransaction?.method || "cash";
    const receiptCustomer = receiptTransaction?.customer || bill.customer;
    const displayReceiptNo = receiptTransaction
      ? `REC-${receiptTransaction._id.toString().slice(-6)}`
      : bill.batchReceiptNumber || `REC-${bill.invoiceNumber || "N/A"}`;
    const totalPaid = receiptTransaction
      ? await BillTransaction.find({
          bill: bill._id,
          createdAt: { $lte: receiptTransaction.createdAt },
        }).then((txs) => txs.reduce((sum, tx) => sum + (tx.amount || 0), 0))
      : bill.paidAmount || 0;
    
    // Calculate total due for this customer across all bills
    const allBills = await Bill.find({ customer: bill.customer._id || receiptCustomer._id });
    const totalDue = allBills.reduce((sum, b) => {
      const remaining = Math.max(0, (b.grandTotal || b.amountDue || 0) - (b.paidAmount || 0));
      return sum + remaining;
    }, 0);
    const filename = `receipt-${displayReceiptNo}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    
    const company = await CompanySettings.findOne() || { companyName: "Company" };

    // 80mm thermal paper: ~226pt wide
    const pageWidth = 226;
    const margin = 10;
    const contentWidth = pageWidth - margin * 2;
    const centerX = margin;

    const doc = new PDFDocument({
      size: [pageWidth, 800],
      margin: margin,
      bufferPages: true,
    });
    doc.pipe(res);

    let y = margin;

    // Helper: dashed separator line
    const drawDashedLine = (yPos) => {
      doc.save();
      doc.strokeColor("#000").lineWidth(0.5);
      const dashLen = 3;
      const gap = 2;
      for (let x = margin; x < pageWidth - margin; x += dashLen + gap) {
        doc.moveTo(x, yPos).lineTo(Math.min(x + dashLen, pageWidth - margin), yPos).stroke();
      }
      doc.restore();
      return yPos + 6;
    };

    // ===== COMPANY HEADER =====
    doc.fontSize(10).font("Helvetica-Bold").fillColor("#000")
      .text((company.companyName || "COMPANY").toUpperCase(), centerX, y, { width: contentWidth, align: "center" });
    y += 14;

    if (company.companyAddress) {
      doc.fontSize(6).font("Helvetica")
        .text(company.companyAddress, centerX, y, { width: contentWidth, align: "center" });
      y += 9;
    }
    if (company.companyPhone) {
      doc.fontSize(6).font("Helvetica")
        .text(`Tel: ${company.companyPhone}`, centerX, y, { width: contentWidth, align: "center" });
      y += 9;
    }

    y = drawDashedLine(y + 2);

    // ===== TITLE =====
    doc.fontSize(9).font("Helvetica-Bold")
      .text("PAYMENT RECEIPT", centerX, y, { width: contentWidth, align: "center" });
    y += 14;

    y = drawDashedLine(y);

    // ===== RECEIPT INFO =====
    const labelW = 75;
    const valueW = contentWidth - labelW;

    const printRow = (label, value) => {
      doc.fontSize(7).font("Helvetica-Bold").text(label, centerX, y, { width: labelW });
      doc.fontSize(7).font("Helvetica").text(value, centerX + labelW, y, { width: valueW, align: "right" });
      y += 11;
    };

    printRow("Receipt No:", displayReceiptNo);
    printRow("Invoice No:", bill.invoiceNumber || receiptTransaction?.order?.invoiceNumber || "N/A");
    printRow("Date:", new Date(receiptTransaction?.createdAt || bill.updatedAt || bill.createdAt || Date.now()).toLocaleDateString("en-IN"));

    y = drawDashedLine(y + 2);

    // ===== CUSTOMER INFO =====
    doc.fontSize(7).font("Helvetica-Bold").text("CUSTOMER:", centerX, y);
    y += 11;
    doc.fontSize(7).font("Helvetica").text(receiptCustomer?.name || bill.customer?.name || "N/A", centerX, y);
    y += 10;
    if (receiptCustomer?.phoneNumber || bill.customer?.phoneNumber) {
      doc.text(receiptCustomer?.phoneNumber || bill.customer?.phoneNumber, centerX, y);
      y += 10;
    }
    if (receiptCustomer?.address || bill.customer?.address) {
      doc.text(receiptCustomer?.address || bill.customer?.address, centerX, y, { width: contentWidth });
      y += 10;
    }

    y = drawDashedLine(y + 2);

    printRow("Amount Paid:", `AED ${receiptAmount.toFixed(2)}`);
    y = drawDashedLine(y + 2);
    printRow("Method:", receiptMethod.charAt(0).toUpperCase() + receiptMethod.slice(1));

    if (receiptTransaction?.method === "cheque" && receiptTransaction.chequeDetails) {
      y = drawDashedLine(y + 2);
      doc.fontSize(7).font("Helvetica-Bold").text("CHEQUE DETAILS:", centerX, y);
      y += 11;
      printRow("Cheque No:", receiptTransaction.chequeDetails.number || "N/A");
      printRow("Bank:", receiptTransaction.chequeDetails.bank || "N/A");
      if (receiptTransaction.chequeDetails.date) {
        printRow("Cheque Date:", new Date(receiptTransaction.chequeDetails.date).toLocaleDateString("en-IN"));
      }
    }

    y = drawDashedLine(y + 2);
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#000")
      .text("BALANCE DUE", centerX, y, { width: labelW + 10 });
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#000")
      .text(`AED ${totalDue.toFixed(2)}`, centerX + labelW + 10, y, { width: valueW - 10, align: "right" });
    y += 14;

    y = drawDashedLine(y);
    y += 4;
    doc.fontSize(6).font("Helvetica")
      .text("Thank you for your payment!", centerX, y, { width: contentWidth, align: "center" });
    y += 9;
    doc.text("This is a computer-generated receipt.", centerX, y, { width: contentWidth, align: "center" });

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
// Download bill invoice — thermal printer receipt style (80mm width)
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

    const company = await CompanySettings.findOne() || { companyName: "Company" };
    const filename = `bill-invoice-${bill.invoiceNumber || bill._id.toString().slice(-8)}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    // 80mm thermal paper: ~226pt wide, variable height
    const pageWidth = 226;
    const margin = 10;
    const contentWidth = pageWidth - margin * 2;
    const centerX = margin;

    const doc = new PDFDocument({
      size: [pageWidth, 800],
      margin: margin,
      bufferPages: true,
    });
    doc.pipe(res);

    let y = margin;

    // Helper: dashed separator line
    const drawDashedLine = (yPos) => {
      doc.save();
      doc.strokeColor("#000").lineWidth(0.5);
      const dashLen = 3;
      const gap = 2;
      for (let x = margin; x < pageWidth - margin; x += dashLen + gap) {
        doc.moveTo(x, yPos).lineTo(Math.min(x + dashLen, pageWidth - margin), yPos).stroke();
      }
      doc.restore();
      return yPos + 6;
    };

    // ===== COMPANY HEADER =====
    doc.fontSize(10).font("Helvetica-Bold").fillColor("#000")
      .text((company.companyName || "COMPANY").toUpperCase(), centerX, y, { width: contentWidth, align: "center" });
    y += 14;

    if (company.companyAddress) {
      doc.fontSize(6).font("Helvetica")
        .text(company.companyAddress, centerX, y, { width: contentWidth, align: "center" });
      y += 9;
    }
    if (company.companyPhone) {
      doc.fontSize(6).font("Helvetica")
        .text(`Tel: ${company.companyPhone}`, centerX, y, { width: contentWidth, align: "center" });
      y += 9;
    }
    if (company.companyEmail) {
      doc.fontSize(6).font("Helvetica")
        .text(company.companyEmail, centerX, y, { width: contentWidth, align: "center" });
      y += 9;
    }

    y = drawDashedLine(y + 2);

    // ===== BILL INVOICE TITLE =====
    const isPaidReceipt = bill.status === "paid" && bill.paidAmount > 0;
    doc.fontSize(9).font("Helvetica-Bold")
      .text(isPaidReceipt ? "PAYMENT RECEIPT" : "BILL INVOICE", centerX, y, { width: contentWidth, align: "center" });
    y += 14;

    if (bill.isOpeningBalance) {
      doc.fontSize(7).font("Helvetica-Bold").fillColor("#000")
        .text("** OPENING BALANCE **", centerX, y, { width: contentWidth, align: "center" });
      y += 11;
    }

    y = drawDashedLine(y);

    // ===== INVOICE INFO =====
    const labelW = 75;
    const valueW = contentWidth - labelW;

    const printRow = (label, value) => {
      doc.fontSize(7).font("Helvetica-Bold").text(label, centerX, y, { width: labelW });
      doc.fontSize(7).font("Helvetica").text(value, centerX + labelW, y, { width: valueW, align: "right" });
      y += 11;
    };

    printRow("Invoice No:", bill.invoiceNumber || "N/A");
    printRow("Bill Date:", new Date(bill.createdAt).toLocaleDateString());
    printRow("Due Date:", new Date(bill.dueDate).toLocaleDateString());

    y = drawDashedLine(y + 2);

    // ===== CUSTOMER INFO =====
    doc.fontSize(7).font("Helvetica-Bold").text("BILL TO:", centerX, y);
    y += 11;
    doc.fontSize(7).font("Helvetica")
      .text(bill.customer?.name || "N/A", centerX, y);
    y += 10;
    if (bill.customer?.phoneNumber) {
      doc.text(bill.customer.phoneNumber, centerX, y);
      y += 10;
    }
    if (bill.customer?.address) {
      doc.text(bill.customer.address, centerX, y, { width: contentWidth });
      y += 10;
    }

    y = drawDashedLine(y + 2);

    if (!isPaidReceipt) {
      // Grand total - larger font for unpaid/partial bills
      doc.fontSize(9).font("Helvetica-Bold")
        .text("GRAND TOTAL", centerX, y, { width: labelW + 10 });
      doc.fontSize(9).font("Helvetica-Bold")
        .text(`AED ${(bill.grandTotal || bill.amountDue).toFixed(2)}`, centerX + labelW + 10, y, { width: valueW - 10, align: "right" });
      y += 14;
      y = drawDashedLine(y);
    }

    // Payment status rows
    printRow("Paid Amount:", `AED ${bill.paidAmount?.toFixed(2) || "0.00"}`);
    printRow("Amount Due:", `AED ${bill.amountDue?.toFixed(2) || "0.00"}`);
    printRow("Status:", bill.status.toUpperCase());

    y = drawDashedLine(y + 2);

    // ===== FOOTER =====
    y += 4;
    doc.fontSize(6).font("Helvetica").fillColor("#000")
      .text("Thank you for your business!", centerX, y, { width: contentWidth, align: "center" });
    y += 9;
    doc.text("This is a computer-generated invoice.", centerX, y, { width: contentWidth, align: "center" });
    y += 9;
    doc.text(new Date().toLocaleString(), centerX, y, { width: contentWidth, align: "center" });

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