// Shared TypeScript types for the chatbot widget

export interface Message {
  id: string;
  role: 'user' | 'bot';
  content: string;
  timestamp: number;
}

export interface ChatSession {
  sessionId: string;
  widgetId: string;
  messages: Message[];
  createdAt: number;
}

// ──────────────────────────────────────────────
// API request / response shapes
// ──────────────────────────────────────────────

export interface SendMessageRequest {
  widgetId: string;
  sessionId: string;
  message: string;
}

export interface SendMessageResponse {
  reply: string;
  sessionId: string;
  messageId: string;
  timestamp: number;
}

export interface ApiErrorResponse {
  error: string;
  code?: string;
}

// ──────────────────────────────────────────────
// Widget configuration (passed via script tag)
// ──────────────────────────────────────────────

export interface WidgetConfig {
  /** The public widget ID issued to a website owner. */
  widgetId: string;
  /** Optional: override the default greeting text. */
  greeting?: string;
  /** Optional: override the bot display name. */
  botName?: string;
  /** Optional: primary accent colour (CSS hex/rgb). */
  primaryColor?: string;
  /** Optional: position on screen — default 'bottom-right'. */
  position?: 'bottom-right' | 'bottom-left';
}
