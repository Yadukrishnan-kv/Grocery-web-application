const { Schema, model } = require("mongoose");

const orderItemSchema = new Schema({
  product: {
    type: Schema.Types.ObjectId,
    ref: "Product",
    required: [true, "Product is required"],
  },
  unit: {
    type: String,
    trim: true,
    default: '',
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
  // Optional: remarks per item (if needed later)
  remarks: {
    type: String,
    trim: true,
    default: '',
  },
});

const orderSchema = new Schema(
  {
    customer: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: [true, "Customer is required"],
    },
    orderItems: {
      type: [orderItemSchema],
      required: [true, "At least one product is required"],
      minlength: 1,
    },
    status: {
      type: String,
      enum: ["pending", "delivered", "cancelled", "partial_delivered"],
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
      default: null,
    },
    pendingInvoiceNumber: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// Virtual for total ordered quantity (sum of all items)
orderSchema.virtual('totalOrderedQuantity').get(function () {
  return this.orderItems.reduce((sum, item) => sum + item.orderedQuantity, 0);
});

// Virtual for total delivered quantity
orderSchema.virtual('totalDeliveredQuantity').get(function () {
  return this.orderItems.reduce((sum, item) => sum + item.deliveredQuantity, 0);
});

// Virtual for grand total amount
orderSchema.virtual('grandTotal').get(function () {
  return this.orderItems.reduce((sum, item) => sum + item.totalAmount, 0);
});

const Order = model("Order", orderSchema);
module.exports = Order;