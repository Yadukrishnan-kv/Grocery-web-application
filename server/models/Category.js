const { Schema, model } = require("mongoose");

const categorySchema = new Schema(
  {
    CategoryName: {
      type: String,
      required: [true, "Category name is required"],
      unique: true,
      trim: true,
    },
  },
  { timestamps: true }
);

const Category = model("Category", categorySchema);
module.exports = Category;