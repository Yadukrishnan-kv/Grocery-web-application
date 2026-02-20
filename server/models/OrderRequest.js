// models/OrderRequest.js
const mongoose = require('mongoose');

const orderRequestItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  unit: { type: String, trim: true, default: '' },
  orderedQuantity: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true, min: 0 },
  totalAmount: { type: Number, required: true, min: 0 },
  remarks: { type: String, trim: true, default: '' },
});

const orderRequestSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
    },
    customerUser: {  // who placed the request (customer user)
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    orderItems: {
      type: [orderRequestItemSchema],
      required: true,
      minlength: 1,
    },
    payment: {
      type: String,
      enum: ['credit', 'cash'],
      required: true,
    },
    remarks: { type: String, trim: true, default: '' },
    grandTotal: { type: Number, required: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approvedAt: { type: Date, default: null },
    rejectionReason: { type: String, trim: true, default: '' },
    requestedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const OrderRequest = mongoose.model('OrderRequest', orderRequestSchema);
module.exports = OrderRequest;