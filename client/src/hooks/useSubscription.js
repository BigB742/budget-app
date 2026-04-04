import { useMemo } from "react";

export const useSubscription = () => {
  const user = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("user")); } catch { return null; }
  }, []);

  const status = user?.subscriptionStatus || "free";
  const isPremium = status === "premium_monthly" || status === "premium_annual";
  const isTrialing = status === "trialing" && user?.trialEndDate && new Date(user.trialEndDate) > new Date();
  const isFree = !isPremium && !isTrialing;

  const trialDaysLeft = isTrialing && user?.trialEndDate
    ? Math.max(0, Math.ceil((new Date(user.trialEndDate) - new Date()) / (1000 * 60 * 60 * 24)))
    : 0;

  return { status, isPremium, isTrialing, isFree, trialDaysLeft };
};
