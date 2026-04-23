// Shared currency formatter for every $ value the UI renders.
//
// Display guard: values above $999,999.99 or below -$999,999.99 display
// as "$999,999+" / "-$999,999+" to prevent layout-breaking overflow on
// cards, chips, and table cells. This is DISPLAY ONLY — the underlying
// stored value is untouched. Values outside that range are almost
// always a sign of bad data or a bug, so the cap surfaces them without
// blowing up the UI.

const MAX_SAFE = 999999.99;
const base = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export const currency = {
  format(value) {
    const n = Number(value) || 0;
    if (n > MAX_SAFE) return "$999,999+";
    if (n < -MAX_SAFE) return "-$999,999+";
    return base.format(n);
  },
};

export default currency;
