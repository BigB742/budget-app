// Helpers that keep a "PayPulse Premium" row in the user's bills
// collection in sync with their Stripe subscription. Called from both
// webhook handlers (routes/stripe.js and api/stripe/webhook.js) on
// checkout.session.completed and from the cancel-subscription route.
//
// The task spec asks for fields like `recurring`, `recurringFrequency`,
// `paid`, and `userId` — the actual Bill schema uses `user`,
// `dueDayOfMonth`, `startDate`, and `isActive` instead (all bills are
// implicitly monthly-recurring and "paid" lives in the separate
// BillPayment collection). We map the spec onto the real schema.

const Bill = require("../models/Bill");

const PREMIUM_BILL_NAME = "PayPulse Premium";
const PREMIUM_BILL_AMOUNT = 4.99;
const PREMIUM_BILL_CATEGORY = "Subscription";

/**
 * Create or update the PayPulse Premium bill for a user. Idempotent —
 * if a bill named "PayPulse Premium" already exists for this user,
 * skips creation and returns the existing doc.
 *
 * @param {string|ObjectId} userId
 * @param {Date} firstChargeDate — the trial end / first real charge date
 * @returns {Promise<{ created: boolean, bill: object }>}
 */
async function upsertPremiumBill(userId, firstChargeDate) {
  if (!userId) return { created: false, bill: null };

  const existing = await Bill.findOne({ user: userId, name: PREMIUM_BILL_NAME });
  if (existing) {
    // Re-activate if the user previously cancelled and is now resubscribing
    if (existing.isActive === false) {
      existing.isActive = true;
      if (firstChargeDate) {
        existing.startDate = firstChargeDate;
        existing.dueDayOfMonth = firstChargeDate.getDate();
      }
      await existing.save();
    }
    return { created: false, bill: existing };
  }

  const startDate = firstChargeDate instanceof Date ? firstChargeDate : new Date();
  const bill = await Bill.create({
    user: userId,
    name: PREMIUM_BILL_NAME,
    amount: PREMIUM_BILL_AMOUNT,
    dueDayOfMonth: startDate.getDate(),
    category: PREMIUM_BILL_CATEGORY,
    startDate, // hides the bill from periods before the first charge
    isActive: true,
  });
  return { created: true, bill };
}

/**
 * Remove the PayPulse Premium bill for a user. Used when the user
 * cancels their subscription. Soft-delete (isActive: false) so any
 * historical references stay intact — hard delete is reserved for
 * account deletion.
 *
 * @param {string|ObjectId} userId
 * @returns {Promise<{ removed: boolean }>}
 */
async function removePremiumBill(userId) {
  if (!userId) return { removed: false };
  const result = await Bill.updateMany(
    { user: userId, name: PREMIUM_BILL_NAME, isActive: { $ne: false } },
    { $set: { isActive: false } }
  );
  return { removed: result.modifiedCount > 0 };
}

module.exports = {
  PREMIUM_BILL_NAME,
  upsertPremiumBill,
  removePremiumBill,
};
