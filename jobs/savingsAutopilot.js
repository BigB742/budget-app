// Savings autopilot cron job — runs daily at 7 AM
// On paydays, auto-contributes perPaycheckAmount to savings goals with autopilot enabled
const cron = require("node-cron");
const SavingsGoal = require("../models/SavingsGoal");
const IncomeSource = require("../models/IncomeSource");
const { getPaydaysInRange, toLocalDate, startOfLocalDay } = require("../utils/paycheckUtils");

cron.schedule("0 7 * * *", async () => {
  try {
    const today = startOfLocalDay(new Date());
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    // Find all active income sources
    const sources = await IncomeSource.find({ isActive: true });

    // Group by user
    const userSources = {};
    sources.forEach((s) => {
      const uid = String(s.user);
      if (!userSources[uid]) userSources[uid] = [];
      userSources[uid].push(s);
    });

    for (const [userId, userSrcs] of Object.entries(userSources)) {
      // Check if today is a payday for this user
      let isPayday = false;
      for (const src of userSrcs) {
        const paydays = getPaydaysInRange(src.nextPayDate, src.frequency, today, today);
        if (paydays.length > 0) { isPayday = true; break; }
      }
      if (!isPayday) continue;

      // Find autopilot-enabled savings goals for this user
      const goals = await SavingsGoal.find({
        userId, autopilotEnabled: true, perPaycheckAmount: { $gt: 0 },
      });

      for (const goal of goals) {
        // Skip if already processed today
        if (goal.lastAutopilotDate) {
          const lastKey = startOfLocalDay(goal.lastAutopilotDate);
          if (lastKey.getTime() === today.getTime()) continue;
        }

        const remaining = goal.targetAmount - goal.savedAmount;
        if (remaining <= 0) continue;

        const contribution = Math.min(goal.perPaycheckAmount, remaining);
        goal.savedAmount += contribution;
        goal.lastAutopilotDate = new Date();
        await goal.save();
      }
    }

    console.log(`[Savings Autopilot] Completed for ${todayKey}`);
  } catch (error) {
    console.error("[Savings Autopilot] Error:", error);
  }
});
