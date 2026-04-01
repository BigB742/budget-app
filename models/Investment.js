const mongoose = require("mongoose");

const purchaseSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  pricePerCoin: { type: Number, required: true },
  date: { type: Date, required: true },
  note: { type: String, trim: true },
}, { _id: true });

const investmentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  assetName: { type: String, required: true, trim: true },
  ticker: { type: String, trim: true, uppercase: true },
  purchases: [purchaseSchema],
  // Legacy fields (kept for backward compat)
  startingBalance: { type: Number, default: 0 },
  contributions: [{
    amount: { type: Number },
    date: { type: Date },
    note: { type: String, trim: true },
  }],
}, { timestamps: true });

module.exports = mongoose.model("Investment", investmentSchema);
