// Frontend observability shim. Mirror of utils/observability.js on the
// backend. Today: structured console output. When you adopt Sentry, swap
// the function bodies for Sentry.captureException / Sentry.captureMessage
// without touching call sites.

const SEVERITY = ["debug", "info", "warning", "error", "critical"];

function safeContext(context = {}) {
  // Strip sensitive keys defensively. Frontend should never log JWTs,
  // passwords, or full Stripe ids — those belong nowhere near a vendor.
  const out = {};
  for (const [k, v] of Object.entries(context)) {
    const key = k.toLowerCase();
    if (key.includes("password") || key.includes("token") || key.includes("secret")) continue;
    if (key === "authorization" || key === "cookie") continue;
    out[k] = v;
  }
  return out;
}

export function reportError(err, context = {}, severity = "error") {
  if (!SEVERITY.includes(severity)) severity = "error";
  const payload = {
    ts: new Date().toISOString(),
    severity,
    name: err?.name || "Error",
    message: err?.message || String(err),
    stack: err?.stack,
    componentStack: context?.componentStack,
    ...safeContext(context),
  };
  console.error(`[obs:${severity}]`, payload);
  // Vendor hook — replace with e.g.
  //   Sentry.captureException(err, { level: severity, contexts: { extra: safeContext(context) } });
}

export function reportEvent(name, context = {}, severity = "info") {
  if (!SEVERITY.includes(severity)) severity = "info";
  const payload = {
    ts: new Date().toISOString(),
    severity,
    event: name,
    ...safeContext(context),
  };
  const stream = (severity === "warning" || severity === "error" || severity === "critical")
    ? console.warn
    : console.log;
  stream(`[obs:${severity}]`, payload);
}
