const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
    },
    firstName: {
      type: String,
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
    },
    dateOfBirth: {
      type: Date,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    incomeSettings: {
      amount: { type: Number, default: 0 },
      frequency: {
        type: String,
        enum: ["weekly", "biweekly", "monthly"],
        default: "biweekly",
      },
      lastPaycheckDate: { type: Date },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);
