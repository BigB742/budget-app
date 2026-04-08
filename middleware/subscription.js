const User = require("../models/User");

// Middleware: checks and auto-expires trials, attaches subscriptionStatus to req.user
const checkSubscriptionStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).select("subscriptionStatus trialEndDate isPremium");
    if (!user) return next();

    // Auto-expire trialing users whose trial has ended
    if (user.subscriptionStatus === "trialing" && user.trialEndDate && new Date() > user.trialEndDate) {
      user.subscriptionStatus = "expired";
      user.isPremium = false;
      await user.save();
    }

    // Sync isPremium flag
    const premium = ["premium", "premium_monthly", "premium_annual", "trialing"].includes(user.subscriptionStatus);
    if (user.isPremium !== premium) {
      user.isPremium = premium;
      await user.save();
    }

    req.subscriptionStatus = user.subscriptionStatus;
    req.isPremium = premium;
    next();
  } catch {
    next();
  }
};

module.exports = { checkSubscriptionStatus };
