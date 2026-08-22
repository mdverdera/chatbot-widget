/**
 * widget.js - Public embeddable entry point
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
 *   data-theme="light|dark|auto"  (default: auto)
 *
 * This script is written in plain ES5-compatible JavaScript so it runs on
 * any host page without transpilation.
 *
 * It injects a full-viewport transparent iframe that hosts the React widget,
 * giving complete CSS isolation from the host website.
 *
 * Click-through design:
 *   The iframe covers the full viewport but is completely transparent.
 *   Inside the iframe, html/body have pointer-events:none so clicks on
 *   transparent areas fall through to the host page. Only the widget button
 *   and chat window have pointer-events:auto (set in the widget's CSS).
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
  var theme =
    (currentScript && currentScript.getAttribute('data-theme')) ||
    'auto';

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
    encodeURIComponent(position) +
    '&theme=' +
    encodeURIComponent(theme);

  // Create the full-viewport transparent iframe overlay.
  // pointer-events:auto on the iframe is required so that clicks on the
  // widget button (which sets pointer-events:auto on itself inside the iframe)
  // are actually received. The transparent background click-through is
  // achieved via html/body { pointer-events:none } inside the widget page.
  var iframe = document.createElement('iframe');
  iframe.setAttribute('src', widgetPageUrl);
  iframe.setAttribute('title', 'Chat Widget');
  iframe.setAttribute('aria-label', 'Chat Widget');
  iframe.setAttribute('allowtransparency', 'true');
  iframe.setAttribute('frameborder', '0');
  iframe.setAttribute('scrolling', 'no');

  iframe.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    'width:100%',
    'height:100%',
    'border:none',
    'z-index:2147483647',
    'pointer-events:auto',
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

  // Public API - accessible as window.ChatbotWidget on the host page
  window.ChatbotWidget = {
    open: function () {
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage(
          { type: 'chatbot-widget', action: 'open' },
          widgetOrigin
        );
      }
    },
    close: function () {
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage(
          { type: 'chatbot-widget', action: 'close' },
          widgetOrigin
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