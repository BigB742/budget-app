import { useMemo } from "react";

export const useSubscription = () => {
  const user = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("user")); } catch { return null; }
  }, []);

  const status = user?.subscriptionStatus || "free";
  const now = new Date();

  // Canceled subs keep access until the period ends. That end is stored
  // on subscriptionEndDate for active-plan cancellations and on
  // trialEndDate for trial cancellations — check both so trial users
  // who cancel mid-trial still get the rest of their 3 days.
  const trialEndDate = user?.trialEndDate ? new Date(user.trialEndDate) : null;
  const subscriptionEndDate = user?.subscriptionEndDate ? new Date(user.subscriptionEndDate) : null;
  const isCanceled = status === "canceled";
  const isCanceledButActive = isCanceled && (
    (subscriptionEndDate && subscriptionEndDate > now) ||
    (trialEndDate && trialEndDate > now)
  );

  // Trialing users have FULL premium access — the trial IS premium.
  const isTrialing = status === "trialing" && trialEndDate && trialEndDate > now;

  const isPaidStatus = status === "premium" || status === "premium_monthly" || status === "premium_annual";
  const isPremium = isPaidStatus || isCanceledButActive || isTrialing;
  const isFree = !isPremium;

  const trialDaysLeft = isTrialing && user?.trialEndDate
    ? Math.max(0, Math.ceil((new Date(user.trialEndDate) - now) / (1000 * 60 * 60 * 24)))
    : 0;

  return { status, isPremium, isTrialing, isCanceled, isFree, trialDaysLeft, subscriptionEndDate };
};
