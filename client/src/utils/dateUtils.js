export function parseLocalDateString(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function stripTime(input) {
  if (!input) return input;
  const date =
    typeof input === "string" ? parseLocalDateString(input.slice(0, 10)) : new Date(input);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
