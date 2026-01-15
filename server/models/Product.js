const { Schema, model } = require("mongoose");

const productSchema = new Schema(
  {
    productName: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
    },
    CategoryName: {
      type: String,
      required: [true, "Category name is required"],
      trim: true,
    },
    subCategoryName: {
      type: String,
      required: [true, "Sub-category name is required"],
      trim: true,
    },
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: 0,
    },
    quantity: {
      type: Number,
      required: [true, "Quantity is required"],
      min: 0,
      default: 0,
    },
  },
  { timestamps: true }
);

const Product = model("Product", productSchema);
module.exports = Product;