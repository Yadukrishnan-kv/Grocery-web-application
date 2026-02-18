// models/BillTransaction.js
const { Schema, model } = require("mongoose");

const billTransactionSchema = new Schema(
  {
    bill: {
      type: Schema.Types.ObjectId,
      ref: "Bill",
      required: true,
    },
    customer: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    recipient: {
      type: Schema.Types.ObjectId,
      ref: "User", // Delivery Man or Sales Man
      required: true,
    },
    recipientType: {
      type: String,
      enum: ["delivery", "sales"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    method: {
      type: String,
      enum: ["cash", "cheque"],
      required: true,
    },
    chequeDetails: {
      type: {
        number: { type: String, trim: true },
        bank: { type: String, trim: true },
        date: { type: Date },
      },
      required: function () {
        return this.method === "cheque";
      },
    },
    status: {
      type: String,
      enum: ["received", "pending", "paid_to_admin"],
      default: "received",
    },
    paymentRequest: {
      type: Schema.Types.ObjectId,
      ref: "PaymentRequest",
      required: true,
    },
  },
  { timestamps: true },
);
billTransactionSchema.virtual("adminRequest", {
  ref: "BillAdminRequest",
  localField: "_id",
  foreignField: "transaction",
  justOne: true,
});

// Ensure virtuals are included in JSON output
billTransactionSchema.set("toJSON", { virtuals: true });
billTransactionSchema.set("toObject", { virtuals: true });

const BillTransaction = model("BillTransaction", billTransactionSchema);
module.exports = BillTransaction;
