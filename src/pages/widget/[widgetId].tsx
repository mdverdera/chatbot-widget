/**
 * /widget/[widgetId]
 *
 * Loaded inside the invisible iframe injected by widget.js.
 * Provides full CSS isolation from the host page.
 *
 * postMessage protocol (both directions, same origin):
 *   host -> iframe : { type: 'chatbot-widget', action: 'open' | 'close' }
 *   host -> iframe : { type: 'chatbot-widget', action: 'theme', theme: 'light' | 'dark' | 'auto' }
 *   iframe -> host : { type: 'chatbot-widget', action: 'open' | 'close' | 'ready' }
 */
import React, { useEffect, useState } from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import type { WidgetConfig, WidgetTheme } from '@/types/widget';
import { ChatWidget } from '@/components/widget';

interface WidgetPageProps {
  config: WidgetConfig;
}

export default function WidgetPage({ config }: WidgetPageProps) {
  const [mounted, setMounted] = useState(false);
  const [forceOpen, setForceOpen] = useState(false);
  const [theme, setTheme] = useState<WidgetTheme>(config.theme ?? 'auto');

  useEffect(() => {
    setMounted(true);

    // Notify the host page that the widget iframe is ready
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'chatbot-widget', action: 'ready' }, '*');
    }

    // Listen for programmatic open/close/theme from the host page
    function onMessage(event: MessageEvent) {
      const data = event.data as { type?: string; action?: string; theme?: string };
      if (data?.type !== 'chatbot-widget') return;
      if (data.action === 'open') setForceOpen(true);
      if (data.action === 'close') setForceOpen(false);
      if (data.action === 'theme' && data.theme) {
        const t = data.theme as WidgetTheme;
        if (t === 'light' || t === 'dark' || t === 'auto') setTheme(t);
      }
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
        <ChatWidget config={{ ...config, theme }} externalOpen={forceOpen} />
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

  const theme: WidgetTheme =
    query.theme === 'dark' ? 'dark'
    : query.theme === 'light' ? 'light'
    : 'auto';

  const config: WidgetConfig = {
    widgetId,
    botName: 'Assistant',
    greeting: 'Hi there! How can I help you today?',
    primaryColor: '#2563eb',
    position,
    theme,
  };

  return { props: { config } };
};