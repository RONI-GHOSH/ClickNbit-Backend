// cache/cache.js
const { ensureRedis } = require("../config/valkey");

async function getCache(key) {
  try {
    const redis = await ensureRedis();
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.warn("⚠️ Cache GET skipped:", err.message);
    return null;
  }
}

async function setCache(key, value, ttl = 60) {
  try {
    const redis = await ensureRedis();
    await redis.set(key, JSON.stringify(value), "EX", ttl);
  } catch (err) {
    console.warn("⚠️ Cache SET skipped:", err.message);
  }
}
async function deleteCache(key) {
   try {
  const redis = await ensureRedis();
  await redis.del(key);
  } catch (err) {
    console.warn("⚠️ Cache SET skipped:", err.message);
  }
}

module.exports = { getCache, setCache, deleteCache };


