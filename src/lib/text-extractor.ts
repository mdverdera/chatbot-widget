/**
 * Text extraction — server-side only.
 *
 * Extracts plain text from TXT, PDF, and DOCX file buffers.
 * No disk I/O — everything is done in-memory from a Buffer.
 *
 * Supported formats:
 *   txt   — decoded as UTF-8
 *   pdf   — parsed with pdf-parse
 *   docx  — extracted with mammoth
 *
 * NEVER import this module from client-side code.
 */

import type { SupportedFileType, ExtractionResult } from '@/types/knowledge';

// ── File-type detection ───────────────────────────────────────────────────────

/**
 * Derive the file type from the file name extension.
 * Returns null for unsupported extensions.
 */
export function detectFileType(fileName: string): SupportedFileType | null {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'txt':  return 'txt';
    case 'pdf':  return 'pdf';
    case 'docx': return 'docx';
    default:     return null;
  }
}

// ── Extractors ────────────────────────────────────────────────────────────────

async function extractTxt(buffer: Buffer): Promise<string> {
  return buffer.toString('utf-8');
}

async function extractPdf(buffer: Buffer): Promise<string> {
  // pdf-parse is a CommonJS module; use dynamic require so Next.js does not
  // try to bundle it for the browser (it cannot run in a browser context).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse') as (
    data: Buffer,
    options?: Record<string, unknown>,
  ) => Promise<{ text: string }>;

  const result = await pdfParse(buffer);
  return result.text ?? '';
}

async function extractDocx(buffer: Buffer): Promise<string> {
  // mammoth is CJS-only; dynamic require avoids browser-bundle issues.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mammoth = require('mammoth') as {
    extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }>;
  };

  const result = await mammoth.extractRawText({ buffer });
  return result.value ?? '';
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Extract plain text from a file buffer.
 *
 * @param buffer    - Raw file bytes.
 * @param fileName  - Original file name (used for extension-based type detection).
 * @throws          If the file type is unsupported or extraction fails.
 */
export async function extractText(
  buffer: Buffer,
  fileName: string,
): Promise<ExtractionResult> {
  const fileType = detectFileType(fileName);

  if (!fileType) {
    throw new Error(
      `Unsupported file type: "${fileName}". Only TXT, PDF, and DOCX are supported.`,
    );
  }

  let text: string;

  switch (fileType) {
    case 'txt':
      text = await extractTxt(buffer);
      break;
    case 'pdf':
      text = await extractPdf(buffer);
      break;
    case 'docx':
      text = await extractDocx(buffer);
      break;
  }

  // Normalise whitespace: collapse runs of blank lines, trim edges.
  text = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { text, fileType };
}
