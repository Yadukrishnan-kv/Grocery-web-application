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
    companyEmail: {
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