const jwt = require("jsonwebtoken");
const User = require("../models/User");

const authRequired = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

    if (!token) {
      return res.status(401).json({ error: "Authorization token missing" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    req.user = req.user || { _id: decoded.userId };

    // Check and sync subscription status (auto-expire trials)
    try {
      const user = await User.findById(req.userId).select("subscriptionStatus trialEndDate");
      if (user) {
        if (user.subscriptionStatus === "trialing" && user.trialEndDate && new Date() > user.trialEndDate) {
          user.subscriptionStatus = "expired";
          await user.save();
        }
        req.subscriptionStatus = user.subscriptionStatus || "free";
        req.isPremium = ["premium_monthly", "premium_annual", "trialing"].includes(req.subscriptionStatus);
      }
    } catch { /* non-critical */ }

    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

module.exports = { authRequired };
