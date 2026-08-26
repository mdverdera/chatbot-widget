/**
 * LLM usage tracker — server-side only.
 *
 * Records per-call metrics for every LLM (and embedding) invocation:
 *   - Total request count
 *   - Token usage (prompt + completion) when the API returns it
 *   - Error count
 *   - Response latency (p50/p95/p99 via a sorted circular buffer)
 *
 * The in-process counters act as the primary source for the health-check
 * endpoint and as the hook point for external monitoring integrations.
 *
 * Monitoring integration:
 *   Counters are exposed via `getUsageSummary()`.  The /api/health/llm
 *   endpoint calls this and can forward the data to StatsD, Prometheus,
 *   Datadog, or any other metrics sink via the monitoring hooks in
 *   monitoring.ts.
 *
 * NEVER import this module from client-side code.
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('llm-usage');

// ── Types ─────────────────────────────────────────────────────────────────────

export type UsageCategory = 'llm' | 'embedding';

export interface UsageEvent {
  /** "llm" for chat completions, "embedding" for embeddings API. */
  category:    UsageCategory;
  /** The tenant this call was made on behalf of. */
  tenantId:    string;
  /** The model name. */
  model:       string;
  /** Whether the call succeeded. */
  success:     boolean;
  /** Wall-clock latency in milliseconds. */
  latencyMs:   number;
  /** Tokens consumed (only available when the API returns usage data). */
  tokens?: {
    prompt:     number;
    completion: number;
    total:      number;
  };
  /** Error message when success=false (sanitised, no secrets). */
  errorMessage?: string;
}

export interface UsageSummary {
  llm: CategoryStats;
  embedding: CategoryStats;
  /** ISO-8601 timestamp when the counters were last reset. */
  since: string;
}

export interface CategoryStats {
  requests:        number;
  errors:          number;
  totalTokens:     number;
  promptTokens:    number;
  completionTokens: number;
  /** Latency percentiles in milliseconds. Null when no samples. */
  latencyP50Ms:    number | null;
  latencyP95Ms:    number | null;
  latencyP99Ms:    number | null;
}

// ── In-process state ──────────────────────────────────────────────────────────

interface CategoryAccumulator {
  requests:         number;
  errors:           number;
  totalTokens:      number;
  promptTokens:     number;
  completionTokens: number;
  /** Circular buffer of recent latency samples (ms), capped at MAX_LATENCY_SAMPLES. */
  latencySamples:   number[];
}

const MAX_LATENCY_SAMPLES = 1000;

function freshAccumulator(): CategoryAccumulator {
  return {
    requests:         0,
    errors:           0,
    totalTokens:      0,
    promptTokens:     0,
    completionTokens: 0,
    latencySamples:   [],
  };
}

const accumulators: Record<UsageCategory, CategoryAccumulator> = {
  llm:       freshAccumulator(),
  embedding: freshAccumulator(),
};

let since = new Date().toISOString();

// ── Percentile helper ─────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Record a completed LLM or embedding API call.
 *
 * Call this immediately after every API call, success or failure.
 * Logs the event at debug level and updates in-memory counters.
 */
export function recordUsage(event: UsageEvent): void {
  const acc = accumulators[event.category];

  acc.requests++;
  if (!event.success) acc.errors++;

  if (event.tokens) {
    acc.promptTokens      += event.tokens.prompt;
    acc.completionTokens  += event.tokens.completion;
    acc.totalTokens       += event.tokens.total;
  }

  // Circular buffer: evict oldest sample when full.
  if (acc.latencySamples.length >= MAX_LATENCY_SAMPLES) {
    acc.latencySamples.shift();
  }
  acc.latencySamples.push(event.latencyMs);

  // Structured log at debug level so it is captured in debug mode but
  // does not flood production stdout by default.
  log.debug('Usage event', {
    category:    event.category,
    tenantId:    event.tenantId,
    model:       event.model,
    success:     event.success,
    latencyMs:   event.latencyMs,
    totalTokens: event.tokens?.total,
    ...(event.errorMessage ? { errorMessage: event.errorMessage } : {}),
  });
}

/**
 * Return a snapshot of current usage statistics.
 * Used by the health-check endpoint and monitoring hooks.
 */
export function getUsageSummary(): UsageSummary {
  function buildStats(acc: CategoryAccumulator): CategoryStats {
    const sorted = [...acc.latencySamples].sort((a, b) => a - b);
    return {
      requests:         acc.requests,
      errors:           acc.errors,
      totalTokens:      acc.totalTokens,
      promptTokens:     acc.promptTokens,
      completionTokens: acc.completionTokens,
      latencyP50Ms:     percentile(sorted, 50),
      latencyP95Ms:     percentile(sorted, 95),
      latencyP99Ms:     percentile(sorted, 99),
    };
  }

  return {
    llm:       buildStats(accumulators.llm),
    embedding: buildStats(accumulators.embedding),
    since,
  };
}

/**
 * Reset all counters.
 * Useful for tests or rolling resets (call periodically if desired).
 */
export function resetUsageCounters(): void {
  accumulators.llm       = freshAccumulator();
  accumulators.embedding = freshAccumulator();
  since = new Date().toISOString();
}
