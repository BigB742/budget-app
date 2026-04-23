// Server-side date utilities. Mirror of client/src/lib/date.js so the
// API boundary speaks the same date-only grammar as the client.
//
// Store dates that represent a calendar day as either YYYY-MM-DD strings
// OR as a Date at local midnight — whichever the existing schema uses.
// This module does NOT change the storage format; it only provides
// correct parse/compare/format helpers so we stop introducing the UTC
// off-by-one trap via `new Date("YYYY-MM-DD")`.

const {
  addDays,
  endOfDay,
  format,
  isAfter,
  isBefore,
  isSameDay,
  parseISO,
  startOfDay,
} = require("date-fns");

/** Parse a YYYY-MM-DD string as LOCAL midnight. Never UTC. */
function parseDateOnly(s) {
  if (!s) return null;
  if (s instanceof Date) return s;
  return new Date(`${String(s).slice(0, 10)}T00:00:00`);
}

/**
 * Parse a YYYY-MM-DD string as LOCAL noon. Historical server code stored
 * date-only values as noon to dodge UTC/DST edge cases; preserve that
 * helper so existing writers can migrate without changing payload shape.
 */
function parseDateOnlyNoon(s) {
  if (!s) return null;
  if (s instanceof Date) return s;
  return new Date(`${String(s).slice(0, 10)}T12:00:00`);
}

/** Format a Date (or ISO string) as YYYY-MM-DD in local tz. */
function toDateOnly(d) {
  if (!d) return "";
  if (typeof d === "string") return d.slice(0, 10);
  return format(d, "yyyy-MM-dd");
}

/** Local midnight of today. */
function todayLocal() {
  return startOfDay(new Date());
}

function isSameLocalDay(a, b) {
  if (!a || !b) return false;
  return isSameDay(
    typeof a === "string" ? parseDateOnly(a) : a,
    typeof b === "string" ? parseDateOnly(b) : b,
  );
}

function isToday(d) {
  const target = typeof d === "string" ? parseDateOnly(d) : d;
  if (!target) return false;
  return isSameDay(target, todayLocal());
}

function isDueTodayOrPast(d) {
  const target = typeof d === "string" ? parseDateOnly(d) : startOfDay(d);
  if (!target) return false;
  return !isAfter(target, todayLocal());
}

function isFuture(d) {
  const target = typeof d === "string" ? parseDateOnly(d) : startOfDay(d);
  if (!target) return false;
  return isAfter(target, todayLocal());
}

module.exports = {
  addDays,
  endOfDay,
  format,
  isAfter,
  isBefore,
  isSameDay,
  parseISO,
  startOfDay,
  parseDateOnly,
  parseDateOnlyNoon,
  toDateOnly,
  todayLocal,
  isSameLocalDay,
  isToday,
  isDueTodayOrPast,
  isFuture,
};
