const mongoose = require("mongoose");

const ruleSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: ["savings", "investment"],
      required: true,
    },
    label: { type: String, required: true },
    amountPerPaycheck: { type: Number, required: true },
    platform: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Rule", ruleSchema);
