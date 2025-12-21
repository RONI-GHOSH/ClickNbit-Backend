const Redis = require("ioredis");

let valkey;

function createRedis() {
  if (!valkey) {
    valkey = new Redis({
      host: process.env.VALKEY_HOST,
      port: Number(process.env.VALKEY_PORT || 6379),
      password: process.env.VALKEY_PASSWORD,

      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 2,

      retryStrategy(times) {
        return Math.min(times * 100, 2000);
      },
    });

    valkey.on("connect", () => {
      console.log("✅ Valkey connected");
    });

    valkey.on("error", (err) => {
      console.error("❌ Valkey error:", err.message);
    });
  }

  return valkey;
}

async function ensureRedis() {
  const redis = createRedis();
  if (redis.status !== "ready") {
    await redis.connect();
  }
  return redis;
}

module.exports = { ensureRedis };

