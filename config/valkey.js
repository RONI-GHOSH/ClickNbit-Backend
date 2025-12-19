const Redis = require("ioredis");

const isProd = process.env.NODE_ENV === "production";

const valkey = new Redis({
  host: process.env.VALKEY_HOST,
  port: Number(process.env.VALKEY_PORT || 6379),
  password: process.env.VALKEY_PASSWORD || undefined,

  // ---- Production-safe settings ----
  maxRetriesPerRequest: 2,
  enableOfflineQueue: false,
  lazyConnect: true,

  retryStrategy(times) {
    return Math.min(times * 50, 2000);
  },
});

valkey.on("connect", () => {
  console.log("✅ Valkey connected");
});

valkey.on("error", (err) => {
  console.error("❌ Valkey error:", err.message);
});

module.exports = {
  valkey,
};
