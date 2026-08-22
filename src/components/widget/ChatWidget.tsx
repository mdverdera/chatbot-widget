'use client';

import React, { useState, useEffect, useMemo } from 'react';
import type { WidgetConfig } from '@/types/widget';
import { WIDGET_DEFAULTS, THEME_TOKENS } from '@/lib/constants';
import { ChatButton } from './ChatButton';
import { ChatWindow } from './ChatWindow';

interface ChatWidgetProps {
  config: WidgetConfig;
  /** Allow the host page to programmatically open the widget via postMessage. */
  externalOpen?: boolean;
}

/**
 * Darken a hex colour by `amount` (0–255) for the hover shade.
 * Falls back to the original colour if parsing fails.
 */
function darkenHex(hex: string, amount = 28): string {
  const clean = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return hex;
  const num = parseInt(clean, 16);
  const r = Math.max(0, (num >> 16) - amount);
  const g = Math.max(0, ((num >> 8) & 0xff) - amount);
  const b = Math.max(0, (num & 0xff) - amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/**
 * Top-level widget component.
 *
 * Sets CSS custom properties on its root element so every child component
 * inherits both the CMS accent colour and the correct light/dark theme tokens
 * without any prop drilling.
 *
 * Theme modes:
 *   'light' — always light (default)
 *   'dark'  — always dark
 *   'auto'  — follows the host page's prefers-color-scheme media query
 */
export function ChatWidget({ config, externalOpen }: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);

  const position = config.position ?? WIDGET_DEFAULTS.position;
  const theme    = config.theme    ?? WIDGET_DEFAULTS.theme;

  const positionClasses =
    position === 'bottom-left'
      ? 'bottom-5 left-5 items-end'
      : 'bottom-5 right-5 items-end';

  // ── Resolve which palette to use for 'auto' mode ──────────────────────
  // Start with light; the useEffect below will correct it in the browser.
  const [resolvedDark, setResolvedDark] = useState(false);

  useEffect(() => {
    if (theme !== 'auto') return;

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setResolvedDark(mq.matches);

    const handler = (e: MediaQueryListEvent) => setResolvedDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  // ── Build CSS custom properties ────────────────────────────────────────
  const cssVars = useMemo((): React.CSSProperties => {
    const primary = config.primaryColor ?? WIDGET_DEFAULTS.primaryColor;

    const isDark =
      theme === 'dark' || (theme === 'auto' && resolvedDark);

    const palette = isDark ? THEME_TOKENS.dark : THEME_TOKENS.light;

    // CSS custom properties are valid inline styles but TypeScript's
    // CSSProperties type doesn't index them — cast through Record first.
    const vars: Record<string, string> = {
      '--widget-primary':       primary,
      '--widget-primary-hover': darkenHex(primary),
      '--widget-primary-light': `${primary}1a`,
      ...palette,
    };
    return vars as unknown as React.CSSProperties;
  }, [config.primaryColor, theme, resolvedDark]);

  // ── Sync with widget.js programmatic API ──────────────────────────────
  useEffect(() => {
    if (externalOpen !== undefined) setIsOpen(externalOpen);
  }, [externalOpen]);

  function notifyParent(action: 'open' | 'close') {
    if (
      typeof window !== 'undefined' &&
      window.parent &&
      window.parent !== window
    ) {
      window.parent.postMessage({ type: 'chatbot-widget', action }, '*');
    }
  }

  function handleToggle() {
    setIsOpen((prev) => {
      const next = !prev;
      notifyParent(next ? 'open' : 'close');
      return next;
    });
  }

  function handleClose() {
    setIsOpen(false);
    notifyParent('close');
  }

  return (
    <div
      className={`fixed z-[9999] flex flex-col gap-3 ${positionClasses}`}
      style={cssVars}
      data-widget-id={config.widgetId}
      data-theme={theme === 'auto' ? (resolvedDark ? 'dark' : 'light') : theme}
    >
      {isOpen && <ChatWindow config={config} onClose={handleClose} />}

      <div className={position === 'bottom-left' ? 'self-start' : 'self-end'}>
        <ChatButton isOpen={isOpen} onClick={handleToggle} />
      </div>
    </div>
  );
}
