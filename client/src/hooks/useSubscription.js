import { useMemo } from "react";
import { isEffectivelyPremium, isInCancelGrace } from "../lib/subscription";

export const useSubscription = () => {
  const user = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("user")); } catch { return null; }
  }, []);

  const status = user?.subscriptionStatus || "free";
  const now = new Date();

  const trialEndDate = user?.trialEndDate ? new Date(user.trialEndDate) : null;
  // End-of-access date. Fresh cancellations (§5) write
  // subscriptionCancelAt; legacy rows only had subscriptionEndDate.
  const subscriptionEndDate = user?.subscriptionCancelAt
    ? new Date(user.subscriptionCancelAt)
    : user?.subscriptionEndDate
      ? new Date(user.subscriptionEndDate)
      : null;

  const isCanceled = status === "canceled" || status === "cancelled";
  const isCanceledButActive = isInCancelGrace(user, now.getTime());

  const isTrialing = status === "trialing" && trialEndDate && trialEndDate > now;
  // Gold ring + premium gating — single source of truth. Keeps parity
  // with the server-side view of Premium access.
  const isPremium = isEffectivelyPremium(user, now.getTime());
  const isFree = !isPremium;

  const trialDaysLeft = isTrialing && user?.trialEndDate
    ? Math.max(0, Math.ceil((new Date(user.trialEndDate) - now) / (1000 * 60 * 60 * 24)))
    : 0;

  return {
    status,
    isPremium,
    isTrialing,
    isCanceled,
    isCanceledButActive,
    isFree,
    trialDaysLeft,
    subscriptionEndDate,
  };
};
