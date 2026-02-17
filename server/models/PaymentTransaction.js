// models/PaymentTransaction.js
const { Schema, model } = require("mongoose");

const paymentTransactionSchema = new Schema(
  {
    order: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    deliveryMan: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
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
    },
    date: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
     enum: ["received", "pending", "paid_to_admin", "rejected"],
      default: "received",
    },
  },
  { timestamps: true }
);

const PaymentTransaction = model("PaymentTransaction", paymentTransactionSchema);
module.exports = PaymentTransaction;
