import {
  addDays,
  endOfDay,
  format,
  isAfter,
  isBefore,
  isSameDay,
  parseISO,
  startOfDay,
} from "date-fns";

/**
 * Parse a YYYY-MM-DD date-only string as LOCAL midnight. Never use
 * `new Date("YYYY-MM-DD")` — that parses as UTC and pushes a user in
 * UTC-negative zones to the previous calendar day.
 */
export const parseDateOnly = (s) => {
  if (!s) return null;
  if (s instanceof Date) return s;
  return new Date(`${String(s).slice(0, 10)}T00:00:00`);
};

/** Format a Date (or YYYY-MM-DD string) as YYYY-MM-DD in local tz. */
export const toDateOnly = (d) => {
  if (!d) return "";
  if (typeof d === "string") return d.slice(0, 10);
  return format(d, "yyyy-MM-dd");
};

/** Local midnight of today. */
export const todayLocal = () => startOfDay(new Date());

/** True iff `d` represents the local calendar day equal to today. */
export const isToday = (d) => {
  const target = typeof d === "string" ? parseDateOnly(d) : d;
  if (!target) return false;
  return isSameDay(target, todayLocal());
};

/** True iff `d` is today or in the past (date-only comparison). */
export const isDueTodayOrPast = (d) => {
  const target = typeof d === "string" ? parseDateOnly(d) : startOfDay(d);
  if (!target) return false;
  return !isAfter(target, todayLocal());
};

/** True iff `d` is strictly after today (date-only comparison). */
export const isFuture = (d) => {
  const target = typeof d === "string" ? parseDateOnly(d) : startOfDay(d);
  if (!target) return false;
  return isAfter(target, todayLocal());
};

export {
  addDays,
  endOfDay,
  format,
  isAfter,
  isBefore,
  isSameDay,
  parseISO,
  startOfDay,
};
