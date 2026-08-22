import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * GET /api/widget/config?widgetId=xxx
 *
 * Returns the public configuration for a given widget ID.
 * Phase 1: returns default configuration for any valid ID.
 * Phase 2+: look up the widgetId in the database and return
 *           the owner's customisations (bot name, colour, greeting …).
 *
 * NOTE: Never return secret keys or internal credentials from this endpoint.
 */

interface WidgetConfigResponse {
  widgetId: string;
  botName: string;
  greeting: string;
  primaryColor: string;
  position: 'bottom-right' | 'bottom-left';
  isActive: boolean;
}

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { widgetId } = req.query;

  if (typeof widgetId !== 'string' || widgetId.trim().length === 0) {
    return res
      .status(400)
      .json({ error: 'widgetId query parameter is required' });
  }

  // Phase 1: all widget IDs are accepted and return default config.
  // Phase 2+: validate widgetId against the database, check domain allowlist, etc.
  const config: WidgetConfigResponse = {
    widgetId: widgetId.trim(),
    botName: 'Assistant',
    greeting: 'Hi there! 👋 How can I help you today?',
    primaryColor: '#2563eb',
    position: 'bottom-right',
    isActive: true,
  };

  return res.status(200).json(config);
}
