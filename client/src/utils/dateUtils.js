// Parse a date string (YYYY-MM-DD or ISO) as LOCAL date, avoiding UTC timezone shift.
// "2026-01-27" → Jan 27 local (not Jan 26 due to UTC midnight in western timezones)
export function parseLocalDate(input) {
  if (!input) return null;
  const str = typeof input === "string" ? input : (input.toISOString ? input.toISOString() : String(input));
  const dateStr = str.slice(0, 10);
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

// Legacy alias
export function parseLocalDateString(dateString) {
  return parseLocalDate(dateString);
}

export function stripTime(input) {
  if (!input) return input;
  const date = typeof input === "string" ? parseLocalDate(input) : new Date(input);
  if (!date) return input;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// Format a date (string or Date) to readable local format like "Jan 27, 2026"
export function formatDate(input) {
  const d = parseLocalDate(input);
  if (!d) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Format to YYYY-MM-DD string for API/inputs
export function toDateKey(input) {
  if (!input) return "";
  const d = typeof input === "string" ? parseLocalDate(input) : input;
  if (!d || isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
