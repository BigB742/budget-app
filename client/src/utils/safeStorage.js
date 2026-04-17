// Strips sensitive financial data before persisting the user profile to
// localStorage. The full profile (including currentBalance, incomeSettings,
// loginHistory) stays in-memory via DataCache.profile — only the UI-safe
// subset is stored in the browser where extensions or XSS could read it.
//
// Fields kept: identity, routing flags, subscription status, preferences.
// Fields stripped: currentBalance, incomeSettings.amount, loginHistory IPs.

const SAFE_KEYS = new Set([
  "_id", "email", "firstName", "lastName", "name", "phone", "dateOfBirth",
  "onboardingComplete", "tourCompleted",
  "isPremium", "subscriptionStatus", "trialEndDate", "subscriptionEndDate",
  "locale", "twoFactorEnabled", "incomeType", "createdAt",
  // isAdmin is cosmetic-only (shows/hides the Admin nav link). The
  // backend enforces admin access via router-level middleware in
  // adminRoutes.js:35-41. Setting this in localStorage has zero
  // security impact — a non-admin user setting it to true just sees
  // a nav link that returns 403 on every request.
  "isAdmin",
]);

export function storeUser(data) {
  if (!data) return;
  const safe = {};
  for (const key of SAFE_KEYS) {
    if (data[key] !== undefined) safe[key] = data[key];
  }
  // Keep notificationPrefs (non-sensitive toggles) but not financial amounts
  if (data.notificationPrefs) {
    safe.notificationPrefs = {
      billReminders: data.notificationPrefs.billReminders,
      paydayReminders: data.notificationPrefs.paydayReminders,
      lowBalanceWarning: data.notificationPrefs.lowBalanceWarning,
    };
  }
  localStorage.setItem("user", JSON.stringify(safe));
}

export function clearUser() {
  localStorage.removeItem("user");
}

export function getStoredUser() {
  try { return JSON.parse(localStorage.getItem("user") || "{}"); } catch { return {}; }
}
