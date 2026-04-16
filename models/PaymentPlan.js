const mongoose = require("mongoose");
const crypto = require("crypto");

const PaymentEntrySchema = new mongoose.Schema(
  {
    id: { type: String, default: () => crypto.randomUUID() },
    date: { type: Date, required: true },
    amount: { type: Number, required: true, min: 0 },
    paid: { type: Boolean, default: false },
    paidDate: { type: Date },
  },
  { _id: false }
);

const PaymentPlanSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    totalAmount: { type: Number },
    payments: [PaymentEntrySchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("PaymentPlan", PaymentPlanSchema);
