const { Schema, model } = require("mongoose");

const invoiceCounterSchema = new Schema({
  invoiceCount: {
    type: Number,
    default: 0
  },
  deliveredInvoiceCount: {
    type: Number,
    default: 0
  },
  // Calendar year the current deliveredInvoiceCount sequence belongs to.
  // When the year changes, the sequence restarts at 1 (DDFT/101001/YY).
  deliveredInvoiceYear: {
    type: Number
  },
  returnCount: {
    type: Number,
    default: 0
  },
  orderCount: {
    type: Number,
    default: 4000
  }
}, { timestamps: true });



const InvoiceCounter = model('InvoiceCounter', invoiceCounterSchema);
module.exports = InvoiceCounter;