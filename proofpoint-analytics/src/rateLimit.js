/**
 * rateLimit.js — KV-backed rate limiter.
 *
 * Slot-based fixed window: the KV key encodes the IP and the current
 * 60-second time slot, so windows rotate naturally without resetting the
 * TTL on every write. Keys expire after 2 windows so Cloudflare cleans
 * them up automatically.
 *
 * @param {string} ip  - Client IP address.
 * @param {number} max - Max requests allowed per 60-second window.
 * @param {KVNamespace} kv - The bound Cloudflare KV namespace.
 * @returns {Promise<boolean>} true if the request should be rejected.
 */

const WINDOW_SECS = 60;

export async function isRateLimited(ip, max, kv) {
  const slot = Math.floor(Date.now() / (WINDOW_SECS * 1000));
  const key = `rl:${ip}:${slot}`;

  const raw = await kv.get(key);
  const count = raw ? parseInt(raw, 10) : 0;

  if (count >= max) return true;

  await kv.put(key, String(count + 1), { expirationTtl: WINDOW_SECS * 2 });
  return false;
}
