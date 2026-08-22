# Chatbot Widget

A standalone, embeddable chatbot widget built with **Next.js**, **TypeScript**, **React**, and **Tailwind CSS**.

## Features (Phase 1)

- 🎯 Single `<script>` tag embed into any website
- 🪟 Iframe-based CSS isolation — widget styles never bleed into the host page
- 💬 Floating chat button + animated chat window
- 🔌 REST API (`POST /api/chat/message`)
- 🆔 Widget ID-based initialization
- 🔒 No secret keys exposed in the frontend
- 🧩 Structured for future: auth, domain allowlisting, CMS integration, LLM

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy environment config
cp .env.example .env.local

# 3. Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the demo page with a live widget preview.

---

## Embedding on Any Website

Add this snippet to the `<body>` of any webpage:

```html
<script
  src="https://your-widget-domain.com/widget.js"
  data-widget-id="YOUR_WIDGET_ID"
></script>
```

### Optional attributes

| Attribute | Values | Default |
|---|---|---|
| `data-widget-id` | Any valid widget ID | **required** |
| `data-position` | `bottom-right` \| `bottom-left` | `bottom-right` |

### Programmatic API (host page)

```js
// After widget.js has loaded:
window.ChatbotWidget.open();    // open the chat window
window.ChatbotWidget.close();   // close the chat window
window.ChatbotWidget.destroy(); // remove the widget entirely
```

---

## Project Structure

```
chatbot-widget/
├── public/
│   └── widget.js                    # Embeddable entry point (plain JS, no secrets)
├── src/
│   ├── components/
│   │   └── widget/
│   │       ├── ChatWidget.tsx       # Root widget component
│   │       ├── ChatButton.tsx       # Floating action button
│   │       ├── ChatWindow.tsx       # Chat panel + session state
│   │       ├── ChatHeader.tsx       # Title bar with close button
│   │       ├── MessageList.tsx      # Scrollable message feed
│   │       ├── MessageBubble.tsx    # User / bot message bubbles
│   │       ├── MessageInput.tsx     # Auto-resizing input bar
│   │       ├── TypingIndicator.tsx  # Animated three-dot loader
│   │       └── index.ts            # Barrel exports
│   ├── lib/
│   │   ├── api-client.ts           # Browser-side fetch helpers
│   │   ├── constants.ts            # Safe public config values
│   │   └── utils.ts               # ID / timestamp helpers
│   ├── pages/
│   │   ├── api/
│   │   │   ├── chat/message.ts     # POST — send/receive messages
│   │   │   └── widget/config.ts    # GET  — widget public config
│   │   ├── widget/[widgetId].tsx   # Iframe host page (CSS-isolated)
│   │   ├── index.tsx              # Demo + documentation page
│   │   ├── _app.tsx
│   │   └── _document.tsx
│   ├── styles/globals.css
│   └── types/widget.ts            # Shared TypeScript interfaces
├── .env.example
├── next.config.js
├── tailwind.config.js
└── tsconfig.json
```

---

## API Reference

### `POST /api/chat/message`

**Request body**
```json
{
  "widgetId": "string",
  "sessionId": "string",
  "message": "string"
}
```

**Response**
```json
{
  "reply": "string",
  "sessionId": "string",
  "messageId": "string",
  "timestamp": 1234567890
}
```

### `GET /api/widget/config?widgetId=xxx`

Returns the public configuration for a given widget ID.

---

## Roadmap

| Phase | Description | Status |
|---|---|---|
| **Phase 1** | Standalone widget with mock responses | ✅ Complete |
| **Phase 2** | Widget ID management + domain allowlisting | ⏳ Planned |
| **Phase 3** | Authentication & secure API key handling | ⏳ Planned |
| **Phase 4** | LLM / AI integration | ⏳ Planned |
| **Phase 5** | CMS integration & conversation history | ⏳ Planned |

---

## Security Notes

- Secret keys (DB credentials, LLM API keys) are **only** set in `.env.local` (server-side, git-ignored).
- `widget.js` contains **no secrets** — only a public widget ID passed by the host page.
- The iframe origin check in `widget.js` prevents cross-origin postMessage spoofing.
- Domain allowlisting (Phase 2) will restrict which sites can use a given widget ID.
