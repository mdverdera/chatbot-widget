/**
 * Poll scheduler — server-side only.
 *
 * A singleton background job that periodically fetches all 'pending' documents
 * from the CMS and processes any that the push notification missed.
 *
 * This covers the gap where:
 *   - The chatbot service was down when the CMS uploaded a document.
 *   - A push notification was lost due to a network error.
 *   - A document was re-queued on the CMS after a processing failure.
 *
 * Configuration:
 *   POLL_INTERVAL_MINUTES — interval between polls (default: 5).
 *                           Set to 0 to disable polling entirely.
 *
 * Lifecycle:
 *   `ensureSchedulerRunning()` is idempotent — safe to call on every
 *   API request.  The interval starts on the first call and is never
 *   duplicated.  It is unref()'d so it does not prevent process exit.
 *
 * NEVER import this module from client-side code.
 * NEVER call this from browser-side React components.
 */

import { fetchKnowledgeDocuments } from '@/lib/cms-client';
import { dispatchProcessing, isInFlight } from '@/lib/processing-queue';

// ── Config ────────────────────────────────────────────────────────────────────

const DEFAULT_POLL_INTERVAL_MINUTES = 5;

function getPollIntervalMs(): number {
  const raw = process.env.POLL_INTERVAL_MINUTES;
  if (!raw) return DEFAULT_POLL_INTERVAL_MINUTES * 60 * 1000;
  const n = parseFloat(raw);
  if (isNaN(n) || n < 0) {
    console.warn(
      `[poll-scheduler] Invalid POLL_INTERVAL_MINUTES="${raw}" — using default ${DEFAULT_POLL_INTERVAL_MINUTES}m.`,
    );
    return DEFAULT_POLL_INTERVAL_MINUTES * 60 * 1000;
  }
  return n * 60 * 1000;
}

// ── Singleton state ───────────────────────────────────────────────────────────

let _started = false;

// ── Poll cycle ────────────────────────────────────────────────────────────────

/**
 * Run one poll cycle: fetch all pending documents from the CMS and dispatch
 * any that are not already being processed.
 */
async function runPollCycle(): Promise<void> {
  console.log('[poll-scheduler] Running poll cycle…');

  let documents;
  try {
    documents = await fetchKnowledgeDocuments('pending', 200);
  } catch (err) {
    console.error('[poll-scheduler] Failed to fetch pending documents:', err);
    return;
  }

  if (documents.length === 0) {
    console.log('[poll-scheduler] No pending documents found.');
    return;
  }

  console.log(`[poll-scheduler] Found ${documents.length} pending document(s).`);

  let dispatched = 0;
  for (const doc of documents) {
    if (!doc.download_url) {
      console.warn(
        `[poll-scheduler] Document ${doc.id} has no download_url — skipping.`,
      );
      continue;
    }

    if (isInFlight(doc.id)) {
      console.log(
        `[poll-scheduler] Document ${doc.id} already in-flight — skipping.`,
      );
      continue;
    }

    dispatchProcessing(doc);
    dispatched++;
  }

  console.log(
    `[poll-scheduler] Dispatched ${dispatched}/${documents.length} document(s).`,
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Start the background poll scheduler if it isn't already running.
 * Idempotent — safe to call multiple times (e.g. on every API request in dev).
 *
 * Call this from any long-lived server-side entry point (e.g. an API route
 * that is always hit on startup, or a Next.js instrumentation file).
 */
export function ensureSchedulerRunning(): void {
  if (_started) return;

  const intervalMs = getPollIntervalMs();

  if (intervalMs === 0) {
    console.log('[poll-scheduler] Polling disabled (POLL_INTERVAL_MINUTES=0).');
    _started = true;
    return;
  }

  // Run the first poll soon after startup (10 s delay to let the server warm up).
  const startupDelay = 10_000;
  setTimeout(() => {
    runPollCycle().catch((err) =>
      console.error('[poll-scheduler] Startup poll error:', err),
    );
  }, startupDelay);

  // Then repeat at the configured interval.
  const timer = setInterval(() => {
    runPollCycle().catch((err) =>
      console.error('[poll-scheduler] Poll cycle error:', err),
    );
  }, intervalMs);

  // Unref so the interval doesn't keep the process alive during graceful shutdown.
  timer.unref?.();

  _started = true;
  console.log(
    `[poll-scheduler] Started — interval: ${intervalMs / 1000}s, startup delay: ${startupDelay / 1000}s.`,
  );
}
