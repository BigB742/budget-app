const mongoose = require("mongoose");

const billPaymentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  bill: { type: mongoose.Schema.Types.ObjectId, ref: "Bill", required: true },
  dueDate: { type: Date, required: true },
  paidDate: { type: Date, required: true },
  paidAmount: { type: Number, required: true },
  note: { type: String, default: "" },
}, { timestamps: true });

billPaymentSchema.index({ user: 1, bill: 1, dueDate: 1 }, { unique: true });

module.exports = mongoose.model("BillPayment", billPaymentSchema);
