// models/Role.js
const { Schema, model } = require("mongoose");

const roleSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Role name is required"],
      unique: true,
      trim: true,
    },
    permissions: {
      type: [String],
      default: [],
      // Recommended format: "menu.dashboard", "menu.users", "menu.products", etc.
    },
  },
  { timestamps: true }
);

const Role = model("Role", roleSchema);
module.exports = Role;