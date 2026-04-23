const mongoose = require("mongoose");

const oneTimeIncomeSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  name: { type: String, required: true, trim: true },
  amount: { type: Number, required: true },
  date: { type: Date, required: true },
  // `note` removed from UI per product spec. Schema field left in place
  // so existing docs with notes remain intact, but new docs won't set it
  // and no frontend renders it.
}, { timestamps: true });

module.exports = mongoose.model("OneTimeIncome", oneTimeIncomeSchema);
