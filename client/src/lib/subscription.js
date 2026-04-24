/**
 * Single source of truth for "is this user effectively on Premium right
 * now?" — consumed by the gold-ring avatar, the Settings subscription
 * section, and any premium-gated UI.
 *
 * States that return true:
 *   - trialing (Stripe trial active)
 *   - active / premium (paid and not pending cancel, OR legacy
 *     grandfathered "premium")
 *   - cancelled AND subscriptionCancelAt is in the future (grace period
 *     after clicking "Cancel subscription" until period end)
 *
 * Returns false when: free, or cancelled + cancelAt has passed. In
 * practice the webhook will have flipped cancelled → free by then;
 * this is defense in depth if the webhook is delayed.
 *
 * Mongo field naming note: the codebase mixes "canceled" (US) and
 * "cancelled" (UK) spellings across historical docs. Both map here.
 */
export function isEffectivelyPremium(user, now = Date.now()) {
  if (!user) return false;
  const s = user.subscriptionStatus;
  if (s === "trialing" || s === "active" || s === "premium"
      || s === "premium_monthly" || s === "premium_annual") {
    return true;
  }
  if ((s === "cancelled" || s === "canceled") && user.subscriptionCancelAt) {
    return now < new Date(user.subscriptionCancelAt).getTime();
  }
  // Legacy grace path: some older canceled docs only have
  // subscriptionEndDate (not subscriptionCancelAt). Honor it.
  if ((s === "cancelled" || s === "canceled") && user.subscriptionEndDate) {
    return now < new Date(user.subscriptionEndDate).getTime();
  }
  return false;
}

/** True iff the user is in a grace-period cancel state (cancelled but still has access). */
export function isInCancelGrace(user, now = Date.now()) {
  if (!user) return false;
  const s = user.subscriptionStatus;
  if (s !== "cancelled" && s !== "canceled") return false;
  const end = user.subscriptionCancelAt || user.subscriptionEndDate;
  if (!end) return false;
  return now < new Date(end).getTime();
}
