/**
 * Shared TypeScript types for Phase 4B: AI Knowledge Processing.
 *
 * These types are used across the knowledge ingestion pipeline, vector store,
 * and retrieval API.  Server-side only — never import from client components.
 */

// ── Processing status ─────────────────────────────────────────────────────────

/** Mirrors the CMS-side document processing lifecycle. */
export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';

// ── Document ingestion ────────────────────────────────────────────────────────

/** Supported file types for text extraction. */
export type SupportedFileType = 'txt' | 'pdf' | 'docx';

/**
 * Payload the CMS POSTs to /api/knowledge/ingest.
 * The CMS authenticates using CMS_API_SECRET (Bearer token).
 */
export interface IngestDocumentRequest {
  /** Unique identifier of the document in the CMS. */
  documentId: string;
  /** Tenant that owns this document. Stored on every vector chunk. */
  tenantId: string;
  /** Human-readable document title. */
  title: string;
  /** Original file name including extension (used to determine file type). */
  fileName: string;
  /**
   * Signed download URL for the file content.
   * The chatbot fetches the file from this URL during processing.
   */
  downloadUrl: string;
}

/** Response returned by POST /api/knowledge/ingest. */
export interface IngestDocumentResponse {
  /** Echo of the CMS document ID. */
  documentId: string;
  /** Current processing status after the synchronous phase. */
  status: ProcessingStatus;
  /** Number of vector chunks stored (available when status = 'completed'). */
  chunkCount?: number;
}

// ── Text extraction ───────────────────────────────────────────────────────────

/** Result of extracting text from a file. */
export interface ExtractionResult {
  /** Full plain text extracted from the document. */
  text: string;
  /** Detected or inferred file type. */
  fileType: SupportedFileType;
}

// ── Text chunking ─────────────────────────────────────────────────────────────

/** A single chunk of extracted text ready for embedding. */
export interface TextChunk {
  /** Zero-based index of the chunk within the document. */
  index: number;
  /** The chunk text. */
  text: string;
  /** Approximate token count (character-based estimate: chars / 4). */
  tokenEstimate: number;
}

// ── Vector storage ────────────────────────────────────────────────────────────

/**
 * A vector entry stored in the in-memory vector store.
 * Every entry is tagged with tenantId and documentId to enforce isolation.
 */
export interface VectorEntry {
  /** Unique identifier for this vector chunk. */
  id: string;
  /** Tenant that owns this vector.  MUST be used in every query filter. */
  tenantId: string;
  /** CMS document this chunk belongs to. Used for deletion. */
  documentId: string;
  /** The original chunk text (returned as context for RAG). */
  text: string;
  /** The embedding vector. */
  embedding: number[];
  /** Zero-based chunk index within the document. */
  chunkIndex: number;
  /** When this entry was stored (epoch ms). */
  storedAt: number;
}

// ── Knowledge retrieval ───────────────────────────────────────────────────────

/**
 * Payload for POST /api/knowledge/retrieve.
 * Internal endpoint — called by the chat message handler.
 */
export interface RetrieveKnowledgeRequest {
  /** The tenant to search within.  Cross-tenant search is never performed. */
  tenantId: string;
  /** The user's question / query string. */
  query: string;
  /** Maximum number of chunks to return (default: 5). */
  topK?: number;
}

/** A single retrieval result. */
export interface RetrievalResult {
  /** The chunk's vector entry ID. */
  id: string;
  /** The chunk text to inject into the LLM prompt. */
  text: string;
  /** Cosine similarity score [0, 1]. */
  score: number;
  /** Source document ID. */
  documentId: string;
  /** Zero-based chunk index. */
  chunkIndex: number;
}

/** Response from POST /api/knowledge/retrieve. */
export interface RetrieveKnowledgeResponse {
  tenantId: string;
  results: RetrievalResult[];
}

// ── Document deletion ─────────────────────────────────────────────────────────

/** Response from DELETE /api/knowledge/[documentId]. */
export interface DeleteDocumentResponse {
  documentId: string;
  tenantId: string;
  /** Number of vector chunks removed. */
  deletedChunks: number;
}
