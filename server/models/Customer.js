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
      enum: ["creditcard", "immediate"],
      default: "creditcard",
      required: true,
    },
  },
  { timestamps: true }
);

const Customer = model("Customer", customerSchema);
module.exports = Customer;