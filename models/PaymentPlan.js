const mongoose = require("mongoose");
const crypto = require("crypto");

const PaymentEntrySchema = new mongoose.Schema(
  {
    id: { type: String, default: () => crypto.randomUUID() },
    // `date` is the originally scheduled date — never changes on mark-paid
    // so "undo" can restore the installment to its original pay period.
    date: { type: Date, required: true },
    amount: { type: Number, required: true, min: 0 },
    paid: { type: Boolean, default: false },
    // `datePaid` (preferred) and legacy `paidDate` both exist. New code
    // reads datePaid; legacy docs still have paidDate. The PATCH route
    // sets BOTH for forward compatibility.
    datePaid: { type: Date },
    paidDate: { type: Date },
    // True if the user paid strictly before the scheduled date. Used by
    // the balance calculation to move the installment into the pay
    // period containing datePaid (not date).
    paidEarly: { type: Boolean, default: false },
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
