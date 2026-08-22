/**
 * widget.js — Public embeddable entry point
 *
 * Usage on any website:
 *
 *   <script
 *     src="https://your-widget-domain.com/widget.js"
 *     data-widget-id="YOUR_WIDGET_ID"
 *   ></script>
 *
 * Optional data attributes:
 *   data-position="bottom-left"   (default: bottom-right)
 *
 * This script is written in plain ES5-compatible JavaScript so it runs on
 * any host page without transpilation.
 *
 * It injects a full-viewport transparent iframe that hosts the React widget,
 * giving complete CSS isolation from the host website.
 *
 * NO secret keys are present in this file.
 */

(function () {
  'use strict';

  // Prevent double-initialisation
  if (window.__chatbotWidgetLoaded) return;
  window.__chatbotWidgetLoaded = true;

  // Read configuration from the <script> tag's data attributes
  var scripts = document.querySelectorAll('script[data-widget-id]');
  var currentScript = scripts[scripts.length - 1];

  var widgetId = currentScript
    ? currentScript.getAttribute('data-widget-id')
    : null;
  var position =
    (currentScript && currentScript.getAttribute('data-position')) ||
    'bottom-right';

  if (!widgetId) {
    console.error('[ChatWidget] data-widget-id attribute is required.');
    return;
  }

  // Derive the widget server origin from this script's src URL
  var scriptSrc = (currentScript && currentScript.src) || '';
  var widgetOrigin = '';
  try {
    widgetOrigin = new URL(scriptSrc).origin;
  } catch (_) {
    widgetOrigin = window.location.origin; // same-origin fallback
  }

  var widgetPageUrl =
    widgetOrigin +
    '/widget/' +
    encodeURIComponent(widgetId) +
    '?position=' +
    encodeURIComponent(position);

  // Create the full-viewport transparent iframe overlay
  var iframe = document.createElement('iframe');
  iframe.setAttribute('src', widgetPageUrl);
  iframe.setAttribute('title', 'Chat Widget');
  iframe.setAttribute('aria-label', 'Chat Widget');
  iframe.setAttribute('allowtransparency', 'true');
  iframe.setAttribute('frameborder', '0');
  iframe.setAttribute('scrolling', 'no');

  // Cover the full viewport; background is transparent so the widget chrome
  // is the only visible element. pointer-events:none lets host clicks pass
  // through when the chat window is closed.
  iframe.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    'width:100%',
    'height:100%',
    'border:none',
    'z-index:2147483647',
    'pointer-events:none',
    'background:transparent',
    'overflow:hidden',
  ].join(';');

  // Mount iframe to DOM (after DOMContentLoaded if needed)
  function mount() {
    document.body.appendChild(iframe);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  // postMessage bridge — toggle pointer-events based on chat open/close state
  window.addEventListener('message', function (event) {
    if (event.origin !== widgetOrigin) return;
    var data = event.data;
    if (!data || data.type !== 'chatbot-widget') return;

    if (data.action === 'open') {
      iframe.style.pointerEvents = 'auto';
    } else if (data.action === 'close' || data.action === 'ready') {
      iframe.style.pointerEvents = 'none';
    }
  });

  // Public API — accessible as window.ChatbotWidget on the host page
  window.ChatbotWidget = {
    open: function () {
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage(
          { type: 'chatbot-widget', action: 'open' },
          widgetOrigin,
        );
      }
    },
    close: function () {
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage(
          { type: 'chatbot-widget', action: 'close' },
          widgetOrigin,
        );
      }
    },
    destroy: function () {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      window.__chatbotWidgetLoaded = false;
      delete window.ChatbotWidget;
    },
  };
})();
