/**
 * Processing queue — server-side only.
 *
 * A lightweight in-process deduplication lock that prevents the same document
 * from being processed concurrently by both the push notification handler
 * (POST /api/process) and the background poller.
 *
 * Why this matters:
 *   The CMS sends a push immediately after upload.  The poller also runs every
 *   N minutes and fetches all pending documents.  Without a lock, a document
 *   that arrives just before a poll cycle would be processed twice — wasting
 *   OpenAI API calls and briefly leaving stale vectors.
 *
 * Design:
 *   - A Set<string> of documentIds currently being processed.
 *   - `enqueue()` atomically checks-and-inserts (single-threaded Node.js).
 *   - The caller owns the lock and must call `release()` when done,
 *     even on error.
 *
 * This is intentionally minimal — no persistence, no retry queue.
 * Documents that fail are marked 'failed' on the CMS; the next poll cycle
 * will not re-pick them (they're no longer 'pending').
 *
 * NEVER import this module from client-side code.
 */

import { processDocument } from '@/lib/knowledge-processor';
import { fetchDocumentById } from '@/lib/cms-client';
import type { KnowledgeDocument } from '@/lib/cms-client';

// ── Dedup lock ────────────────────────────────────────────────────────────────

/** Set of documentIds currently being processed. */
const inFlight = new Set<string>();

/**
 * Attempt to claim a processing slot for `documentId`.
 * Returns `true` if the claim succeeded (caller may proceed).
 * Returns `false` if already in-flight (caller should skip).
 */
export function tryLock(documentId: string): boolean {
  if (inFlight.has(documentId)) return false;
  inFlight.add(documentId);
  return true;
}

/** Release the processing slot for `documentId`. */
export function releaseLock(documentId: string): void {
  inFlight.delete(documentId);
}

/** Returns true if the document is currently being processed. */
export function isInFlight(documentId: string): boolean {
  return inFlight.has(documentId);
}

// ── Background dispatcher ─────────────────────────────────────────────────────

/**
 * Kick off background processing for a known document.
 * The caller already has the `document` object (from the push payload or a
 * prior CMS fetch).
 *
 * Acquires the dedup lock, then fires the pipeline in a detached promise.
 * Returns immediately — safe to call from inside an API route handler.
 *
 * @param document - The CMS KnowledgeDocument to process.
 */
export function dispatchProcessing(document: KnowledgeDocument): void {
  if (!tryLock(document.id)) {
    console.log(
      `[processing-queue] Document ${document.id} already in-flight — skipping duplicate dispatch.`,
    );
    return;
  }

  // Fire and forget — detach from the request lifecycle.
  setImmediate(() => {
    _runPipeline(document).catch((err) => {
      // Catch-all safety net — processDocument itself never throws,
      // but guard against any unexpected error in the wrapper.
      console.error(`[processing-queue] Unhandled error for document ${document.id}:`, err);
      releaseLock(document.id);
    });
  });
}

/**
 * Kick off background processing given only a documentId.
 * Fetches the document from the CMS first (to get the download_url).
 * Acquires the dedup lock before fetching to avoid races.
 *
 * @param documentId - The CMS document ID.
 * @param tenantId   - The owning tenant (from the verified push payload).
 */
export function dispatchById(documentId: string, tenantId: string): void {
  if (!tryLock(documentId)) {
    console.log(
      `[processing-queue] Document ${documentId} already in-flight — skipping duplicate dispatch.`,
    );
    return;
  }

  setImmediate(() => {
    _fetchAndRun(documentId, tenantId).catch((err) => {
      console.error(`[processing-queue] Unhandled error for document ${documentId}:`, err);
      releaseLock(documentId);
    });
  });
}

// ── Internal pipeline runners ─────────────────────────────────────────────────

async function _runPipeline(document: KnowledgeDocument): Promise<void> {
  try {
    if (!document.download_url) {
      console.error(
        `[processing-queue] Document ${document.id} has no download_url — cannot process.`,
      );
      return;
    }

    await processDocument({
      documentId:  document.id,
      tenantId:    document.tenant_id,
      fileName:    document.file_name,
      downloadUrl: document.download_url,
    });
  } finally {
    releaseLock(document.id);
  }
}

async function _fetchAndRun(documentId: string, tenantId: string): Promise<void> {
  try {
    let document: KnowledgeDocument | null;
    try {
      document = await fetchDocumentById(documentId);
    } catch (err) {
      console.error(
        `[processing-queue] Failed to fetch document ${documentId} from CMS:`, err,
      );
      return;
    }

    if (!document) {
      console.warn(
        `[processing-queue] Document ${documentId} not found on CMS — skipping.`,
      );
      return;
    }

    // If the CMS returned it but it's no longer pending, another process may
    // have already claimed it (e.g. a concurrent poll cycle on another replica).
    if (document.status !== 'pending') {
      console.log(
        `[processing-queue] Document ${documentId} is already "${document.status}" — skipping.`,
      );
      return;
    }

    // Prefer the tenantId from the CMS document (authoritative).
    // Fall back to the push-provided tenantId if the doc came back without one.
    const effectiveTenantId = document.tenant_id || tenantId;

    await processDocument({
      documentId:  document.id,
      tenantId:    effectiveTenantId,
      fileName:    document.file_name,
      downloadUrl: document.download_url ?? '',
    });
  } finally {
    releaseLock(documentId);
  }
}
