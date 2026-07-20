const { Schema, model } = require("mongoose");

const customerProductPriceSchema = new Schema(
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
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: 0,
    },
  },
  { timestamps: true }
);

customerProductPriceSchema.index({ customer: 1, product: 1 }, { unique: true });

const CustomerProductPrice = model("CustomerProductPrice", customerProductPriceSchema);
module.exports = CustomerProductPrice;
