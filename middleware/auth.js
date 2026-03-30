const jwt = require("jsonwebtoken");

const authRequired = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

    if (!token) {
      return res.status(401).json({ error: "Authorization token missing" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    // Provide a minimal req.user to align with handlers expecting req.user._id.
    req.user = req.user || { _id: decoded.userId };
    next();
  } catch (error) {
    console.error("Auth error:", error);
    res.status(401).json({ error: "Invalid or expired token" });
  }
};

module.exports = { authRequired };
