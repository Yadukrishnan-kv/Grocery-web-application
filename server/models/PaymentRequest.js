// models/PaymentRequest.js
const { Schema, model } = require("mongoose");

const paymentRequestSchema = new Schema(
  {
    bill: {
      type: Schema.Types.ObjectId,
      ref: "Bill",
      required: [true, "Bill is required"],
    },
    customer: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: [true, "Customer is required"],
    },
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: 0.01,
    },
    method: {
      type: String,
      enum: ["cash", "cheque"],
      required: [true, "Payment method is required"],
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
    recipientType: {
      type: String,
      enum: ["delivery", "sales"],
      required: [true, "Recipient type is required"],
    },
    recipient: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Recipient is required"],
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
  },
  { timestamps: true }
);

const PaymentRequest = model("PaymentRequest", paymentRequestSchema);
module.exports = PaymentRequest;