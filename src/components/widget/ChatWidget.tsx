'use client';

import React, { useState, useEffect } from 'react';
import type { WidgetConfig } from '@/types/widget';
import { WIDGET_DEFAULTS } from '@/lib/constants';
import { ChatButton } from './ChatButton';
import { ChatWindow } from './ChatWindow';

interface ChatWidgetProps {
  config: WidgetConfig;
  /** Allow the host page to programmatically open the widget via postMessage. */
  externalOpen?: boolean;
}

/**
 * Top-level widget component.
 * Renders a floating button + conditionally the chat window.
 * Positioning honours config.position ('bottom-right' | 'bottom-left').
 *
 * When running inside the iframe, it posts open/close events back to
 * the parent so widget.js can toggle pointer-events on the overlay.
 */
export function ChatWidget({ config, externalOpen }: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);

  const position = config.position ?? WIDGET_DEFAULTS.position;

  const positionClasses =
    position === 'bottom-left'
      ? 'bottom-5 left-5 items-end'
      : 'bottom-5 right-5 items-end';

  // Sync with external programmatic control (widget.js public API)
  useEffect(() => {
    if (externalOpen !== undefined) {
      setIsOpen(externalOpen);
    }
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
      data-widget-id={config.widgetId}
    >
      {isOpen && <ChatWindow config={config} onClose={handleClose} />}

      <div className={position === 'bottom-left' ? 'self-start' : 'self-end'}>
        <ChatButton
          isOpen={isOpen}
          onClick={handleToggle}
          primaryColor={config.primaryColor}
        />
      </div>
    </div>
  );
}
