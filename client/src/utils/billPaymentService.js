// Shared client-side helpers for the bill / plan-installment / expense
// "did you pay this?" prompt flow. Centralises the LA-timezone pin and
// the YMD-integer comparison rules so every surface (onboarding, Bills
// page, PaymentPlans page, dashboard prompt queue) makes the same
// decision for the same inputs.
//
// All comparisons run on year*10000 + month*100 + day integers. Date
// objects are only used for display labels passed into
// PaymentStatusModal — never for compares.

const APP_TZ = "America/Los_Angeles";

// LA-pinned today as { year, month, day, ymd }. Mirrors the server's
// resolveToday so the "is occurrence in [onboarding, today]?" check
// uses the same calendar as the engine.
export const todayInLA = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === "year").value);
  const month = Number(parts.find((p) => p.type === "month").value);
  const day = Number(parts.find((p) => p.type === "day").value);
  return { year, month, day, ymd: year * 10000 + month * 100 + day };
};

// Last calendar day of (1-indexed) month m in year y. The intermediate
// Date is never compared or formatted, only used for .getDate(), so it
// is timezone-irrelevant.
const lastDayOfMonth = (y, m) => new Date(y, m, 0).getDate();

// Most recent occurrence of a recurring dueDayOfMonth bill, walking
// back from today in LA. Always returns an occurrence (never null) —
// the caller decides via shouldShowPaymentStatusModal whether to act
// on it.
//
// Returns:
//   {
//     year, month, day,    // 1-indexed calendar components in LA
//     ymd,                 // year*10000 + month*100 + day
//     iso,                 // "YYYY-MM-DD" — for API payloads
//     displayDate,         // browser-local-midnight Date, safe to
//                          //   feed PaymentStatusModal's formatter
//                          //   without UTC-roundtrip drift
//   }
export const mostRecentOccurrence = (dueDayOfMonth) => {
  const t = todayInLA();
  let y = t.year;
  let m = t.month;
  let d = Math.min(dueDayOfMonth, lastDayOfMonth(y, m));
  let ymd = y * 10000 + m * 100 + d;
  if (ymd > t.ymd) {
    m -= 1;
    if (m < 1) { m = 12; y -= 1; }
    d = Math.min(dueDayOfMonth, lastDayOfMonth(y, m));
    ymd = y * 10000 + m * 100 + d;
  }
  return {
    year: y,
    month: m,
    day: d,
    ymd,
    iso: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    displayDate: new Date(y, m - 1, d),
  };
};

// User.onboardingDate as a YMD integer. The server stamps it via
// utils/appTz.js todayInAppTz(), which on a UTC server (Vercel) writes
// a Date whose UTC y/m/d match the LA calendar day. Reading via
// getUTC* recovers the intended date directly. Returns null if absent
// (legacy users pre-backfill, or pre-onboarding-completion).
export const parseOnboardingYMD = (onboardingDate) => {
  if (!onboardingDate) return null;
  const dt = new Date(onboardingDate);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.getUTCFullYear() * 10000 + (dt.getUTCMonth() + 1) * 100 + dt.getUTCDate();
};

// Read User.onboardingDate from the cached user object as a YMD
// integer. Convenience for surfaces that don't have direct access to
// the user prop. Returns null if missing or unparseable.
export const readOnboardingYMDFromCache = () => {
  try {
    const u = JSON.parse(localStorage.getItem("user") || "{}");
    return parseOnboardingYMD(u?.onboardingDate);
  } catch {
    return null;
  }
};

// Pure integer-compare decision: should the PaymentStatusModal open?
//   • no onboardingDate (legacy / pre-backfill)  → suppress
//   • occurrence is in the future                → suppress (not due)
//   • occurrence is before onboardingDate        → suppress (history)
//   • occurrence is in [onboardingDate, today]   → open
export const shouldShowPaymentStatusModal = ({ occYMD, todayYMD, onboardingYMD }) => {
  if (!onboardingYMD) return false;
  if (occYMD > todayYMD) return false;
  if (occYMD < onboardingYMD) return false;
  return true;
};

// Convenience for "add bill" flows. Given the new bill's dueDayOfMonth
// and the user's onboardingDate ISO, returns the occurrence and a
// `prompt` boolean indicating whether to open PaymentStatusModal.
export const evaluateBillOccurrence = (dueDayOfMonth, onboardingDate) => {
  const occurrence = mostRecentOccurrence(dueDayOfMonth);
  const today = todayInLA();
  const onboardingYMD = parseOnboardingYMD(onboardingDate);
  return {
    occurrence,
    todayYMD: today.ymd,
    onboardingYMD,
    prompt: shouldShowPaymentStatusModal({
      occYMD: occurrence.ymd,
      todayYMD: today.ymd,
      onboardingYMD,
    }),
  };
};
