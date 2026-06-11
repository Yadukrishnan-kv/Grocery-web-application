const { Schema, model } = require("mongoose");
const validator = require("validator");
const bcrypt = require("bcryptjs");

const userSchema = new Schema(
  {
    username: {
      type: String,
      required: [true, "Username is required"],
      trim: true,
      minlength: [3, "Username must be at least 3 characters long"],
      unique: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      validate: {
        validator: (value) => validator.isEmail(value),
        message: "Please provide a valid email",
      },
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters long"],
      select: false,
    },
    role: {
      type: String,
      required: true,
      default: "Admin",
    },
    salesmanCreditLimit: {
      type: Number,
      min: 0,
      validate: {
        validator: function () {
          return this.role === "Sales man" || this.salesmanCreditLimit === undefined;
        },
        message: "salesmanCreditLimit is only allowed for Sales man role",
      },
    },
    salesmanBalanceCreditLimit: {
      type: Number,
      min: 0,
      validate: {
        validator: function () {
          return this.role === "Sales man" || this.salesmanBalanceCreditLimit === undefined;
        },
        message: "salesmanBalanceCreditLimit is only allowed for Sales man role",
      },
    },
    emiratesName: {
      type: String,
      trim: true,
      default: null,
    },
    emiratesCode: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 12);
});

// Clear salesman fields for non-salesman roles
userSchema.pre("save", function () {
  if (this.role !== "Sales man") {
    this.salesmanCreditLimit = undefined;
    this.salesmanBalanceCreditLimit = undefined;
  } else {
    // Set default for Sales man role if not provided
    if (this.salesmanCreditLimit === undefined) {
      this.salesmanCreditLimit = 0;
    }
    if (this.salesmanBalanceCreditLimit === undefined) {
      this.salesmanBalanceCreditLimit = this.salesmanCreditLimit || 0;
    }
  }
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};
const User = model("User", userSchema);
module.exports = User;