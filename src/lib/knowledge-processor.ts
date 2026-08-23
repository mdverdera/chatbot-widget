/**
 * Knowledge processor — server-side only.
 *
 * Orchestrates the full document processing pipeline:
 *
 *   1. Download the file from the CMS-provided URL.
 *   2. Extract plain text (TXT / PDF / DOCX).
 *   3. Split text into overlapping chunks.
 *   4. Generate an OpenAI embedding for each chunk.
 *   5. Store vectors in the in-memory store (tenant-tagged).
 *   6. Report status back to the CMS via PATCH /api/chatbot/knowledge.
 *
 * Error handling:
 *   - Any failure after step 1 triggers a 'failed' status update to the CMS.
 *   - The function never throws — it returns a ProcessingOutcome instead.
 *
 * Tenant isolation guarantee:
 *   The tenantId is passed in from the authenticated request and stamped on
 *   every VectorEntry.  The vector store enforces tenant-scoped retrieval.
 *
 * NEVER import this module from client-side code.
 */

import { extractText } from '@/lib/text-extractor';
import { chunkText } from '@/lib/text-chunker';
import { generateEmbeddings } from '@/lib/embeddings';
import { storeVectors, deleteDocumentVectors } from '@/lib/vector-store';
import { patchKnowledgeDocument } from '@/lib/cms-client';
import type { ProcessingStatus } from '@/types/knowledge';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProcessDocumentInput {
  documentId: string;
  tenantId: string;
  fileName: string;
  downloadUrl: string;
}

export type ProcessingOutcome =
  | { status: 'completed'; chunkCount: number }
  | { status: 'failed'; error: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Download a file from a URL and return its content as a Buffer.
 * Uses the global fetch available in Node 18+ / Next.js runtime.
 */
async function downloadFile(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download document: HTTP ${response.status} from ${url}`,
    );
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Report processing status to the CMS.
 * Errors are caught and logged but never re-thrown — the caller's outcome
 * should not be masked by a status-reporting failure.
 */
async function reportStatusToCms(
  documentId: string,
  status: 'processing' | 'completed' | 'failed',
  errorMessage?: string,
): Promise<void> {
  try {
    await patchKnowledgeDocument({
      id: documentId,
      status,
      ...(errorMessage ? { error_message: errorMessage } : {}),
    });
  } catch (err) {
    console.error(
      `[knowledge-processor] Failed to PATCH status "${status}" for document ${documentId}:`,
      err,
    );
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Process a knowledge document end-to-end.
 *
 * This function is the single entry point for the ingestion pipeline.
 * It must be called after tenant authentication has been verified.
 *
 * @param input - Validated ingestion parameters (documentId, tenantId, etc.)
 * @returns     A ProcessingOutcome describing success or failure.
 */
export async function processDocument(
  input: ProcessDocumentInput,
): Promise<ProcessingOutcome> {
  const { documentId, tenantId, fileName, downloadUrl } = input;

  // ── Step 1: Mark document as 'processing' ─────────────────────────────────
  await reportStatusToCms(documentId, 'processing');

  try {
    // ── Step 2: Download file ───────────────────────────────────────────────
    let fileBuffer: Buffer;
    try {
      fileBuffer = await downloadFile(downloadUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Download failed';
      await reportStatusToCms(documentId, 'failed', msg);
      return { status: 'failed', error: msg };
    }

    // ── Step 3: Extract text ────────────────────────────────────────────────
    let extractedText: string;
    try {
      const extraction = await extractText(fileBuffer, fileName);
      extractedText = extraction.text;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Text extraction failed';
      await reportStatusToCms(documentId, 'failed', msg);
      return { status: 'failed', error: msg };
    }

    if (!extractedText.trim()) {
      const msg = 'Document contains no extractable text.';
      await reportStatusToCms(documentId, 'failed', msg);
      return { status: 'failed', error: msg };
    }

    // ── Step 4: Chunk text ──────────────────────────────────────────────────
    const chunks = chunkText(extractedText);

    if (chunks.length === 0) {
      const msg = 'Text chunking produced no chunks.';
      await reportStatusToCms(documentId, 'failed', msg);
      return { status: 'failed', error: msg };
    }

    // ── Step 5: Generate embeddings ─────────────────────────────────────────
    let embeddings: number[][];
    try {
      embeddings = await generateEmbeddings(chunks.map((c) => c.text));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Embedding generation failed';
      await reportStatusToCms(documentId, 'failed', msg);
      return { status: 'failed', error: msg };
    }

    // ── Step 6: Remove any pre-existing vectors for this document ───────────
    // Handles re-processing (e.g. document updated in CMS).
    await deleteDocumentVectors(documentId, tenantId);

    // ── Step 7: Store vectors ───────────────────────────────────────────────
    const vectorEntries = chunks.map((chunk, i) => ({
      tenantId,
      documentId,
      text:        chunk.text,
      embedding:   embeddings[i]!,
      chunkIndex:  chunk.index,
    }));

    await storeVectors(vectorEntries);

    // ── Step 8: Mark document as 'completed' ────────────────────────────────
    await reportStatusToCms(documentId, 'completed');

    console.log(
      `[knowledge-processor] Document ${documentId} (tenant: ${tenantId}) ` +
      `processed: ${chunks.length} chunks stored.`,
    );

    return { status: 'completed', chunkCount: chunks.length };

  } catch (err) {
    // Catch-all for unexpected errors.
    const msg = err instanceof Error ? err.message : 'Unexpected processing error';
    console.error(`[knowledge-processor] Unexpected error for ${documentId}:`, err);
    await reportStatusToCms(documentId, 'failed', msg);
    return { status: 'failed', error: msg };
  }
}

/**
 * Delete all knowledge vectors for a document.
 * Call this when the CMS signals a document deletion.
 *
 * @param documentId - CMS document ID.
 * @param tenantId   - Owning tenant (used for index cleanup + validation).
 * @returns          Number of vector chunks removed.
 */
export async function removeDocumentKnowledge(
  documentId: string,
  tenantId: string,
): Promise<number> {
  return deleteDocumentVectors(documentId, tenantId);
}

/**
 * Derive a human-readable status label for logging.
 * Not used in logic — only for diagnostics.
 */
export function describeStatus(status: ProcessingStatus): string {
  const labels: Record<ProcessingStatus, string> = {
    pending:    'Pending',
    processing: 'Processing',
    completed:  'Completed',
    failed:     'Failed',
  };
  return labels[status];
}
