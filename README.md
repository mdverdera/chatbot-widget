# Chatbot Widget

A standalone, embeddable, multi-tenant chatbot powered by **Next.js**, **TypeScript**, **React**, **Tailwind CSS**, and **OpenAI**.

The widget is a completely separate project and deployment from the CMS. Multiple CMS tenants share the same Chatbot service, and every tenant's knowledge is fully isolated from every other.

---

## Roadmap

| Phase | Description | Status |
|---|---|---|
| **Phase 1** | Standalone widget with mock responses | ✅ Complete |
| **Phase 2** | Widget ID management + domain allowlisting | ✅ Complete |
| **Phase 3** | Authentication & secure JWT handling | ✅ Complete |
| **Phase 4B** | AI knowledge processing — ingest, embed, store | ✅ Complete |
| **Phase 4C** | RAG-based Q&A — retrieve, prompt, LLM answer | ✅ Complete |
| **Phase 5** | Conversation history & advanced analytics | ⏳ Planned |

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill in environment config
cp .env.example .env.local
# Edit .env.local — at minimum set WIDGET_SECRET, WIDGET_REGISTRY, and OPENAI_API_KEY

# 3. Run the development server
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) to see the demo page.

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
| `data-widget-id` | Any registered widget ID | **required** |
| `data-position` | `bottom-right` \| `bottom-left` | `bottom-right` |

### Programmatic API (host page)

```js
window.ChatbotWidget.open();    // open the chat window
window.ChatbotWidget.close();   // close the chat window
window.ChatbotWidget.destroy(); // remove the widget entirely
```

---

## Project Structure

```
chatbot-widget/
├── public/
│   └── widget.js                        # Embeddable entry point (no secrets)
├── src/
│   ├── components/widget/
│   │   ├── ChatWidget.tsx               # Root widget component + theme tokens
│   │   ├── ChatButton.tsx               # Floating action button
│   │   ├── ChatWindow.tsx               # Chat panel + session state
│   │   ├── ChatHeader.tsx               # Title bar with close button
│   │   ├── MessageList.tsx              # Scrollable message feed
│   │   ├── MessageBubble.tsx            # User / bot message bubbles
│   │   ├── MessageInput.tsx             # Auto-resizing input bar
│   │   ├── TypingIndicator.tsx          # Animated three-dot loader
│   │   └── index.ts                    # Barrel exports
│   ├── lib/
│   │   ├── api-client.ts               # Browser-side fetch helpers
│   │   ├── cms-auth.ts                 # CMS Bearer-token authentication
│   │   ├── cms-client.ts               # CMS knowledge API client (GET/PATCH)
│   │   ├── constants.ts                # Public config + theme tokens
│   │   ├── cors.ts                     # Origin-bound CORS header helpers
│   │   ├── embeddings.ts               # OpenAI embeddings (batch-aware)
│   │   ├── intent-classifier.ts        # Rule-based intent classifier (no API calls)
│   │   ├── knowledge-processor.ts      # Ingest pipeline orchestrator
│   │   ├── llm-client.ts               # Modular OpenAI chat completions wrapper
│   │   ├── rag-config.ts               # Similarity threshold + fallback message
│   │   ├── rag-pipeline.ts             # Full RAG flow: classify → embed → search → LLM
│   │   ├── rate-limiter.ts             # In-memory sliding-window rate limiter
│   │   ├── text-chunker.ts             # Paragraph-aware overlapping text chunker
│   │   ├── text-extractor.ts           # TXT / PDF / DOCX text extraction
│   │   ├── token.ts                    # JWT issue + verify (HMAC-SHA-256)
│   │   ├── utils.ts                    # ID / timestamp helpers
│   │   ├── vector-store.ts             # In-memory vector store (tenant-isolated)
│   │   └── widget-registry.ts          # Widget ID → origin + tenant mapping
│   ├── pages/
│   │   ├── api/
│   │   │   ├── auth/widget-token.ts    # POST — issue widget JWT
│   │   │   ├── chat/message.ts         # POST — RAG-powered chat handler
│   │   │   ├── knowledge/
│   │   │   │   ├── ingest.ts           # POST — receive & process a document
│   │   │   │   ├── retrieve.ts         # POST — tenant-scoped vector search
│   │   │   │   └── [documentId].ts     # DELETE — remove document vectors
│   │   │   └── widget/config.ts        # GET  — public widget configuration
│   │   ├── widget/[widgetId].tsx        # Iframe host page (CSS-isolated)
│   │   ├── index.tsx                   # Demo + documentation page
│   │   ├── _app.tsx
│   │   └── _document.tsx
│   ├── styles/globals.css
│   └── types/
│       ├── knowledge.ts                # Ingest, chunk, vector, retrieval types
│       └── widget.ts                   # Widget config + message API types
├── .env.example
├── next.config.js
├── tailwind.config.js
└── tsconfig.json
```

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in the required values. **Never commit `.env.local`.**

### Required

| Variable | Description |
|---|---|
| `WIDGET_SECRET` | Secret used to sign widget JWTs (min 32 chars). Generate with: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `WIDGET_REGISTRY` | Pipe-delimited widget entries — see format below |
| `OPENAI_API_KEY` | OpenAI API key — used for embeddings and LLM chat completions |
| `CMS_BASE_URL` | Base URL of the CMS (e.g. `https://cms.example.com`) |
| `CMS_API_SECRET` | Shared secret the CMS sends to authenticate knowledge API calls |

### Widget Registry Format

```
WIDGET_REGISTRY=<widgetId>|<origin1>;<origin2>|<active>|<tenantId>,...
```

Each field is pipe-separated (`|`). Multiple widgets are comma-separated.

| Field | Description |
|---|---|
| `widgetId` | Public widget ID issued by the CMS |
| `origins` | Semicolon-separated list of exact `Origin` header values allowed to embed |
| `active` | `true` or `false` — set to `false` to disable without deleting |
| `tenantId` | CMS tenant that owns this widget — scopes all knowledge retrieval |

**Examples:**

```bash
# Single widget
WIDGET_REGISTRY=abc123|https://example.com;https://www.example.com|true|tenant-uuid

# Multiple tenants (comma-separated)
WIDGET_REGISTRY=abc123|https://example.com|true|tenant-1,xyz789|https://shop.io|true|tenant-2
```

### Optional

| Variable | Default | Description |
|---|---|---|
| `LLM_MODEL` | `gpt-4o-mini` | OpenAI chat model for generating answers |
| `LLM_MAX_TOKENS` | `1024` | Maximum tokens in LLM responses |
| `LLM_TEMPERATURE` | `0.2` | Sampling temperature (0–2). Lower = more factual |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | OpenAI embedding model |
| `EMBEDDING_BATCH_SIZE` | `100` | Max texts per embeddings API request |
| `CHUNK_SIZE` | `1200` | Target characters per text chunk (≈ 300 tokens) |
| `CHUNK_OVERLAP` | `200` | Overlap characters between adjacent chunks |
| `SIMILARITY_THRESHOLD` | `0.75` | Minimum cosine-similarity score to use a chunk as context |
| `FALLBACK_MESSAGE` | *(see below)* | Reply when no knowledge chunk clears the threshold |
| `NEXT_PUBLIC_WIDGET_ORIGIN` | `http://localhost:3000` | Public base URL of this widget server |

---

## API Reference

### `POST /api/auth/widget-token`

Issues a short-lived signed JWT for an authorised widget + origin pair. Called by the widget on load before sending any messages.

**Request body**
```json
{ "widgetId": "string" }
```

**Response**
```json
{ "token": "string", "expiresIn": 300 }
```

**Security:** validates widget ID, origin allowlist, and rate-limits by widget ID.

---

### `POST /api/chat/message`

Receives a user message, verifies the JWT, and runs the full RAG pipeline to produce a knowledge-grounded answer.

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

**Security:** requires a valid Bearer token. The `tenantId` is extracted from the JWT's `tid` claim — never from the request body. Cross-tenant retrieval is architecturally impossible.

---

### `POST /api/knowledge/ingest` *(CMS → Chatbot)*

Called by the CMS to trigger processing of a new or updated knowledge document.

**Authentication:** `Authorization: Bearer <CMS_API_SECRET>`

**Request body**
```json
{
  "documentId": "string",
  "tenantId":   "string",
  "title":      "string",
  "fileName":   "string",
  "downloadUrl":"string"
}
```

**Response**
```json
{ "documentId": "string", "status": "completed", "chunkCount": 42 }
```

**Pipeline:** download → extract text (TXT/PDF/DOCX) → chunk → embed → store vectors → report status back to CMS.

---

### `DELETE /api/knowledge/[documentId]?tenantId=<tenantId>` *(CMS → Chatbot)*

Removes all vector chunks for a deleted CMS document.

**Authentication:** `Authorization: Bearer <CMS_API_SECRET>`

**Response**
```json
{ "documentId": "string", "tenantId": "string", "deletedChunks": 12 }
```

---

### `POST /api/knowledge/retrieve` *(internal)*

Tenant-scoped vector similarity search. Used internally by the RAG pipeline; can also be called directly by the CMS.

**Authentication:** `Authorization: Bearer <CMS_API_SECRET>`

**Request body**
```json
{ "tenantId": "string", "query": "string", "topK": 5 }
```

**Response**
```json
{
  "tenantId": "string",
  "results": [
    { "id": "string", "text": "string", "score": 0.91, "documentId": "string", "chunkIndex": 0 }
  ]
}
```

---

### `GET /api/widget/config?widgetId=xxx`

Returns the public configuration for a registered, active widget.

**Response**
```json
{
  "widgetId": "string",
  "botName": "Assistant",
  "greeting": "Hi there! 👋 How can I help you today?",
  "primaryColor": "#2563eb",
  "position": "bottom-right",
  "theme": "light",
  "isActive": true
}
```

---

## RAG Pipeline

Every user message passes through the following decision tree before any OpenAI API call is made:

```
User message
    │
    ▼
Intent classifier (zero cost — no API calls)
    │
    ├─ greeting / farewell / gratitude /
    │  affirmation / bot-identity
    │       └──→ Canned reply ✓
    │
    └─ question
            │
            ▼
       generateEmbedding(question)   ← OpenAI Embeddings API
            │
            ▼
       searchVectors(tenantId, …)    ← in-memory, tenant-scoped
            │
            ├─ best score < SIMILARITY_THRESHOLD
            │       └──→ FALLBACK_MESSAGE ✓  (LLM skipped)
            │
            └─ score ≥ threshold
                    │
                    ▼
               buildSystemPrompt(context chunks)
                    │
                    ▼
               callLlm([system, user])   ← OpenAI Chat API
                    │
                    ▼
               Knowledge-grounded answer ✓
```

The LLM's system prompt explicitly instructs it to answer **only** from the retrieved context and to respond with the fallback message if the context is insufficient — it cannot draw on general knowledge.

---

## Tenant Isolation

Every vector chunk stored in the vector store is tagged with a `tenantId`. The tenant ID flows through the system as follows:

```
WIDGET_REGISTRY (env)
    └─→ WidgetRecord.tenantId
            └─→ JWT claim `tid`  (signed, tamper-proof)
                    └─→ verifyWidgetToken() → tokenResult.payload.tid
                                └─→ runRagPipeline({ tenantId })
                                            └─→ searchVectors(tenantId, …)
```

- The tenant index in the vector store means **only vectors for the given tenant are ever iterated** — a global search is never issued.
- The `tenantId` is **never taken from the request body** in the chat handler — only from the verified JWT claim.
- Cross-tenant knowledge retrieval is architecturally impossible.

---

## Document Processing Pipeline

When the CMS calls `POST /api/knowledge/ingest`:

```
1. Authenticate CMS request (Bearer CMS_API_SECRET)
2. Validate tenantId, documentId, fileName, downloadUrl
3. PATCH CMS → status: "processing"
4. Download file from signed URL
5. Extract text (TXT: UTF-8 decode | PDF: pdf-parse | DOCX: mammoth)
6. Chunk text (paragraph-aware, CHUNK_SIZE chars, CHUNK_OVERLAP overlap)
7. Generate embeddings (OpenAI, batched in groups of EMBEDDING_BATCH_SIZE)
8. Delete any existing vectors for this documentId (handles re-processing)
9. Store new vectors (each tagged with tenantId + documentId)
10. PATCH CMS → status: "completed" (or "failed" + error_message on any error)
```

---

## Security Notes

- **`OPENAI_API_KEY`, `WIDGET_SECRET`, `CMS_API_SECRET`** are server-side only — never in the browser bundle.
- `widget.js` contains **no secrets** — only the public widget ID from the host page's `data-widget-id` attribute.
- JWTs are signed with HMAC-SHA-256 and bind to both the `widgetId` and the requesting `Origin` — tokens cannot be replayed from a different origin.
- The `tenantId` is baked into the JWT at issuance time and cryptographically protected — it cannot be forged or substituted by a user.
- All CMS-facing endpoints authenticate with a constant-time secret comparison to prevent timing attacks.
- Rate limiting is applied at every public endpoint (per-IP for chat, per-tenant for ingest/retrieve, per-widget for token issuance).
