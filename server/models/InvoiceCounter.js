const { Schema, model } = require("mongoose");

const invoiceCounterSchema = new Schema({
  deliveredCount: {
    type: Number,
    default: 0
  },
  pendingCount: {
    type: Number,
    default: 0
  }
}, { timestamps: true });



const InvoiceCounter = model('InvoiceCounter', invoiceCounterSchema);
module.exports = InvoiceCounter;