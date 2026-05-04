// models/Customer.js
const { Schema, model } = require("mongoose");

const customerSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: [true, "Customer name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Please use a valid email address"],
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
    balanceCreditLimit: {
      type: Number,
      default: function() {
        return this.creditLimit;
      },
      min: 0,
    },
    billingType: {
      type: String,
      enum: ["Credit limit", "Cash"],
      default: "Credit limit",
      required: true,
    },
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

    openingBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    openingBalanceDueDays: {
      type: Number,
      min: 0,
      default: null,
    },
    salesman: {
      type: Schema.Types.ObjectId,
      ref: "User",
      // not required for legacy customers but assigned when created by admin or salesman
    },
    contactPersonName: {
      type: String,
      trim: true,
      default: null,
    },
    contactPersonPhone: {
      type: String,
      trim: true,
      default: null,
    },
    contactPersonAddress: {
      type: String,
      trim: true,
      default: null,
    },
    latitude: {
      type: Number,
      default: null,
    },
    longitude: {
      type: Number,
      default: null,
    },
    emiratesName: {
      type: String,
      trim: true,
      default: null,
    },
    emiratesCode: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { timestamps: true }
);

// Virtual for used credit (for easy calculation)
customerSchema.virtual("usedCredit").get(function() {
  return this.creditLimit - this.balanceCreditLimit;
});

customerSchema.set("toObject", { virtuals: true });
customerSchema.set("toJSON", { virtuals: true });

const Customer = model("Customer", customerSchema);
module.exports = Customer;