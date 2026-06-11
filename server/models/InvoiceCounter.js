const { Schema, model } = require("mongoose");

const invoiceCounterSchema = new Schema({
  invoiceCount: {
    type: Number,
    default: 0
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