const User = require("../models/User");

const premiumRequired = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).select("isPremium");
    if (!user || !user.isPremium) {
      return res.status(403).json({ error: "Premium feature. Upgrade to access this." });
    }
    next();
  } catch (error) {
    console.error("Premium check error:", error);
    res.status(500).json({ error: "Server error" });
  }
};

module.exports = { premiumRequired };
