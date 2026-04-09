// Payday auto-income cron job — runs daily at midnight
// For users with incomeType "fixed", automatically credits their income amount
// to currentBalance on each payday.
const cron = require("node-cron");
const User = require("../models/User");
const IncomeSource = require("../models/IncomeSource");
const { getPaydaysInRange, startOfLocalDay } = require("../utils/paycheckUtils");

cron.schedule("0 0 * * *", async () => {
  try {
    const today = startOfLocalDay(new Date());
    const todayKey = today.getTime();

    // Only process users with fixed income type
    const fixedUsers = await User.find({ incomeType: "fixed" }).select("_id incomeType");
    if (!fixedUsers.length) return;

    const fixedUserIds = fixedUsers.map((u) => u._id);

    // Load their active income sources
    const sources = await IncomeSource.find({
      user: { $in: fixedUserIds },
      isActive: true,
    });

    for (const src of sources) {
      // Check if today is a payday for this source
      const paydays = getPaydaysInRange(src.nextPayDate, src.frequency, today, today);
      if (paydays.length === 0) continue;

      // Prevent double-crediting on the same day
      if (src.lastAutoIncomeDate) {
        const lastKey = startOfLocalDay(src.lastAutoIncomeDate).getTime();
        if (lastKey === todayKey) continue;
      }

      // Credit the income and stamp the date
      await User.findByIdAndUpdate(src.user, { $inc: { currentBalance: src.amount } });
      src.lastAutoIncomeDate = new Date();
      await src.save();
    }
  } catch (err) {
    console.error("[PaydayIncome] Error:", err);
  }
});
