/**
 * Monitoring hooks — server-side only.
 *
 * Provides an extensible hook system that allows Phase 5B metrics and events
 * to be forwarded to cloud monitoring and logging services in a later phase.
 *
 * Current built-in hooks:
 *   - consoleMonitor  — logs aggregated stats to stdout (always active)
 *
 * Adding a new integration (e.g. Datadog, Prometheus, OpenTelemetry):
 *   1. Implement the MonitoringHook interface.
 *   2. Register it with `registerMonitoringHook(myHook)`.
 *   3. Hook functions are called for each event type automatically.
 *
 * Event types:
 *   - "request"          : completed API request
 *   - "auth_failure"     : authentication or token rejection
 *   - "tenant_violation" : cross-tenant attempt or missing tenant claim
 *   - "rag_error"        : retrieval or embedding failure
 *   - "llm_error"        : LLM call failure
 *   - "processing_error" : document processing pipeline failure
 *
 * NEVER import this module from client-side code.
 * NEVER include secrets or credentials in monitoring event payloads.
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('monitoring');

// ── Types ─────────────────────────────────────────────────────────────────────

export type MonitoringEventType =
  | 'request'
  | 'auth_failure'
  | 'tenant_violation'
  | 'rag_error'
  | 'llm_error'
  | 'processing_error';

export interface MonitoringEvent {
  /** Event category. */
  type:        MonitoringEventType;
  /** ISO-8601 timestamp. */
  ts:          string;
  /** Component that emitted the event. */
  component:   string;
  /** Tenant context (when available). */
  tenantId?:   string;
  /** HTTP status code (for request events). */
  status?:     number;
  /** Response latency in ms (for request events). */
  durationMs?: number;
  /** Safe error description (no stack traces, no secrets). */
  errorMsg?:   string;
  /** Additional key/value pairs — must not contain secrets. */
  [key: string]: string | number | boolean | undefined;
}

export interface MonitoringHook {
  /** Human-readable name for this hook (used in logs). */
  name: string;
  /**
   * Called for every monitoring event.
   * Must not throw — errors are caught and logged internally.
   */
  onEvent(event: MonitoringEvent): void | Promise<void>;
}

// ── Registry ──────────────────────────────────────────────────────────────────

const hooks: MonitoringHook[] = [];

/**
 * Register a monitoring hook.
 * Hooks are called in registration order for every event.
 */
export function registerMonitoringHook(hook: MonitoringHook): void {
  hooks.push(hook);
  log.info(`Monitoring hook registered: ${hook.name}`);
}

/**
 * Emit a monitoring event to all registered hooks.
 * Safe to call from anywhere — never throws.
 */
export function emitMonitoringEvent(
  type: MonitoringEventType,
  component: string,
  fields: Omit<MonitoringEvent, 'type' | 'ts' | 'component'> = {},
): void {
  const event: MonitoringEvent = {
    type,
    ts: new Date().toISOString(),
    component,
    ...fields,
  };

  for (const hook of hooks) {
    try {
      const result = hook.onEvent(event);
      // If the hook returns a promise, catch rejections silently.
      if (result instanceof Promise) {
        result.catch((err) =>
          log.warn(`Monitoring hook "${hook.name}" threw async error`, {
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    } catch (err) {
      log.warn(`Monitoring hook "${hook.name}" threw sync error`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// ── Convenience emitters ──────────────────────────────────────────────────────

export function monitorAuthFailure(component: string, reason: string, tenantId?: string): void {
  emitMonitoringEvent('auth_failure', component, { reason, tenantId });
}

export function monitorTenantViolation(component: string, reason: string, tenantId?: string): void {
  emitMonitoringEvent('tenant_violation', component, { reason, tenantId });
}

export function monitorRagError(component: string, errorMsg: string, tenantId: string): void {
  emitMonitoringEvent('rag_error', component, { errorMsg, tenantId });
}

export function monitorLlmError(component: string, errorMsg: string, tenantId: string): void {
  emitMonitoringEvent('llm_error', component, { errorMsg, tenantId });
}

export function monitorProcessingError(
  component: string,
  errorMsg: string,
  tenantId: string,
  documentId: string,
): void {
  emitMonitoringEvent('processing_error', component, { errorMsg, tenantId, documentId });
}

// ── Built-in: console stats hook ─────────────────────────────────────────────
// Logs error events at warn level.  This is the default hook used before any
// external monitoring integration is registered.  It fires for error-class
// events only so it doesn't flood the log on every request.

const ERROR_TYPES: Set<MonitoringEventType> = new Set([
  'auth_failure',
  'tenant_violation',
  'rag_error',
  'llm_error',
  'processing_error',
]);

const consoleMonitor: MonitoringHook = {
  name: 'console-monitor',
  onEvent(event) {
    if (!ERROR_TYPES.has(event.type)) return;
    log.warn(`[monitor] ${event.type}`, {
      component: event.component,
      tenantId:  event.tenantId,
      errorMsg:  event.errorMsg,
      reason:    event.reason as string | undefined,
    });
  },
};

// Register the built-in console hook at startup.
registerMonitoringHook(consoleMonitor);
