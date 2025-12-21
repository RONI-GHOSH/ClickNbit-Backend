// config/valkey.js
const Redis = require("ioredis");

let redis;

function getRedis() {
  if (!redis) {
    const serviceUrl=process.env.VALKEY_SERVICE_URL;
    redis = new Redis(serviceUrl);
    // redis = new Redis({
    //   host: process.env.VALKEY_HOST,
    //   port: Number(process.env.VALKEY_PORT || 6379),
    //   password: process.env.VALKEY_PASSWORD,

    //   lazyConnect: true,
    //   enableOfflineQueue: false,
    //   maxRetriesPerRequest: 1,

    //   retryStrategy: () => null, // important for Lambda
    // });

    redis.on("connect", () => console.log("✅ Valkey connected"));
    redis.on("close", () => console.warn("⚠️ Valkey connection closed"));
    redis.on("error", (e) => console.error("❌ Valkey error:", e.message));
  }

  return redis;
}

async function ensureRedis() {
  const r = getRedis();

  if (r.status === "end" || r.status === "close") {
    await r.connect();
  }

  return r;
}

module.exports = { ensureRedis };
