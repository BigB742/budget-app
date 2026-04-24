require("dotenv").config();

const mongoose = require("mongoose");
const User = require("../../models/User");
const IncomeSource = require("../../models/IncomeSource");
const { getPaydaysInRange, startOfLocalDay } = require("../../utils/paycheckUtils");

// Serverless MongoDB connection caching
let cachedConn = null;

async function connectDB() {
  if (cachedConn && mongoose.connection.readyState === 1) return cachedConn;
  cachedConn = await mongoose.connect(process.env.MONGO_URI, {});
  return cachedConn;
}

module.exports = async (req, res) => {
  // Only allow GET (Vercel cron uses GET)
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Verify CRON_SECRET
  const authHeader = req.headers["authorization"] || "";
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    await connectDB();

    const today = startOfLocalDay(new Date());
    const todayKey = today.getTime();

    // Only process users with fixed income type
    const fixedUsers = await User.find({ incomeType: "fixed" }).select("_id");
    if (!fixedUsers.length) return res.status(200).json({ processed: 0 });

    const fixedUserIds = fixedUsers.map((u) => u._id);

    // Load their active income sources
    const sources = await IncomeSource.find({
      user: { $in: fixedUserIds },
      isActive: true,
    });

    let processed = 0;

    for (const src of sources) {
      // Check if today is a payday for this source
      const paydays = getPaydaysInRange(src.nextPayDate, src.frequency, today, today);
      if (paydays.length === 0) continue;

      // Prevent double-crediting on the same day
      if (src.lastAutoIncomeDate) {
        const lastKey = startOfLocalDay(src.lastAutoIncomeDate).getTime();
        if (lastKey === todayKey) continue;
      }

      // Stamp the payday so we don't re-process the same day. The
      // paycheck itself is now counted live by /summary/paycheck-current
      // (the dashboard balance formula adds the period's totalIncome).
      // We no longer $inc currentBalance here — that would double-count
      // against the endpoint's income term and swing the dashboard the
      // day after each payday.
      src.lastAutoIncomeDate = new Date();
      await src.save();
      processed++;
    }

    return res.status(200).json({ processed });
  } catch (err) {
    console.error("[PaydayCron] Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
