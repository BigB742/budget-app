// Lightweight observability shim. Today: structured console logging.
// When you adopt Sentry / Datadog / etc., replace the body of these
// functions — every call site already passes the right shape, so the
// integration is a single-file change.
//
// Why a shim instead of `Sentry.captureException` directly:
//   - Lets us swap vendors without touching every call site.
//   - Lets local dev work without a DSN configured.
//   - Lets tests assert "an error was reported" without mocking a vendor.
//
// SECURITY: never include passwords, JWTs, Stripe customer IDs, or full
// request bodies in `context` — vendors index everything they receive
// and a vendor breach would expose this.

const SEVERITY = ["debug", "info", "warning", "error", "critical"];

function safeContext(context = {}) {
  // Strip known-sensitive keys defensively in case a caller forgets.
  const out = {};
  for (const [k, v] of Object.entries(context)) {
    const key = k.toLowerCase();
    if (key.includes("password") || key.includes("token") || key.includes("secret")) continue;
    if (key === "authorization" || key === "cookie") continue;
    out[k] = v;
  }
  return out;
}

function timestamp() { return new Date().toISOString(); }

function reportError(err, context = {}, severity = "error") {
  if (!SEVERITY.includes(severity)) severity = "error";
  const payload = {
    ts: timestamp(),
    severity,
    name: err?.name || "Error",
    message: err?.message || String(err),
    stack: err?.stack,
    ...safeContext(context),
  };
  console.error(`[obs:${severity}]`, JSON.stringify(payload));
  // Vendor hook — replace this with e.g.
  //   Sentry.captureException(err, { level: severity, extra: safeContext(context) });
}

function reportEvent(name, context = {}, severity = "info") {
  if (!SEVERITY.includes(severity)) severity = "info";
  const payload = {
    ts: timestamp(),
    severity,
    event: name,
    ...safeContext(context),
  };
  // info/debug -> stdout; warning/error/critical -> stderr.
  const stream = (severity === "warning" || severity === "error" || severity === "critical")
    ? console.warn
    : console.log;
  stream(`[obs:${severity}]`, JSON.stringify(payload));
  // Vendor hook — replace with e.g.
  //   Sentry.captureMessage(name, { level: severity, extra: safeContext(context) });
}

module.exports = { reportError, reportEvent };
