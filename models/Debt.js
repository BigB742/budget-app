const mongoose = require("mongoose");
const debtSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  name: { type: String, required: true },
  originalBalance: { type: Number, required: true },
  currentBalance: { type: Number, required: true },
  interestRate: { type: Number, default: 0 },
  minimumPayment: { type: Number, required: true },
  dueDayOfMonth: { type: Number, required: true },
  isActive: { type: Boolean, default: true },
  payments: [{ amount: Number, date: { type: Date, default: Date.now }, note: String }],
}, { timestamps: true });
module.exports = mongoose.model("Debt", debtSchema);
