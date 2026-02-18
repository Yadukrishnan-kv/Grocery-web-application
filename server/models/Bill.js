// models/Bill.js (added "pending_payment" to enum)
const { Schema, model } = require("mongoose");

const billSchema = new Schema(
  {
    customer: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: [true, "Customer is required"],
    },
    cycleStart: {
      type: Date,
      required: [true, "Cycle start date is required"],
    },
    cycleEnd: {
      type: Date,
      required: [true, "Cycle end date is required"],
    },
    totalUsed: {
      type: Number,
      required: [true, "Total used amount is required"],
      min: 0,
    },
    amountDue: {
      type: Number,
      default: function() {
        return this.totalUsed;
      },
      min: 0,
    },
    dueDate: {
      type: Date,
      required: [true, "Due date is required"],
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ["pending", "pending_payment", "paid", "overdue", "partial"], 
      default: "pending",
    },
    orders: [
      {
        type: Schema.Types.ObjectId,
        ref: "Order",
      },
    ],
  },
  { timestamps: true }
);

const Bill = model("Bill", billSchema);
module.exports = Bill;