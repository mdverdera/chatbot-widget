/**
 * CORS utilities — server-side only.
 *
 * Sets the Access-Control-Allow-Origin response header to the requesting
 * Origin after it has been validated against the widget registry.
 * This means only registered, allowlisted origins receive a permissive CORS
 * response — all others get no ACAO header and the browser blocks the request.
 *
 * NEVER call setCorsOrigin with an unvalidated origin.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { findWidget } from '@/lib/widget-registry';

/**
 * If the requesting Origin is on the allowlist for the given widgetId, set
 * the Access-Control-Allow-Origin response header to that origin.
 * Must be called after successful origin validation, before sending the response.
 */
export function setCorsOrigin(
  req: NextApiRequest,
  res: NextApiResponse,
  widgetId: string,
): void {
  const origin = (req.headers.origin ?? '').trim().toLowerCase();
  if (!origin) return;

  const record = findWidget(widgetId);
  if (!record) return;

  if (record.allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin!);
    res.setHeader('Vary', 'Origin');
  }
}

/**
 * Set CORS headers for a pre-flight OPTIONS request.
 * Echoes the origin back only if it is on the allowlist for the given widgetId.
 */
export function handleCorsPreFlight(
  req: NextApiRequest,
  res: NextApiResponse,
  widgetId: string,
): void {
  setCorsOrigin(req, res, widgetId);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
