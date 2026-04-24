const mongoose = require("mongoose");

/**
 * Dedupe ledger for Stripe webhook events. We write one row per
 * event.id before processing — the unique index throws on retries of
 * the same event so the handler becomes idempotent. Stripe retries
 * failed webhook deliveries for up to 3 days, so without this a
 * transient 500 would cause every subsequent retry to re-execute the
 * handler body and produce duplicate state mutations.
 */
const StripeEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    type: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

module.exports = mongoose.model("StripeEvent", StripeEventSchema);
