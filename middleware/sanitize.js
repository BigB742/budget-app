// Strip MongoDB query operators from req.body and req.params to neutralize
// NoSQL injection. Recursively walks the object tree and deletes any key
// that starts with `$` (a Mongo operator) or contains `.` (a dotted-path
// injection). The cleaned values are written back in place.
//
// Defense in depth: Mongoose schema casting catches most injection attempts
// when the target field has a primitive type, but routes that build queries
// from req.body string fields would otherwise allow `email: { $gt: "" }`
// style auth bypass. This middleware closes that door before any route
// handler runs.
//
// req.query is intentionally NOT touched. Express 5 makes req.query a
// non-configurable getter, and our routes destructure query strings as
// scalars rather than passing them straight to Mongo queries.

// Keys we always reject:
//   - starts with `$`  → MongoDB query operator
//   - contains `.`     → dotted-path injection
//   - __proto__ / constructor / prototype → prototype pollution
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function stripOperators(obj) {
  // Skip null/primitive, arrays, and Buffers (the Stripe webhook hits this
  // middleware with req.body as a Buffer; iterating its byte indices would
  // be a hot CPU loop on every request).
  if (!obj || typeof obj !== "object" || Array.isArray(obj) || Buffer.isBuffer(obj)) return;
  for (const key of Object.keys(obj)) {
    if (key.startsWith("$") || key.includes(".") || FORBIDDEN_KEYS.has(key)) {
      delete obj[key];
      continue;
    }
    const value = obj[key];
    if (value && typeof value === "object") stripOperators(value);
  }
}

const sanitizeRequest = (req, _res, next) => {
  if (req.body) stripOperators(req.body);
  if (req.params) stripOperators(req.params);
  next();
};

module.exports = { sanitizeRequest };
