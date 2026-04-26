// ─────────────────────────────────────────────────────────────────────────────
// PayPulse application-timezone utilities.
//
// PayPulse pins every server-side calendar-day calculation to
// America/Los_Angeles. Vercel runs in UTC, so unguarded `new Date()` and
// raw `getFullYear/Month/Date()` calls leak UTC into pay-period math —
// flipping period boundaries a calendar day early for users west of UTC
// and shifting onboardingDate by a day for evening-LA stamps. This module
// is the single source of truth for "what LA day is this instant" so
// every consumer (financeEngine, summaryRoutes, userRoutes/onboarding)
// goes through the same path.
//
// The functions return Date objects whose **server-local** y/m/d
// components match the LA calendar y/m/d at the relevant instant. That
// shape is what the rest of the engine compares against (it does its
// equality and < / > checks via getTime()), so once every reader uses
// these helpers the comparisons line up regardless of where the server
// clock actually is.
// ─────────────────────────────────────────────────────────────────────────────

const APP_TZ = "America/Los_Angeles";

// Cache the formatter — Intl.DateTimeFormat construction is non-trivial.
const _ymdFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function _ymdPartsInAppTz(instant) {
  const parts = _ymdFormatter.formatToParts(instant);
  const y = Number(parts.find((p) => p.type === "year").value);
  const m = Number(parts.find((p) => p.type === "month").value);
  const d = Number(parts.find((p) => p.type === "day").value);
  return { y, m, d };
}

/**
 * Today's LA calendar date as a Date at server-local-midnight of (y/m/d
 * = LA today). Read this when the question is "what date is it for the
 * user right now."
 */
function todayInAppTz() {
  const { y, m, d } = _ymdPartsInAppTz(new Date());
  return new Date(y, m - 1, d);
}

/**
 * The LA calendar date for any input instant. Use for fields stored as
 * a wall-clock timestamp (e.g. onboardingDate written via `new Date()`
 * at request time). For Mongo date-only fields stored as UTC midnight,
 * compose with `toLocalDate` from paycheckUtils first to recover the
 * intended calendar date, then pass through here as a no-op safety
 * normalization.
 *
 * @param {Date|string|number} input
 * @returns {Date} server-local-midnight Date with the LA y/m/d.
 */
function startOfDayInAppTz(input) {
  if (input == null) return null;
  const dt = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(dt.getTime())) return null;
  const { y, m, d } = _ymdPartsInAppTz(dt);
  return new Date(y, m - 1, d);
}

/**
 * Build a Date from already-LA y/m/d components. Tiny convenience used
 * when the y/m/d came from elsewhere (e.g. UTC-component recovery via
 * paycheckUtils.toLocalDate, or a YYYY-MM-DD client param).
 *
 * @returns {Date} server-local-midnight Date with the supplied y/m/d.
 */
function startOfDayFromYMD(year, month, day) {
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return null;
  }
  return new Date(year, month - 1, day);
}

module.exports = {
  APP_TZ,
  todayInAppTz,
  startOfDayInAppTz,
  startOfDayFromYMD,
};
