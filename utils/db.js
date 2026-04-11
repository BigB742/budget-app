// utils/db.js — MongoDB connection singleton for Vercel serverless
//
// On Vercel, each function invocation may spin up a new Node process (cold start).
// Without caching, every request opens a brand-new Mongoose connection and the
// operation times out before it finishes — causing:
//   MongooseError: Operation buffering timed out after 10000ms
//
// Fix: store the connection (and its in-progress promise) on the Node.js `global`
// object, which persists across invocations of the SAME warm instance. On cold
// starts, a fresh connection is created and cached. Subsequent requests within
// the same instance reuse it immediately.

const mongoose = require("mongoose");

// Reuse connection across hot invocations
let cached = global.__mongooseCache;
if (!cached) {
  cached = global.__mongooseCache = { conn: null, promise: null };
}

async function connectDB() {
  // Already connected — return immediately
  if (cached.conn) {
    return cached.conn;
  }

  // Connection attempt already in progress — wait for it
  if (!cached.promise) {
    cached.promise = mongoose
      .connect(process.env.MONGO_URI, {
        // Don't buffer Model operations while disconnected — fail fast so
        // the middleware can return a 503 instead of hanging for 10 s.
        bufferCommands: false,
      })
      .then((m) => {
        console.log("[DB] MongoDB connected (new connection)");
        return m;
      })
      .catch((err) => {
        console.error("[DB] MongoDB connection failed:", err.message);
        // Clear promise so the next request can retry rather than re-throwing
        // a stale rejected promise forever.
        cached.promise = null;
        throw err;
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

module.exports = { connectDB };
