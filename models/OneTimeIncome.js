const mongoose = require("mongoose");

const oneTimeIncomeSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  name: { type: String, required: true, trim: true },
  amount: { type: Number, required: true },
  date: { type: Date, required: true },
  note: { type: String, default: "" },
}, { timestamps: true });

module.exports = mongoose.model("OneTimeIncome", oneTimeIncomeSchema);
