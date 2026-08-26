/**
 * Structured logger — server-side only.
 *
 * Emits newline-delimited JSON (NDJSON) in production and human-readable
 * lines in development.  Every log entry includes:
 *   - level      : "debug" | "info" | "warn" | "error"
 *   - ts         : ISO-8601 timestamp
 *   - component  : the module that emitted the log (e.g. "chat/message")
 *   - msg        : human-readable message
 *   - ...fields  : optional structured data (no secrets, no stack traces)
 *
 * Security rules:
 *   - NEVER log API keys, passwords, tokens, or internal credentials.
 *   - NEVER log full stack traces in production (logged at "error" level only
 *     and only when LOG_LEVEL permits — never forwarded to the client).
 *   - Error messages are sanitised before emission so they cannot leak secrets.
 *
 * Environment variables:
 *   LOG_LEVEL   : "debug" | "info" | "warn" | "error"  (default: "info")
 *   LOG_FORMAT  : "json" | "pretty"  (default: "json" in production, "pretty" in development)
 *
 * Monitoring integration:
 *   JSON output is consumed directly by log-aggregation services
 *   (Datadog, Logtail, GCP Cloud Logging, AWS CloudWatch Logs, etc.).
 *   Set LOG_FORMAT=json in production and pipe stdout to your collector.
 *
 * NEVER import this module from client-side code.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogFields {
  [key: string]: string | number | boolean | undefined | null;
}

// ── Level priority ────────────────────────────────────────────────────────────

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info:  1,
  warn:  2,
  error: 3,
};

function getConfiguredLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? 'info').toLowerCase().trim();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') {
    return raw;
  }
  return 'info';
}

function getLogFormat(): 'json' | 'pretty' {
  const raw = process.env.LOG_FORMAT?.toLowerCase().trim();
  if (raw === 'json' || raw === 'pretty') return raw;
  return process.env.NODE_ENV === 'production' ? 'json' : 'pretty';
}

// Read once at module load so it doesn't re-parse every log call.
const MIN_LEVEL: LogLevel = getConfiguredLevel();
const FORMAT: 'json' | 'pretty' = getLogFormat();

// ── Sanitisation ──────────────────────────────────────────────────────────────

/**
 * Redact common secret patterns from a string before logging.
 * This is a defence-in-depth measure — callers should never pass secrets.
 */
function sanitise(value: string): string {
  return value
    // Bearer tokens
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
    // Generic "key", "secret", "token", "password" key=value pairs
    .replace(/\b(api[_-]?key|secret|token|password|credential|auth)[^a-z]?\s*[=:]\s*\S+/gi, '$1=[REDACTED]')
    // OpenAI key pattern
    .replace(/sk-[A-Za-z0-9]{20,}/g, 'sk-[REDACTED]')
    // Supabase service role pattern
    .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, 'jwt-[REDACTED]');
}

// ── Emit ──────────────────────────────────────────────────────────────────────

function emit(
  level: LogLevel,
  component: string,
  msg: string,
  fields?: LogFields,
  err?: unknown,
): void {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[MIN_LEVEL]) return;

  const ts = new Date().toISOString();
  const safeMsg = sanitise(msg);

  // Sanitise every field value to ensure no secret leaks via structured data.
  const safeFields: LogFields = {};
  if (fields) {
    for (const [k, v] of Object.entries(fields)) {
      safeFields[k] = typeof v === 'string' ? sanitise(v) : v;
    }
  }

  // Include error detail only at error level, and only the message (no stack).
  let errMsg: string | undefined;
  if (err != null && level === 'error') {
    errMsg = err instanceof Error ? sanitise(err.message) : sanitise(String(err));
  }

  if (FORMAT === 'json') {
    const entry: Record<string, unknown> = {
      level,
      ts,
      component,
      msg: safeMsg,
      ...safeFields,
    };
    if (errMsg !== undefined) entry.err = errMsg;
    process.stdout.write(JSON.stringify(entry) + '\n');
  } else {
    // Pretty format for development
    const prefix = `${ts} [${level.toUpperCase().padEnd(5)}] [${component}]`;
    const fieldStr = Object.keys(safeFields).length
      ? ' ' + Object.entries(safeFields)
          .filter(([, v]) => v !== undefined && v !== null)
          .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
          .join(' ')
      : '';
    const errStr = errMsg ? ` err="${errMsg}"` : '';
    const line = `${prefix} ${safeMsg}${fieldStr}${errStr}`;

    if (level === 'error') process.stderr.write(line + '\n');
    else process.stdout.write(line + '\n');
  }
}

// ── Logger factory ────────────────────────────────────────────────────────────

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields, err?: unknown): void;
}

/**
 * Create a logger bound to a component name.
 *
 * Usage:
 *   const log = createLogger('chat/message');
 *   log.info('Request received', { widgetId, ip });
 *   log.error('LLM call failed', { tenantId }, err);
 */
export function createLogger(component: string): Logger {
  return {
    debug: (msg, fields) => emit('debug', component, msg, fields),
    info:  (msg, fields) => emit('info',  component, msg, fields),
    warn:  (msg, fields) => emit('warn',  component, msg, fields),
    error: (msg, fields, err) => emit('error', component, msg, fields, err),
  };
}

// ── Request logger ────────────────────────────────────────────────────────────

/**
 * Log a completed API request with timing.
 * Call at the END of a handler once the response status is known.
 */
export function logRequest(fields: {
  component: string;
  method:    string;
  path:      string;
  status:    number;
  ip:        string;
  tenantId?: string;
  widgetId?: string;
  durationMs: number;
}): void {
  const log = createLogger(fields.component);
  const level: LogLevel = fields.status >= 500 ? 'error'
    : fields.status >= 400 ? 'warn'
    : 'info';

  const { component: _c, ...rest } = fields;
  emit(level, fields.component, 'API request', rest as LogFields);
}

// ── Auth event loggers ────────────────────────────────────────────────────────

/**
 * Log a token / authentication failure event.
 * Logs at warn level so it surfaces in monitoring dashboards.
 */
export function logAuthFailure(
  component: string,
  reason: string,
  fields?: LogFields,
): void {
  emit('warn', component, 'Authentication failure', { reason, event: 'auth_failure', ...fields });
}

/**
 * Log a tenant validation failure event.
 */
export function logTenantViolation(
  component: string,
  reason: string,
  fields?: LogFields,
): void {
  emit('warn', component, 'Tenant validation failure', { reason, event: 'tenant_violation', ...fields });
}
