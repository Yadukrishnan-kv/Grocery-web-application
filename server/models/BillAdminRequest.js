// models/BillAdminRequest.js
const { Schema, model } = require("mongoose");

const billAdminRequestSchema = new Schema(
  {
    transaction: {
      type: Schema.Types.ObjectId,
      ref: "BillTransaction",
      required: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User", // Delivery or Sales man
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
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
  },
  { timestamps: true }
);

const BillAdminRequest = model("BillAdminRequest", billAdminRequestSchema);
module.exports = BillAdminRequest;