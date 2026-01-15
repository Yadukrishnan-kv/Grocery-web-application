const { Schema, model } = require("mongoose");

const subCategorySchema = new Schema(
  {
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
  },
  { timestamps: true }
);

const SubCategory = model("SubCategory", subCategorySchema);
module.exports = SubCategory;