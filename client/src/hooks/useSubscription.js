import { useMemo } from "react";

export const useSubscription = () => {
  const user = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("user")); } catch { return null; }
  }, []);

  const status = user?.subscriptionStatus || "free";
  const now = new Date();

  // Canceled subs: user keeps premium access until subscriptionEndDate
  const subscriptionEndDate = user?.subscriptionEndDate ? new Date(user.subscriptionEndDate) : null;
  const isCanceled = status === "canceled";
  const isCanceledButActive = isCanceled && subscriptionEndDate && subscriptionEndDate > now;

  const isPaidStatus = status === "premium" || status === "premium_monthly" || status === "premium_annual";
  const isPremium = isPaidStatus || isCanceledButActive;
  const isTrialing = status === "trialing" && user?.trialEndDate && new Date(user.trialEndDate) > now;
  const isFree = !isPremium && !isTrialing;

  const trialDaysLeft = isTrialing && user?.trialEndDate
    ? Math.max(0, Math.ceil((new Date(user.trialEndDate) - now) / (1000 * 60 * 60 * 24)))
    : 0;

  return { status, isPremium, isTrialing, isCanceled, isFree, trialDaysLeft, subscriptionEndDate };
};
