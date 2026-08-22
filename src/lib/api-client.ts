/**
 * Thin API client for the widget — runs entirely in the browser.
 *
 * Phase 3 security model:
 *   - Before sending a chat message, fetches a short-lived signed token from
 *     /api/auth/widget-token.  The server validates the Widget ID and Origin
 *     before issuing the token.
 *   - The token is sent in the Authorization header on each chat request.
 *   - Tokens are cached for their remaining TTL so we don't fetch a new one
 *     on every single message.
 *   - No secret keys are referenced here.  The widgetId is a public identifier.
 */

import type { SendMessageRequest, SendMessageResponse } from '@/types/widget';
import { API_BASE_PATH } from '@/lib/constants';

// ── Token cache ───────────────────────────────────────────────────────────────

interface CachedToken {
  token: string;
  /** Epoch ms at which the token expires (with a safety margin). */
  expiresAt: number;
}

// Per-widgetId token cache (one entry per widget on the page).
const tokenCache = new Map<string, CachedToken>();

/** Seconds before expiry at which we proactively refresh the token. */
const TOKEN_REFRESH_MARGIN_SECONDS = 30;

async function fetchToken(widgetId: string): Promise<string> {
  const cached = tokenCache.get(widgetId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.token;
  }

  const res = await fetch(`${API_BASE_PATH}/auth/widget-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ widgetId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to authenticate' }));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }

  const data = (await res.json()) as { token: string; expiresIn: number };
  const expiresAt =
    Date.now() + (data.expiresIn - TOKEN_REFRESH_MARGIN_SECONDS) * 1000;

  tokenCache.set(widgetId, { token: data.token, expiresAt });
  return data.token;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function sendMessage(
  payload: SendMessageRequest,
): Promise<SendMessageResponse> {
  // Obtain a valid (possibly cached) signed token before each message.
  const token = await fetchToken(payload.widgetId);

  const res = await fetch(`${API_BASE_PATH}/chat/message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error((error as { error?: string }).error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<SendMessageResponse>;
}

export async function fetchWidgetConfig(widgetId: string) {
  const res = await fetch(
    `${API_BASE_PATH}/widget/config?widgetId=${encodeURIComponent(widgetId)}`,
  );

  if (!res.ok) {
    throw new Error(`Failed to load widget config: HTTP ${res.status}`);
  }

  return res.json();
}
