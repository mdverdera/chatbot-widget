import type { NextApiRequest, NextApiResponse } from 'next';
import { validateWidgetOrigin } from '@/lib/widget-registry';
import { setCorsOrigin } from '@/lib/cors';
import type { ApiErrorResponse } from '@/types/widget';

/**
 * GET /api/widget/config?widgetId=xxx
 *
 * Returns the public configuration for a registered, active widget.
 *
 * Phase 3 security:
 *   - Validates that the widgetId is in the registry and active.
 *   - Validates that the requesting Origin is on the widget's allowlist.
 *   - Returns 403 for unknown / disabled / wrong-origin requests.
 *
 * Phase 4+: merge in CMS-stored customisations (botName, primaryColor, etc.)
 *           by querying the database with `widgetId`.
 *
 * NOTE: Never return WIDGET_SECRET or any internal credentials from this endpoint.
 */

interface WidgetConfigResponse {
  widgetId: string;
  botName: string;
  greeting: string;
  primaryColor: string;
  position: 'bottom-right' | 'bottom-left';
  theme: 'light' | 'dark' | 'auto';
  isActive: boolean;
}

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<WidgetConfigResponse | ApiErrorResponse>,
) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
  }

  const { widgetId } = req.query;
  const origin = req.headers.origin;

  if (typeof widgetId !== 'string' || widgetId.trim().length === 0) {
    return res
      .status(400)
      .json({ error: 'widgetId query parameter is required', code: 'MISSING_WIDGET_ID' });
  }

  // ── Widget ID + origin validation ─────────────────────────────────────────
  const validation = validateWidgetOrigin(widgetId.trim(), origin);
  if (!validation.valid) {
    // Intentionally vague — do not leak whether the widget ID exists.
    return res.status(403).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
  }

  const { record } = validation;

  // Phase 3: return default config supplemented by any CMS-stored values.
  // Phase 4+: fetch row from CMS DB: const row = await db.widgets.findUnique(...)
  const config: WidgetConfigResponse = {
    widgetId: record.widgetId,
    botName:      'Assistant',          // Phase 4+: row.botName
    greeting:     'Hi there! 👋 How can I help you today?', // Phase 4+: row.greeting
    primaryColor: '#2563eb',            // Phase 4+: row.primaryColor
    position:     'bottom-right',       // Phase 4+: row.position
    theme:        'light',              // Phase 4+: row.theme
    isActive:     record.isActive,
  };

  // Set origin-bound CORS header only for the validated origin.
  setCorsOrigin(req, res, record.widgetId);

  return res.status(200).json(config);
}
