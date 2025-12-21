const { ensureRedis } = require("../config/valkey");

async function getCache(key) {
  const redis = await ensureRedis();
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
}

async function setCache(key, value, ttl = 60) {
  const redis = await ensureRedis();
  await redis.set(key, JSON.stringify(value), "EX", ttl);
}

async function deleteCache(key) {
  const redis = await ensureRedis();
  await redis.del(key);
}

module.exports = {
  getCache,
  setCache,
  deleteCache,
};

