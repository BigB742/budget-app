// Single source of truth for category colors across every chart, legend,
// calendar entry dot, and expense row indicator in the app. If you need
// to recolor a category, update it HERE — nowhere else.
//
// Order matters: this is the display/legend order when we render a full
// legend. Savings is intentionally the only category that uses the brand
// teal (teal is reserved for savings/positive signals everywhere else).

export const CATEGORY_COLORS = {
  Shopping:       "#3B82F6", // medium blue
  Savings:        "#00C9A7", // brand teal — reserved for savings/positive only
  Bills:          "#E53935", // red
  Subscriptions:  "#7C3AED", // purple
  "Dining Out":   "#F97316", // orange
  Groceries:      "#84CC16", // lime green
  Gas:            "#F59E0B", // amber
  Health:         "#EC4899", // pink
  Gym:            "#06B6D4", // cyan
  Entertainment:  "#6366F1", // indigo
  Travel:         "#0EA5E9", // sky blue
  Home:           "#92400E", // warm brown
  Food:           "#FB7185", // coral
  Other:          "#6B7280", // gray
  // Payment Plans category lives here so the donut chart can render it
  // with a distinct lavender that doesn't collide with anything above.
  "Payment Plans": "#A78BFA",
};

// Fallback for a category name we've never seen before. Deterministic by
// name hash so the same category always gets the same color across loads.
const FALLBACK_PALETTE = [
  "#3B82F6", "#00C9A7", "#E53935", "#7C3AED", "#F97316",
  "#84CC16", "#F59E0B", "#EC4899", "#06B6D4", "#6366F1",
  "#0EA5E9", "#92400E", "#FB7185", "#A78BFA",
];

const hashColor = (name) => {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  }
  return FALLBACK_PALETTE[Math.abs(h) % FALLBACK_PALETTE.length];
};

export const getCategoryColor = (name) => {
  if (!name) return CATEGORY_COLORS.Other;
  return CATEGORY_COLORS[name] || hashColor(String(name));
};

// Ordered list used when the UI wants to render every category in its
// canonical display order (e.g. legend with all-categories pinned).
export const CATEGORY_ORDER = Object.keys(CATEGORY_COLORS);

// The teal used for positive/income indicators — matches Savings so
// savings deposits on the calendar look like money staying in-family.
export const POSITIVE_TEAL = "#00C9A7";

// The bills red used for money-going-out indicators.
export const BILLS_RED = "#E53935";
