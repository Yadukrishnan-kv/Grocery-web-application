const { Schema, model } = require("mongoose");

const orderSchema = new Schema(
  {
    customer: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: [true, "Customer is required"],
    },
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "Product is required"],
    },
    orderedQuantity: {
      type: Number,
      required: [true, "Ordered quantity is required"],
      min: 1,
    },
    deliveredQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: 0,
    },
    totalAmount: {
      type: Number,
      required: [true, "Total amount is required"],
      min: 0,
    },
    status: {
      type: String,
      enum: ["pending", "delivered", "cancelled"],
      default: "pending",
    },
    payment: {
      type: String,
      enum: ["credit", "cash"],
      required: [true, "Payment method is required"],
    },
    orderDate: {
      type: Date,
      default: Date.now,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    assignmentStatus: {
      type: String,
      enum: ["pending_assignment", "assigned", "accepted", "rejected", "cancelled"],
      default: "pending_assignment",
    },
    assignedAt: {
      type: Date,
      default: null,
    },
    acceptedAt: {
      type: Date,
      default: null,
    },
    remarks: { 
      type: String,
      trim: true,
      default: '',
      
    },
    deliveredInvoiceNumber: {
    type: String,
    default: null  // will be set on first delivered invoice
  },

  pendingInvoiceNumber: {
    type: String,
    default: null  // will be set on first pending invoice
  },
  },
  { timestamps: true }
);

const Order = model("Order", orderSchema);
module.exports = Order;