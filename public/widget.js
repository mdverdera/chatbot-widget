/**
 * widget.js - Public embeddable entry point
 *
 * Usage:
 *   <script src="https://your-widget.com/widget.js"
 *           data-widget-id="YOUR_ID"></script>
 *
 * Optional:
 *   data-position="bottom-left"   (default: bottom-right)
 *   data-theme="light|dark|auto"  (default: auto)
 *
 * Architecture — two-iframe design:
 *
 *   buttonIframe  — tiny fixed iframe in the corner, always pointer-events:auto
 *                   Hosts only the ChatButton. Clicking it opens the chat.
 *
 *   panelIframe   — full-viewport iframe, pointer-events:none when chat closed,
 *                   pointer-events:auto when open. Hosts ChatWindow.
 *                   Hidden (opacity:0) when closed so it doesn't flicker.
 *
 * This is the same pattern used by Intercom, Crisp, and Tidio:
 *   - Host page is always fully interactive (button iframe is tiny).
 *   - Chat panel covers the viewport only when explicitly opened.
 *
 * NO secret keys are present in this file.
 */

(function () {
  'use strict';

  if (window.__chatbotWidgetLoaded) return;
  window.__chatbotWidgetLoaded = true;

  // ── Read config from script tag ─────────────────────────────────────────
  var scripts = document.querySelectorAll('script[data-widget-id]');
  var tag     = scripts[scripts.length - 1];

  var widgetId = tag ? tag.getAttribute('data-widget-id') : null;
  var position = (tag && tag.getAttribute('data-position')) || 'bottom-right';
  var theme    = (tag && tag.getAttribute('data-theme'))    || 'auto';

  if (!widgetId) {
    console.error('[ChatWidget] data-widget-id is required.');
    return;
  }

  var scriptSrc    = (tag && tag.src) || '';
  var widgetOrigin = '';
  try { widgetOrigin = new URL(scriptSrc).origin; }
  catch (_) { widgetOrigin = window.location.origin; }

  var base = widgetOrigin + '/widget/' + encodeURIComponent(widgetId);
  var qs   = '?position=' + encodeURIComponent(position) + '&theme=' + encodeURIComponent(theme);

  // ── Shared iframe style helper ──────────────────────────────────────────
  function makeIframe(src, extraStyle) {
    var f = document.createElement('iframe');
    f.src = src;
    f.setAttribute('title', 'Chat Widget');
    f.setAttribute('allowtransparency', 'true');
    f.setAttribute('frameborder', '0');
    f.setAttribute('scrolling', 'no');
    f.style.cssText = [
      'position:fixed',
      'border:none',
      'z-index:2147483647',
      'background:transparent',
    ].concat(extraStyle).join(';');
    return f;
  }

  // ── Dimensions ──────────────────────────────────────────────────────────
  var EDGE = 20;   // matches bottom-5 (1.25rem ≈ 20px)
  var BTN  = 72;   // 56px button + shadow breathing room
  var side = position === 'bottom-left' ? 'left' : 'right';

  // buttonIframe: tiny, always interactive, holds only the FAB
  var buttonIframe = makeIframe(base + qs + '&mode=button', [
    'bottom:' + EDGE + 'px',
    side + ':' + EDGE + 'px',
    'width:'  + BTN + 'px',
    'height:' + BTN + 'px',
    'pointer-events:auto',
    'overflow:visible',
  ]);

  // panelIframe: full-viewport, hidden + non-interactive while closed
  var panelIframe = makeIframe(base + qs + '&mode=panel', [
    'top:0', 'left:0',
    'width:100%', 'height:100%',
    'pointer-events:none',
    'opacity:0',
    'transition:opacity 0.15s',
  ]);

  function mount() {
    document.body.appendChild(panelIframe);
    document.body.appendChild(buttonIframe);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  // ── postMessage bridge ──────────────────────────────────────────────────
  window.addEventListener('message', function (event) {
    if (event.origin !== widgetOrigin) return;
    var data = event.data;
    if (!data || data.type !== 'chatbot-widget') return;

    if (data.action === 'open') {
      // Show panel, relay open to panel so it renders ChatWindow
      panelIframe.style.pointerEvents = 'auto';
      panelIframe.style.opacity       = '1';
      if (panelIframe.contentWindow) {
        panelIframe.contentWindow.postMessage(
          { type: 'chatbot-widget', action: 'open' }, widgetOrigin
        );
      }
    } else if (data.action === 'close') {
      // Hide panel, relay close to panel so it tears down ChatWindow
      panelIframe.style.pointerEvents = 'none';
      panelIframe.style.opacity       = '0';
      if (panelIframe.contentWindow) {
        panelIframe.contentWindow.postMessage(
          { type: 'chatbot-widget', action: 'close' }, widgetOrigin
        );
      }
      // Also reset the button icon
      if (buttonIframe.contentWindow) {
        buttonIframe.contentWindow.postMessage(
          { type: 'chatbot-widget', action: 'close' }, widgetOrigin
        );
      }
    }
  });

  // ── Public API ──────────────────────────────────────────────────────────
  window.ChatbotWidget = {
    open: function () {
      if (buttonIframe.contentWindow) {
        buttonIframe.contentWindow.postMessage(
          { type: 'chatbot-widget', action: 'open' }, widgetOrigin
        );
      }
    },
    close: function () {
      if (buttonIframe.contentWindow) {
        buttonIframe.contentWindow.postMessage(
          { type: 'chatbot-widget', action: 'close' }, widgetOrigin
        );
      }
    },
    destroy: function () {
      [buttonIframe, panelIframe].forEach(function (f) {
        if (f.parentNode) f.parentNode.removeChild(f);
      });
      window.__chatbotWidgetLoaded = false;
      delete window.ChatbotWidget;
    },
  };
})();