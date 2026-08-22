/**
 * /widget/[widgetId]
 *
 * Two-iframe architecture:
 *   ?mode=button  — renders only the ChatButton FAB (in the tiny corner iframe)
 *   ?mode=panel   — renders only the ChatWindow (in the full-viewport iframe)
 *   (no mode)     — legacy: renders both (for direct browsing / testing)
 *
 * postMessage protocol:
 *   host  → iframe : { type: 'chatbot-widget', action: 'open' | 'close' | 'theme', theme? }
 *   iframe → host  : { type: 'chatbot-widget', action: 'open' | 'close' | 'ready' }
 */
import React, { useEffect, useState } from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import type { WidgetConfig, WidgetTheme } from '@/types/widget';
import { ChatButton } from '@/components/widget/ChatButton';
import { ChatWindow } from '@/components/widget/ChatWindow';
import { ChatWidget } from '@/components/widget';
import { WIDGET_DEFAULTS, THEME_TOKENS } from '@/lib/constants';

interface WidgetPageProps {
  config: WidgetConfig;
  mode: 'button' | 'panel' | 'full';
}

function darkenHex(hex: string, amount = 28): string {
  const clean = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return hex;
  const num = parseInt(clean, 16);
  const r = Math.max(0, (num >> 16) - amount);
  const g = Math.max(0, ((num >> 8) & 0xff) - amount);
  const b = Math.max(0, (num & 0xff) - amount);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

function getCssVars(config: WidgetConfig, resolvedDark: boolean): React.CSSProperties {
  const primary = config.primaryColor ?? WIDGET_DEFAULTS.primaryColor;
  const theme   = config.theme ?? WIDGET_DEFAULTS.theme;
  const isDark  = theme === 'dark' || (theme === 'auto' && resolvedDark);
  const palette = isDark ? THEME_TOKENS.dark : THEME_TOKENS.light;
  const vars: Record<string, string> = {
    '--widget-primary':       primary,
    '--widget-primary-hover': darkenHex(primary),
    '--widget-primary-light': primary + '1a',
    ...palette,
  };
  return vars as unknown as React.CSSProperties;
}

export default function WidgetPage({ config, mode }: WidgetPageProps) {
  const [mounted,      setMounted]      = useState(false);
  const [isOpen,       setIsOpen]       = useState(false);
  const [theme,        setTheme]        = useState<WidgetTheme>(config.theme ?? 'auto');
  const [resolvedDark, setResolvedDark] = useState(false);

  useEffect(() => {
    setMounted(true);

    // Resolve 'auto' theme
    if (theme === 'auto') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      setResolvedDark(mq.matches);
      const handler = (e: MediaQueryListEvent) => setResolvedDark(e.matches);
      mq.addEventListener('change', handler);
    }

    // Signal ready to host
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'chatbot-widget', action: 'ready' }, '*');
    }

    function onMessage(event: MessageEvent) {
      const data = event.data as { type?: string; action?: string; theme?: string };
      if (data?.type !== 'chatbot-widget') return;
      if (data.action === 'open')  setIsOpen(true);
      if (data.action === 'close') setIsOpen(false);
      if (data.action === 'theme' && data.theme) {
        const t = data.theme as WidgetTheme;
        if (t === 'light' || t === 'dark' || t === 'auto') setTheme(t);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function notifyParent(action: 'open' | 'close') {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'chatbot-widget', action }, '*');
    }
  }

  if (!mounted) return null;

  const effectiveConfig = { ...config, theme };
  const cssVars = getCssVars(effectiveConfig, resolvedDark);
  const position = effectiveConfig.position ?? WIDGET_DEFAULTS.position;
  const cornerClass = position === 'bottom-left'
    ? 'fixed bottom-5 left-5'
    : 'fixed bottom-5 right-5';

  // ── Button-only mode (tiny corner iframe) ──────────────────────────────
  // The iframe is already positioned in the corner by widget.js.
  // We just fill the iframe and center the button — no fixed/absolute tricks.
  if (mode === 'button') {
    return (
      <>
        <Head><meta name="robots" content="noindex,nofollow" /></Head>
        <div
          style={{
            ...cssVars,
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            overflow: 'visible',
          }}
        >
          <ChatButton
            isOpen={isOpen}
            onClick={() => {
              const next = !isOpen;
              setIsOpen(next);
              notifyParent(next ? 'open' : 'close');
            }}
          />
        </div>
      </>
    );
  }

  // ── Panel-only mode (full-viewport iframe, shown when open) ───────────
  // Place the chat window in the same corner as the button.
  const panelCorner: React.CSSProperties = position === 'bottom-left'
    ? { position: 'fixed', bottom: '5.5rem', left: '1.25rem' }
    : { position: 'fixed', bottom: '5.5rem', right: '1.25rem' };

  if (mode === 'panel') {
    return (
      <>
        <Head><meta name="robots" content="noindex,nofollow" /></Head>
        <div style={{ ...cssVars, width: '100%', height: '100%', background: 'transparent' }}>
          {isOpen && (
            <div style={panelCorner}>
              <ChatWindow
                config={effectiveConfig}
                onClose={() => {
                  setIsOpen(false);
                  notifyParent('close');
                }}
              />
            </div>
          )}
        </div>
      </>
    );
  }

  // ── Full mode (legacy / direct preview) ───────────────────────────────
  return (
    <>
      <Head>
        <title>Chat Widget</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <main style={{ background: 'transparent', width: '100%', height: '100%' }}>
        <ChatWidget config={effectiveConfig} externalOpen={isOpen} />
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<WidgetPageProps> = async ({ params, query }) => {
  const widgetId = typeof params?.widgetId === 'string' ? params.widgetId.trim() : '';
  if (!widgetId) return { notFound: true };

  const position: 'bottom-left' | 'bottom-right' =
    query.position === 'bottom-left' ? 'bottom-left' : 'bottom-right';

  const theme: WidgetTheme =
    query.theme === 'dark' ? 'dark' : query.theme === 'light' ? 'light' : 'auto';

  const mode: 'button' | 'panel' | 'full' =
    query.mode === 'button' ? 'button' : query.mode === 'panel' ? 'panel' : 'full';

  const config: WidgetConfig = {
    widgetId,
    botName: 'Assistant',
    greeting: 'Hi there! How can I help you today?',
    primaryColor: '#2563eb',
    position,
    theme,
  };

  return { props: { config, mode } };
};