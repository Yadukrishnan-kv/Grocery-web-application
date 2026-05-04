// models/Emirates.js
const { Schema, model } = require("mongoose");

const emiratesSchema = new Schema(
  {
    emiratesName: {
      type: String,
      required: [true, "Emirates name is required"],
      unique: true,
      trim: true,
    },
    emiratesCode: {
      type: String,
      required: [true, "Emirates code is required"],
      unique: true,
      trim: true,
      uppercase: true,
    },
  },
  { timestamps: true }
);

const Emirates = model("Emirates", emiratesSchema);
module.exports = Emirates;
