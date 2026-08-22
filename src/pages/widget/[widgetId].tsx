/**
 * /widget/[widgetId]
 *
 * Loaded inside the invisible iframe injected by widget.js.
 * Provides full CSS isolation from the host page.
 *
 * postMessage protocol (both directions, same origin):
 *   host → iframe : { type: 'chatbot-widget', action: 'open' | 'close' }
 *   iframe → host : { type: 'chatbot-widget', action: 'open' | 'close' | 'ready' }
 */
import React, { useEffect, useState } from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import type { WidgetConfig } from '@/types/widget';
import { ChatWidget } from '@/components/widget';

interface WidgetPageProps {
  config: WidgetConfig;
}

export default function WidgetPage({ config }: WidgetPageProps) {
  const [mounted, setMounted] = useState(false);
  const [forceOpen, setForceOpen] = useState(false);

  useEffect(() => {
    setMounted(true);

    // Notify the host page that the widget iframe is ready
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'chatbot-widget', action: 'ready' }, '*');
    }

    // Listen for programmatic open/close from the host page via widget.js public API
    function onMessage(event: MessageEvent) {
      const data = event.data as { type?: string; action?: string };
      if (data?.type !== 'chatbot-widget') return;
      if (data.action === 'open') setForceOpen(true);
      if (data.action === 'close') setForceOpen(false);
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  if (!mounted) return null;

  return (
    <>
      <Head>
        <title>Chat Widget</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <main style={{ background: 'transparent', width: '100%', height: '100%' }}>
        <ChatWidget config={config} externalOpen={forceOpen} />
      </main>
    </>
  );
}

/**
 * Server-side: validate widgetId and return public config.
 * Phase 2+: query database, check isActive, enforce domain allowlist.
 */
export const getServerSideProps: GetServerSideProps<WidgetPageProps> = async ({
  params,
  query,
}) => {
  const widgetId =
    typeof params?.widgetId === 'string' ? params.widgetId.trim() : '';

  if (!widgetId) {
    return { notFound: true };
  }

  const position =
    query.position === 'bottom-left' ? 'bottom-left' : 'bottom-right';

  // Phase 1: accept any non-empty widgetId and return defaults.
  const config: WidgetConfig = {
    widgetId,
    botName: 'Assistant',
    greeting: 'Hi there! 👋 How can I help you today?',
    primaryColor: '#2563eb',
    position,
  };

  return { props: { config } };
};
