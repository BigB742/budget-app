// One-time backfill for User.onboardingDate. Run with: MONGO_URI=... node scripts/backfill-onboarding-date.js
//
// For every User where onboardingComplete=true and onboardingDate is null,
// set onboardingDate = createdAt and save. Users who have not yet completed
// onboarding are left with onboardingDate=null and will be stamped fresh
// when they finish the flow. Idempotent — re-running after a clean pass
// is a no-op.

require("dotenv").config();

const mongoose = require("mongoose");
const User = require("../models/User");

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI is not set. Aborting.");
    process.exit(1);
  }

  await mongoose.connect(uri, {});

  const totalScanned = await User.countDocuments({});
  const alreadyStamped = await User.countDocuments({ onboardingDate: { $ne: null } });
  const notYetOnboarded = await User.countDocuments({
    onboardingComplete: { $ne: true },
    onboardingDate: null,
  });

  const candidates = await User.find({
    onboardingComplete: true,
    onboardingDate: null,
  }).select("_id email createdAt onboardingComplete onboardingDate");

  let updated = 0;
  for (const user of candidates) {
    if (!user.createdAt) continue;
    user.onboardingDate = user.createdAt;
    await user.save();
    updated += 1;
  }

  console.log("backfill-onboarding-date complete");
  console.log(`  total users scanned:                 ${totalScanned}`);
  console.log(`  updated (set onboardingDate=createdAt): ${updated}`);
  console.log(`  skipped (already had onboardingDate):   ${alreadyStamped}`);
  console.log(`  skipped (not yet onboarded):            ${notYetOnboarded}`);

  await mongoose.disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("backfill-onboarding-date failed:", err);
    process.exit(1);
  });
