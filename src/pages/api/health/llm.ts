import type { NextApiRequest, NextApiResponse } from 'next';
import { getUsageSummary } from '@/lib/llm-usage';
import { createLogger } from '@/lib/logger';

/**
 * GET /api/health/llm
 *
 * LLM provider health check.
 * Reports whether the OpenAI API key is configured and provides current
 * usage statistics (request count, token usage, error rate, latency).
 *
 * A live API call is NOT made on every health check — that would consume
 * tokens and add cost.  Instead, this endpoint checks that the key is
 * configured and derives health from recent usage metrics.
 *
 * Response:
 *   {
 *     status:          "ok" | "degraded" | "error"
 *     configured:      boolean    — API key is present
 *     errorRatePct:    number     — recent LLM error rate (%)
 *     embeddingErrorRatePct: number
 *     usage:           UsageSummary
 *     message?:        string
 *   }
 *
 * HTTP 200 = ok | degraded
 * HTTP 503 = error (API key missing)
 */

const log = createLogger('health/llm');

interface LlmHealthResponse {
  status:               'ok' | 'degraded' | 'error';
  configured:           boolean;
  errorRatePct:         number;
  embeddingErrorRatePct: number;
  usage:                ReturnType<typeof getUsageSummary>;
  message?:             string;
}

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<LlmHealthResponse>,
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).end();
    return;
  }

  const apiKey    = process.env.OPENAI_API_KEY?.trim();
  const configured = Boolean(apiKey);
  const usage     = getUsageSummary();

  // LLM error rate
  const llmErrorRatePct = usage.llm.requests > 0
    ? Math.round((usage.llm.errors / usage.llm.requests) * 100)
    : 0;

  // Embedding error rate
  const embeddingErrorRatePct = usage.embedding.requests > 0
    ? Math.round((usage.embedding.errors / usage.embedding.requests) * 100)
    : 0;

  if (!configured) {
    log.warn('LLM health check: API key not configured');
    return res.status(503).json({
      status:               'error',
      configured:           false,
      errorRatePct:         0,
      embeddingErrorRatePct: 0,
      usage,
      message:              'OPENAI_API_KEY is not configured',
    });
  }

  // Mark degraded if recent error rate exceeds 50% with a meaningful sample.
  const isHighErrorRate =
    (usage.llm.requests >= 5 && llmErrorRatePct > 50) ||
    (usage.embedding.requests >= 5 && embeddingErrorRatePct > 50);

  const status = isHighErrorRate ? 'degraded' : 'ok';

  if (isHighErrorRate) {
    log.warn('LLM health check: high error rate', {
      llmErrorRatePct,
      embeddingErrorRatePct,
    });
  }

  return res.status(200).json({
    status,
    configured,
    errorRatePct:         llmErrorRatePct,
    embeddingErrorRatePct,
    usage,
    ...(isHighErrorRate ? { message: 'High error rate detected' } : {}),
  });
}
