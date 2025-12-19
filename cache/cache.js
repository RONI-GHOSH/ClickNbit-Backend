const { valkey } = require("../config/valkey");

async function getCache(key) {
  const data = await valkey.get(key);
  return data ? JSON.parse(data) : null;
}

async function setCache(key, value, ttl = 60) {
  await valkey.set(
    key,
    JSON.stringify(value),
    "EX",
    ttl
  );
}

async function deleteCache(key) {
  await valkey.del(key);
}

module.exports = {
  getCache,
  setCache,
  deleteCache,
};
