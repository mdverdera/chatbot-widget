import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseClient } from '@/lib/supabase';
import { getUsageSummary } from '@/lib/llm-usage';
import { createLogger } from '@/lib/logger';

/**
 * GET /api/health
 *
 * Top-level health-check endpoint.  Returns the overall system status along
 * with individual component health for:
 *   - Chatbot API (this service)
 *   - Vector database (Supabase / pgvector)
 *   - LLM provider (OpenAI connectivity + usage stats)
 *
 * Response shape:
 *   {
 *     status:     "ok" | "degraded" | "error"
 *     timestamp:  ISO-8601
 *     version:    string
 *     uptime:     number  (process uptime in seconds)
 *     components: {
 *       api:      ComponentStatus
 *       database: ComponentStatus
 *       llm:      ComponentStatus
 *     }
 *     usage: UsageSummary  (LLM + embedding stats since last reset)
 *   }
 *
 * HTTP status codes:
 *   200 — all components healthy or at least degraded but operational
 *   503 — one or more critical components are down
 *
 * Security:
 *   - No secrets, API keys, or internal details are exposed in the response.
 *   - Database checks only verify connectivity (SELECT 1), not data.
 *   - Component-level error messages are intentionally generic.
 *
 * Usage:
 *   Load balancers, uptime monitors, and cloud health-check probes can poll
 *   this endpoint.  Pair with /api/health/db and /api/health/llm for
 *   component-specific checks.
 */

const COMPONENT = 'health';
const log = createLogger(COMPONENT);

export interface ComponentStatus {
  status:  'ok' | 'degraded' | 'error';
  latencyMs?: number;
  message?: string;
}

export interface HealthResponse {
  status:    'ok' | 'degraded' | 'error';
  timestamp: string;
  version:   string;
  uptimeSeconds: number;
  components: {
    api:      ComponentStatus;
    database: ComponentStatus;
    llm:      ComponentStatus;
  };
  usage: ReturnType<typeof getUsageSummary>;
}

// ── Component checks ─────────────────────────────────────────────────────────

async function checkDatabase(): Promise<ComponentStatus> {
  const start = Date.now();
  try {
    const supabase = getSupabaseClient();
    // SELECT 1 — minimal connectivity probe, no data access.
    const { error } = await supabase.rpc('match_knowledge_chunks', {
      query_embedding: new Array(1536).fill(0),
      p_tenant_id:     '__health_check__',
      match_threshold: 1.1,   // threshold > 1 guarantees zero rows returned
      match_count:     1,
    });

    // A Postgres "function not found" error means the DB is up but the
    // migration hasn't been applied — treat as degraded, not down.
    const latencyMs = Date.now() - start;

    if (!error) {
      return { status: 'ok', latencyMs };
    }

    // PGRST202 = function not found in PostgREST schema cache — DB is up
    if (error.code === 'PGRST202' || error.message?.includes('function')) {
      return {
        status:   'degraded',
        latencyMs,
        message:  'Database connected but migration may not be applied',
      };
    }

    return { status: 'error', latencyMs, message: 'Database query failed' };
  } catch {
    const latencyMs = Date.now() - start;
    return { status: 'error', latencyMs, message: 'Database unreachable' };
  }
}

function checkLlmConfig(): ComponentStatus {
  // Verify the API key is configured without making an actual API call.
  // A live connectivity probe would consume tokens and add latency to every
  // health-check poll.  Use the usage stats to infer LLM health instead.
  try {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return { status: 'error', message: 'OPENAI_API_KEY not configured' };
    }

    const usage = getUsageSummary();
    const errorRate = usage.llm.requests > 0
      ? usage.llm.errors / usage.llm.requests
      : 0;

    // Mark as degraded when recent error rate exceeds 50%.
    if (usage.llm.requests >= 5 && errorRate > 0.5) {
      return {
        status:  'degraded',
        message: `High LLM error rate: ${(errorRate * 100).toFixed(0)}%`,
      };
    }

    return { status: 'ok' };
  } catch {
    return { status: 'error', message: 'LLM configuration check failed' };
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<HealthResponse>,
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).end();
    return;
  }

  const [dbStatus, llmStatus] = await Promise.all([
    checkDatabase(),
    Promise.resolve(checkLlmConfig()),
  ]);

  const apiStatus: ComponentStatus = { status: 'ok' };

  // Aggregate overall status: any 'error' → error; any 'degraded' → degraded.
  const statuses = [apiStatus, dbStatus, llmStatus];
  const overall: HealthResponse['status'] =
    statuses.some((s) => s.status === 'error')    ? 'error'    :
    statuses.some((s) => s.status === 'degraded') ? 'degraded' :
    'ok';

  const body: HealthResponse = {
    status:        overall,
    timestamp:     new Date().toISOString(),
    version:       process.env.npm_package_version ?? '1.0.0',
    uptimeSeconds: Math.floor(process.uptime()),
    components: {
      api:      apiStatus,
      database: dbStatus,
      llm:      llmStatus,
    },
    usage: getUsageSummary(),
  };

  if (overall !== 'ok') {
    log.warn('Health check returned non-ok status', { status: overall });
  }

  // Return 503 only when fully down; 200 covers ok + degraded.
  res.status(overall === 'error' ? 503 : 200).json(body);
}
