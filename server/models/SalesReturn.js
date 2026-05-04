// models/SalesReturn.js
const { Schema, model } = require("mongoose");

const returnItemSchema = new Schema({
  product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
  unit: { type: String, trim: true, default: "" },
  returnedQuantity: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true, min: 0 },
  vatPercentage: { type: Number, default: 5 },
  exclVatAmount: { type: Number, default: 0 },
  vatAmount: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  reason: { type: String, trim: true, default: "" },
});

const salesReturnSchema = new Schema(
  {
    order: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    customer: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    returnItems: {
      type: [returnItemSchema],
      required: true,
      validate: {
        validator: (v) => v.length > 0,
        message: "At least one return item is required",
      },
    },
    status: {
      type: String,
      enum: [
        "pending_admin_approval",
        "approved",
        "rejected",
        "pickup_assigned",
        "picked_up",
        "completed",
        "cancelled",
      ],
      default: "pending_admin_approval",
    },
    returnReason: { type: String, trim: true, default: "" },
    adminRemarks: { type: String, trim: true, default: "" },
    adminApprovedAt: { type: Date, default: null },
    adminRejectedAt: { type: Date, default: null },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User", default: null },
    assignedAt: { type: Date, default: null },
    pickedUpAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    refundMethod: {
      type: String,
      enum: ["cash", "cheque", "credit_adjustment", "none"],
      default: "none",
    },
    refundAmount: { type: Number, default: 0 },
    refundStatus: {
      type: String,
      enum: ["pending", "processed"],
      default: "pending",
    },
    billAdjusted: { type: Boolean, default: false },
    relatedBill: { type: Schema.Types.ObjectId, ref: "Bill", default: null },
    returnInvoiceNumber: { type: String, default: null, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

salesReturnSchema.virtual("totalReturnAmount").get(function () {
  return this.returnItems.reduce((sum, item) => sum + (item.totalAmount || 0), 0);
});

salesReturnSchema.set("toJSON", { virtuals: true });
salesReturnSchema.set("toObject", { virtuals: true });

const SalesReturn = model("SalesReturn", salesReturnSchema);
module.exports = SalesReturn;
