/**
 * LLM client — server-side only.
 *
 * A thin, modular wrapper around the OpenAI Chat Completions API.
 * Keeping this module isolated means the provider can be swapped
 * (Anthropic, Azure OpenAI, local Ollama, etc.) by editing one file.
 *
 * Configuration (environment variables):
 *   OPENAI_API_KEY  (required)  Your OpenAI API key.
 *   LLM_MODEL       (optional)  Chat model. Default: gpt-4o-mini.
 *   LLM_MAX_TOKENS  (optional)  Response token ceiling. Default: 1024.
 *   LLM_TEMPERATURE (optional)  Sampling temperature [0–2]. Default: 0.2.
 *                               Low values make answers more factual and
 *                               deterministic — appropriate for RAG.
 *
 * Phase 5B additions:
 *   - Tracks request count, token usage, errors, and response latency
 *     via llm-usage.ts.
 *   - Emits LLM error events to the monitoring hook system.
 *
 * NEVER import this module from client-side code.
 * NEVER expose OPENAI_API_KEY to the frontend.
 */

import OpenAI from 'openai';
import { recordUsage } from '@/lib/llm-usage';
import { monitorLlmError } from '@/lib/monitoring';
import { createLogger } from '@/lib/logger';

const log = createLogger('llm-client');

// ── Config ────────────────────────────────────────────────────────────────────

const DEFAULT_LLM_MODEL       = 'gpt-4o';
const DEFAULT_LLM_MAX_TOKENS  = 1024;
const DEFAULT_LLM_TEMPERATURE = 0.2;

function getOpenAiClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    throw new Error(
      'OPENAI_API_KEY environment variable is not set. Set it in .env.local.',
    );
  }
  return new OpenAI({ apiKey: apiKey.trim() });
}

function getLlmModel(): string {
  return (process.env.LLM_MODEL ?? DEFAULT_LLM_MODEL).trim();
}

function getLlmMaxTokens(): number {
  const raw = process.env.LLM_MAX_TOKENS;
  if (!raw) return DEFAULT_LLM_MAX_TOKENS;
  const n = parseInt(raw, 10);
  if (isNaN(n) || n <= 0) {
    throw new Error(`LLM_MAX_TOKENS must be a positive integer (got "${raw}").`);
  }
  return n;
}

function getLlmTemperature(): number {
  const raw = process.env.LLM_TEMPERATURE;
  if (!raw) return DEFAULT_LLM_TEMPERATURE;
  const n = parseFloat(raw);
  if (isNaN(n) || n < 0 || n > 2) {
    throw new Error(`LLM_TEMPERATURE must be a number between 0 and 2 (got "${raw}").`);
  }
  return n;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmCallOptions {
  /** Override the default model for this call. */
  model?: string;
  /** Override max tokens for this call. */
  maxTokens?: number;
  /** Override temperature for this call. */
  temperature?: number;
  /**
   * Tenant ID context for usage tracking and monitoring.
   * Pass this on every call that originates from a tenant request.
   */
  tenantId?: string;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Send a list of messages to the LLM and return the text reply.
 *
 * This is the single integration point for the LLM provider.
 * To switch providers, replace only this function's implementation.
 *
 * Records usage metrics (latency, token counts, errors) automatically.
 *
 * @param messages - Conversation messages in order (system, user, …).
 * @param options  - Optional per-call overrides for model/tokens/temperature.
 * @returns        The LLM's plain-text reply.
 * @throws         If the API key is missing, or the API returns an error.
 */
export async function callLlm(
  messages: LlmMessage[],
  options: LlmCallOptions = {},
): Promise<string> {
  const client      = getOpenAiClient();
  const model       = options.model       ?? getLlmModel();
  const maxTokens   = options.maxTokens   ?? getLlmMaxTokens();
  const temperature = options.temperature ?? getLlmTemperature();
  const tenantId    = options.tenantId    ?? 'unknown';

  const startMs = Date.now();

  try {
    const completion = await client.chat.completions.create({
      model,
      messages,
      max_tokens:  maxTokens,
      temperature,
    });

    const latencyMs = Date.now() - startMs;
    const content   = completion.choices[0]?.message?.content;

    if (!content) {
      throw new Error('LLM returned an empty response.');
    }

    // Record success with token usage when available.
    recordUsage({
      category:  'llm',
      tenantId,
      model,
      success:   true,
      latencyMs,
      tokens: completion.usage
        ? {
            prompt:     completion.usage.prompt_tokens,
            completion: completion.usage.completion_tokens,
            total:      completion.usage.total_tokens,
          }
        : undefined,
    });

    log.debug('LLM call succeeded', {
      model,
      latencyMs,
      totalTokens: completion.usage?.total_tokens,
      tenantId,
    });

    return content.trim();
  } catch (err) {
    const latencyMs  = Date.now() - startMs;
    const errorMessage = err instanceof Error ? err.message : 'LLM call failed';

    recordUsage({
      category:     'llm',
      tenantId,
      model,
      success:      false,
      latencyMs,
      errorMessage,
    });

    monitorLlmError('llm-client', errorMessage, tenantId);

    log.error('LLM call failed', { model, latencyMs, tenantId }, err);

    throw err;
  }
}
