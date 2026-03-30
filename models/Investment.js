const mongoose = require("mongoose");

const contributionSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true },
    date: { type: Date, required: true },
    note: { type: String, trim: true },
  },
  { _id: false }
);

const investmentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    assetName: { type: String, required: true, trim: true },
    startingBalance: { type: Number, default: 0 },
    contributions: [contributionSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Investment", investmentSchema);
