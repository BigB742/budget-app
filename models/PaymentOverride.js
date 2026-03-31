const mongoose = require("mongoose");

const paymentOverrideSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    bill: { type: mongoose.Schema.Types.ObjectId, ref: "Bill", required: true },
    date: { type: Date, required: true },
    amount: { type: Number, required: true },
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

// One override per bill+date combination
paymentOverrideSchema.index({ user: 1, bill: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("PaymentOverride", paymentOverrideSchema);
