/**
 * Demo / home page
 * Shows a live preview of the widget and explains how to embed it.
 */
import React from 'react';
import Head from 'next/head';
import { ChatWidget } from '@/components/widget';
import type { WidgetConfig } from '@/types/widget';

const DEMO_WIDGET_CONFIG: WidgetConfig = {
  widgetId: 'demo-widget-id',
  botName: 'Assistant',
  greeting: 'Hi there! 👋 This is a live demo of the chatbot widget.',
  primaryColor: '#2563eb',
  position: 'bottom-right',
  theme: 'light',
};

export default function Home() {
  return (
    <>
      <Head>
        <title>Chatbot Widget — Phase 5</title>
        <meta name="description" content="Embeddable chatbot widget demo" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-xl font-semibold text-gray-900">
              Chatbot Widget
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Phase 5 — Production Runtime, Security &amp; Monitoring
            </p>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-12 space-y-10">
          {/* Intro */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">
              Embeddable Chatbot Widget
            </h2>
            <p className="text-gray-600 leading-relaxed">
              A reusable chatbot widget that can be embedded into any website
              with a single &lt;script&gt; tag. The blue button in the
              bottom-right corner is the live widget running on this page.
            </p>
          </section>

          {/* Embed instructions */}
          <section className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">
              How to embed
            </h3>
            <p className="text-sm text-gray-600">
              Add the following snippet to the{' '}
              <code className="bg-gray-100 px-1 rounded">&lt;body&gt;</code> of
              any webpage:
            </p>
            <pre className="bg-gray-900 text-green-400 text-sm rounded-xl p-4 overflow-x-auto leading-relaxed">
              {`<script\n  src="https://your-widget-domain.com/widget.js"\n  data-widget-id="YOUR_WIDGET_ID"\n></script>`}
            </pre>

            <h4 className="text-sm font-semibold text-gray-700 pt-2">
              Optional attributes
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-gray-600 border border-gray-200 rounded-lg overflow-hidden">
                <thead className="bg-gray-50 text-gray-700">
                  <tr>
                    <th className="px-4 py-2 font-medium border-b border-gray-200">
                      Attribute
                    </th>
                    <th className="px-4 py-2 font-medium border-b border-gray-200">
                      Values
                    </th>
                    <th className="px-4 py-2 font-medium border-b border-gray-200">
                      Default
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-100">
                    <td className="px-4 py-2 font-mono">data-widget-id</td>
                    <td className="px-4 py-2">Any valid widget ID</td>
                    <td className="px-4 py-2 text-red-500">required</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-mono">data-position</td>
                    <td className="px-4 py-2">
                      <code>bottom-right</code> |{' '}
                      <code>bottom-left</code>
                    </td>
                    <td className="px-4 py-2">
                      <code>bottom-right</code>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* API reference */}
          <section className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">
              API Reference
            </h3>

            <div className="space-y-3 text-sm">
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 font-mono font-semibold text-gray-700 border-b border-gray-200">
                  POST /api/chat/message
                </div>
                <div className="px-4 py-3 text-gray-600">
                  Send a user message and receive a bot reply.
                  <pre className="mt-2 bg-gray-50 rounded-lg p-3 text-xs overflow-x-auto">
                    {`// Request body\n{\n  "widgetId": "string",   // required\n  "sessionId": "string",  // optional\n  "message": "string"     // required, max 2000 chars\n}\n\n// Response\n{\n  "reply": "string",\n  "sessionId": "string",\n  "messageId": "string",\n  "timestamp": 1234567890\n}`}
                  </pre>
                </div>
              </div>

              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 font-mono font-semibold text-gray-700 border-b border-gray-200">
                  GET /api/widget/config?widgetId=xxx
                </div>
                <div className="px-4 py-3 text-gray-600">
                  Retrieve the public configuration for a widget ID.
                </div>
              </div>
            </div>
          </section>

          {/* Roadmap */}
          <section className="bg-white rounded-2xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              Phase Roadmap
            </h3>
            <div className="space-y-2 text-sm">
              {[
                {
                  phase: 'Phase 1',
                  label: 'Standalone widget with mock responses',
                  done: true,
                },
                {
                  phase: 'Phase 2',
                  label: 'CMS integration — widget embed via script tag',
                  done: true,
                },
                {
                  phase: 'Phase 3',
                  label: 'Secure integration — signed tokens, origin allowlist, rate limiting',
                  done: true,
                },
                {
                  phase: 'Phase 4',
                  label: 'RAG/LLM integration — knowledge ingestion, vector search, AI responses',
                  done: true,
                },
                {
                  phase: 'Phase 5',
                  label: 'CMS Admin UI, production runtime, structured logging, health checks, monitoring hooks, LLM usage tracking',
                  done: true,
                },
              ].map(({ phase, label, done }) => (
                <div key={phase} className="flex items-center gap-3">
                  <span
                    className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${
                      done
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {done ? '✓' : '○'}
                  </span>
                  <span className={done ? 'text-gray-800' : 'text-gray-400'}>
                    <strong>{phase}</strong> — {label}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </main>

        <footer className="text-center text-xs text-gray-400 py-6 border-t border-gray-100">
          Chatbot Widget · Phase 5
        </footer>
      </div>

      {/* Live widget demo — rendered directly on this page */}
      <ChatWidget config={DEMO_WIDGET_CONFIG} />
    </>
  );
}
