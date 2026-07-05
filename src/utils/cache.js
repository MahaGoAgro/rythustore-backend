// ── Simple in-memory cache ─────────────────────
// Reduces database load for frequently read,
// rarely changing data (crop prices, bestsellers, etc)

const cache = new Map();

/**
 * Get cached data or fetch fresh
 * @param {string} key      - Cache key
 * @param {number} ttlMs    - Time to live in milliseconds
 * @param {Function} fetchFn - Async function that returns fresh data
 */
const getCached = async (key, ttlMs, fetchFn) => {
  const cached = cache.get(key);

  if (cached && Date.now() - cached.time < ttlMs) {
    return cached.data;
  }

  const data = await fetchFn();
  cache.set(key, { data, time: Date.now() });
  return data;
};

/**
 * Invalidate a cache entry (call after data changes)
 * @param {string} key
 */
const invalidateCache = (key) => {
  cache.delete(key);
};

/**
 * Invalidate all cache entries matching a prefix
 * @param {string} prefix
 */
const invalidateCachePrefix = (prefix) => {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
};

/**
 * Clear entire cache
 */
const clearCache = () => cache.clear();

module.exports = { getCached, invalidateCache, invalidateCachePrefix, clearCache };
