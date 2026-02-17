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
    unit: {
      type: String,
      enum: [
        'kg',
        'gram',
        'liter',
        'ml',
        'piece',
        'box',
        'pack',
        'bottle',
        'can',
        'dozen',
        'set',
        'pair',
        'roll',
        'bag',
        'jar',
        'tin',
        'carton',
        'bundle'
      ],
      required: [true, "Unit is required"],
      trim: true,
    },
  },
  { timestamps: true }
);

const Product = model("Product", productSchema);
module.exports = Product;