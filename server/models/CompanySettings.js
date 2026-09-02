const { Schema, model } = require("mongoose");

const companySettingsSchema = new Schema(
  {
    companyName: {
      type: String,
      required: [true, "Company name is required"],
      trim: true,
    },
    companyAddress: {
      type: String,
      required: [true, "Company address is required"],
      trim: true,
    },
    companyPhone: {
      type: String,
      trim: true,
    },
    companyTel: {
      type: String,
      trim: true,
    },
    companyEmail: {
      type: String,
      trim: true,
    },
    companyWebsite: {
      type: String,
      trim: true,
    },
    companyNameArabic: {
      type: String,
      trim: true,
    },
    bankName: {
      type: String,
      trim: true,
    },
    bankAccountNumber: {
      type: String,
      trim: true,
    },
    entriesPerPage: {
      type: Number,
      enum: [10, 20, 50, 100],
      default: 10,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

const CompanySettings = model("CompanySettings", companySettingsSchema)
module.exports = CompanySettings;