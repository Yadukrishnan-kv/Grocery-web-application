// models/Bill.js - Add VAT fields to the schema
const { Schema, model } = require("mongoose");

const billSchema = new Schema(
  {
    customer: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: [true, "Customer is required"],
    },
    cycleStart: { type: Date, required: true },
    cycleEnd: { type: Date, required: true },
    totalUsed: { type: Number, required: true, min: 0 },
    amountDue: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
    dueDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ["pending", "paid", "partial", "overdue"],
      default: "pending",
    },
    orders: [{ type: Schema.Types.ObjectId, ref: "Order" }],
    invoiceNumber: { type: String, index: true },
    batchReceiptNumber: { type: String },
    isOpeningBalance: { type: Boolean, default: false },
    
    // ✅ NEW: VAT Breakdown Fields
    totalExclVat: { type: Number, default: 0, min: 0 },
    totalVatAmount: { type: Number, default: 0, min: 0 },
    grandTotal: { type: Number, default: 0, min: 0 }, // Same as amountDue but explicitly VAT-inclusive
  },
  { timestamps: true }
);

// Virtual for remaining due
billSchema.virtual("remainingDue").get(function () {
  return Math.max(0, this.amountDue - this.paidAmount);
});

// Virtual for days left
billSchema.virtual("daysLeft").get(function () {
  if (this.status === "paid") return 0;
  return Math.ceil((new Date(this.dueDate) - new Date()) / (1000 * 60 * 60 * 24));
});

// Ensure virtuals are included in JSON output
billSchema.set("toJSON", { virtuals: true });
billSchema.set("toObject", { virtuals: true });

const Bill = model("Bill", billSchema);
module.exports = Bill;