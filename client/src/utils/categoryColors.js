// Single source of truth for category colors across every chart, legend,
// calendar entry dot, and expense row indicator in the app. If you need
// to recolor a category, update it HERE — nowhere else.
//
// Every category has a distinct hue so the donut chart legend reads as a
// clean rainbow with no two adjacent slices colliding. Savings is the
// only category that uses the brand teal; teal is reserved for savings /
// positive signals everywhere else in the app.

export const CATEGORY_COLORS = {
  Food:            "#FB7185", // coral-red
  Shopping:        "#3B82F6", // blue
  Transportation:  "#F59E0B", // amber
  Bills:           "#7C3AED", // purple
  Entertainment:   "#D946EF", // magenta
  Savings:         "#00C9A7", // brand teal — reserved for savings/positive only
  Subscriptions:   "#6366F1", // indigo
  Health:          "#10B981", // green
  Education:       "#F97316", // orange
  Travel:          "#06B6D4", // cyan
  Gas:             "#FBBF24", // yellow
  Groceries:       "#84CC16", // lime
  Gym:             "#EC4899", // pink
  Home:            "#92400E", // brown-tan
  "Dining Out":    "#EF4444", // warm red
  Other:           "#6B7280", // gray
  // Payment Plans category lives here so the donut chart can render it
  // with a distinct lavender that doesn't collide with anything above.
  "Payment Plans": "#A78BFA", // lavender
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
