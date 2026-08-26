import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseClient } from '@/lib/supabase';
import { createLogger } from '@/lib/logger';

/**
 * GET /api/health/db
 *
 * Database-specific health check.
 * Probes Supabase / pgvector connectivity without reading any tenant data.
 *
 * Response:
 *   { status: "ok" | "error", latencyMs: number, message?: string }
 *
 * HTTP 200 = ok | degraded
 * HTTP 503 = error / unreachable
 *
 * Used by load balancers and monitoring tools that need a focused DB probe.
 */

const log = createLogger('health/db');

interface DbHealthResponse {
  status:    'ok' | 'degraded' | 'error';
  latencyMs: number;
  message?:  string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DbHealthResponse>,
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).end();
    return;
  }

  const start = Date.now();

  try {
    const supabase = getSupabaseClient();

    // Use a zero-vector probe with an impossible threshold so no rows are
    // returned and no real data is touched — just verifies DB connectivity.
    const { error } = await supabase.rpc('match_knowledge_chunks', {
      query_embedding: new Array(1536).fill(0),
      p_tenant_id:     '__health_check__',
      match_threshold: 1.1,
      match_count:     1,
    });

    const latencyMs = Date.now() - start;

    if (!error) {
      return res.status(200).json({ status: 'ok', latencyMs });
    }

    // PGRST202: RPC function not found — DB up but migration not applied.
    if (error.code === 'PGRST202' || error.message?.includes('function')) {
      return res.status(200).json({
        status:   'degraded',
        latencyMs,
        message:  'Database connected; migration may not be applied',
      });
    }

    log.warn('Database health check failed', { error: error.message });
    return res.status(503).json({
      status:   'error',
      latencyMs,
      message:  'Database query failed',
    });
  } catch {
    const latencyMs = Date.now() - start;
    log.warn('Database health check unreachable', { latencyMs });
    return res.status(503).json({
      status:   'error',
      latencyMs,
      message:  'Database unreachable',
    });
  }
}
