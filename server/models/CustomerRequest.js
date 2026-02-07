const { Schema, model } = require("mongoose");

const customerRequestSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Customer name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      trim: true,
      lowercase: true,
    },
    phoneNumber: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
    },
    address: {
      type: String,
      required: [true, "Address is required"],
      trim: true,
    },
    pincode: {
      type: String,
      required: [true, "Pincode is required"],
      trim: true,
    },
    creditLimit: {
      type: Number,
      required: [true, "Credit limit is required"],
      min: 0,
    },
    billingType: {
      type: String,
      enum: ["Credit limit", "Cash"],
      default: "Credit limit",
      required: true,
    },
    // NEW FIELDS — same as Customer model
    statementType: {
      type: String,
      enum: ["invoice-based", "monthly"],
      default: null,
    },
    dueDays: {
      type: Number,
      min: 0,
      default: null,
    },
    salesman: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { timestamps: true }
);

const CustomerRequest = model("CustomerRequest", customerRequestSchema);
module.exports = CustomerRequest;