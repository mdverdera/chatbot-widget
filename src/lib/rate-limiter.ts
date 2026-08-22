/**
 * In-memory sliding-window rate limiter — server-side only.
 *
 * Protects the chat API from abuse without requiring Redis or an external
 * store in Phase 3.  Each "key" gets a fixed quota of requests per window.
 *
 * Phase 4+: replace with an edge-compatible store (Upstash Redis, etc.)
 * when deploying to a serverless/edge environment.
 *
 * NEVER import this module from client-side code.
 */

interface RateLimitEntry {
  /** Request timestamps within the current window (ms). */
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// ── Periodic cleanup ──────────────────────────────────────────────────────────
// Remove stale entries every 5 minutes to avoid unbounded memory growth.
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

function pruneStore(windowMs: number): void {
  const cutoff = Date.now() - windowMs;
  for (const [key, entry] of store.entries()) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}

// Run cleanup in the background (only in a Node.js server process).
if (typeof setInterval !== 'undefined') {
  setInterval(() => pruneStore(CLEANUP_INTERVAL_MS), CLEANUP_INTERVAL_MS).unref?.();
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface RateLimitResult {
  /** Whether the request is within the allowed quota. */
  allowed: boolean;
  /** Number of requests remaining in the current window. */
  remaining: number;
  /** Seconds until the oldest request falls out of the window. */
  retryAfterSeconds: number;
}

/**
 * Check and record a request against a rate-limit key.
 *
 * @param key       - Unique identifier for the rate-limit bucket (e.g. IP or widgetId).
 * @param limit     - Maximum number of requests allowed per window.
 * @param windowMs  - Size of the sliding window in milliseconds.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Slide the window: drop requests older than the window
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= limit) {
    const oldest = entry.timestamps[0]!;
    const retryAfterSeconds = Math.ceil((oldest + windowMs - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  entry.timestamps.push(now);
  const remaining = limit - entry.timestamps.length;
  return { allowed: true, remaining, retryAfterSeconds: 0 };
}
