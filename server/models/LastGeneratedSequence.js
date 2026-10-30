const { Schema, model } = require("mongoose");

// Singleton log of the most recently issued orderId / delivery invoice
// number. Updated every time one is generated, and consulted (alongside
// scanning the Order collection itself) whenever InvoiceCounter is missing
// or reset, so numbering always continues from the last real value instead
// of restarting from 0/4000.
const lastGeneratedSequenceSchema = new Schema(
  {
    lastOrderId: { type: String, default: null },
    lastOrderSequence: { type: Number, default: 0 },
    lastOrderYear: { type: Number, default: null },

    lastDeliveryInvoiceNumber: { type: String, default: null },
    lastDeliveryInvoiceSequence: { type: Number, default: 0 },
    lastDeliveryInvoiceYear: { type: Number, default: null },
  },
  { timestamps: true }
);

const LastGeneratedSequence = model("LastGeneratedSequence", lastGeneratedSequenceSchema);
module.exports = LastGeneratedSequence;
