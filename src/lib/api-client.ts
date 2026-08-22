/**
 * Thin API client for the widget — runs entirely in the browser.
 * No secret keys are referenced here; the widgetId is a public identifier.
 */

import type { SendMessageRequest, SendMessageResponse } from '@/types/widget';
import { API_BASE_PATH } from '@/lib/constants';

export async function sendMessage(
  payload: SendMessageRequest,
): Promise<SendMessageResponse> {
  const res = await fetch(`${API_BASE_PATH}/chat/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
