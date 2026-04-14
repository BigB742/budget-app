const User = require("../models/User");

// Middleware: auto-expires trials and canceled-past-end-date subscriptions,
// then attaches subscriptionStatus + isPremium to req for downstream routes.
//
// IMPORTANT: this used to write `user.isPremium` back to Mongo on every
// request whenever it drifted from the computed value. That created
// write amplification AND, worse, would clobber a "canceled" user's
// isPremium=true mid-billing-period because the old enum didn't include
// "canceled" or "premium" as premium states. The middleware now writes
// only on real state transitions (trial expired, cancellation reached
// end date) and leaves the rest alone.
const checkSubscriptionStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).select(
      "subscriptionStatus trialEndDate subscriptionEndDate isPremium stripeSubscriptionId"
    );
    if (!user) return next();

    const now = new Date();

    // Trial ended → expire.
    if (user.subscriptionStatus === "trialing" && user.trialEndDate && now > user.trialEndDate) {
      user.subscriptionStatus = "expired";
      user.isPremium = false;
      await user.save();
    }
    // Canceled subscription past its access end → downgrade to free.
    // Access end is either subscriptionEndDate (post-trial plan cancelled
    // mid-period) OR trialEndDate (trial cancelled before it converted).
    // We take the later of the two so cancelling a trial doesn't kick
    // the user out early.
    if (user.subscriptionStatus === "canceled") {
      const sEnd = user.subscriptionEndDate ? new Date(user.subscriptionEndDate) : null;
      const tEnd = user.trialEndDate ? new Date(user.trialEndDate) : null;
      const accessEnd = sEnd && tEnd ? (sEnd > tEnd ? sEnd : tEnd) : (sEnd || tEnd);
      if (accessEnd && now > accessEnd) {
        user.subscriptionStatus = "free";
        user.isPremium = false;
        user.stripeSubscriptionId = null;
        user.subscriptionEndDate = undefined;
        await user.save();
      }
    }

    const status = user.subscriptionStatus || "free";
    req.subscriptionStatus = status;

    const trialStillActive = user.trialEndDate && new Date(user.trialEndDate) > now;
    const canceledStillActive = (
      (user.subscriptionEndDate && new Date(user.subscriptionEndDate) > now) ||
      trialStillActive
    );
    req.isPremium = (
      status === "premium" ||
      status === "premium_monthly" ||
      status === "premium_annual" ||
      (status === "trialing" && trialStillActive) ||
      (status === "canceled" && canceledStillActive)
    );
    next();
  } catch {
    next();
  }
};

module.exports = { checkSubscriptionStatus };
