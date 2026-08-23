/**
 * Widget Registry — server-side only.
 *
 * Acts as the authoritative source of truth for which widget IDs are valid,
 * which origins (domains) are authorised to embed each widget, whether the
 * widget is currently active, and which CMS tenant it belongs to.
 *
 * Phase 3: in-memory store seeded from environment variables so the chatbot
 * can run standalone while the CMS is the source of truth.
 * Phase 4+: replace `WIDGET_REGISTRY` with a database query to the CMS.
 *
 * Environment variable format (comma-separated entries, pipe-separated fields):
 *   WIDGET_REGISTRY=<widgetId>|<allowedOrigins>|<active>|<tenantId>,...
 *
 * Fields:
 *   widgetId       — public widget ID issued by the CMS.
 *   allowedOrigins — semicolon-separated list of exact Origin values.
 *   active         — "true" or "false".
 *   tenantId       — CMS tenant that owns this widget (used for RAG scoping).
 *
 * Example:
 *   WIDGET_REGISTRY=abc123|https://example.com;https://www.example.com|true|tenant-1,xyz789|https://shop.io|true|tenant-2
 *
 * NEVER import this module from client-side code.
 */

export interface WidgetRecord {
  widgetId: string;
  /** Exact origin strings that are allowed to embed this widget. */
  allowedOrigins: string[];
  isActive: boolean;
  /**
   * The CMS tenant that owns this widget.
   * Stamped into the JWT and used to scope every vector search.
   * An empty string means no tenant was configured (RAG will not function).
   */
  tenantId: string;
}

// ── Registry loading ─────────────────────────────────────────────────────────

function loadRegistry(): Map<string, WidgetRecord> {
  const map = new Map<string, WidgetRecord>();
  const raw = process.env.WIDGET_REGISTRY ?? '';

  if (!raw.trim()) return map;

  for (const entry of raw.split(',')) {
    const parts = entry.trim().split('|');
    if (parts.length < 2) continue;

    const [widgetId, originsRaw, activeRaw, tenantIdRaw] = parts;
    if (!widgetId?.trim()) continue;

    const allowedOrigins = (originsRaw ?? '')
      .split(';')
      .map((o) => o.trim().toLowerCase())
      .filter(Boolean);

    const isActive = activeRaw?.trim().toLowerCase() !== 'false';
    const tenantId = tenantIdRaw?.trim() ?? '';

    map.set(widgetId.trim(), {
      widgetId: widgetId.trim(),
      allowedOrigins,
      isActive,
      tenantId,
    });
  }

  return map;
}

// Lazy singleton — built once per server process.
let _registry: Map<string, WidgetRecord> | null = null;

function getRegistry(): Map<string, WidgetRecord> {
  if (!_registry) _registry = loadRegistry();
  return _registry;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Look up a widget record. Returns undefined when the ID is not registered. */
export function findWidget(widgetId: string): WidgetRecord | undefined {
  return getRegistry().get(widgetId);
}

/**
 * Validate that a widget ID is registered, active, and the requesting origin
 * is on its allowlist.
 *
 * @param widgetId  - The widget ID from the request.
 * @param origin    - The `Origin` header value from the request (may be undefined).
 */
export function validateWidgetOrigin(
  widgetId: string,
  origin: string | undefined,
): { valid: false; reason: string } | { valid: true; record: WidgetRecord } {
  const record = getRegistry().get(widgetId);

  if (!record) {
    return { valid: false, reason: 'Widget ID not found' };
  }

  if (!record.isActive) {
    return { valid: false, reason: 'Widget is disabled' };
  }

  const requestOrigin = (origin ?? '').trim().toLowerCase();

  if (!requestOrigin) {
    return { valid: false, reason: 'Missing Origin header' };
  }

  if (!record.allowedOrigins.includes(requestOrigin)) {
    return { valid: false, reason: 'Origin not allowed' };
  }

  return { valid: true, record };
}
