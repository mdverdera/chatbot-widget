/** @type {import('next').NextConfig} */

/**
 * Production-hardened Next.js configuration.
 *
 * Security model:
 *
 * 1. Widget iframe pages (/widget/*):
 *    Must be embeddable from any origin (that is the product).
 *    X-Frame-Options: ALLOWALL + frame-ancestors * permits embedding.
 *    Per-request security is enforced server-side by the widget registry.
 *
 * 2. API routes (/api/*):
 *    CORS pre-flight is permitted globally so OPTIONS is never blocked.
 *    Actual origin enforcement happens inside each handler via the
 *    widget registry — only registered origins receive a valid ACAO header.
 *    CMS-facing endpoints (ingest, retrieve, process, delete) require
 *    Bearer authentication and are not accessible from the browser.
 *
 * 3. Security headers on all routes:
 *    X-Content-Type-Options: nosniff      — MIME sniffing protection
 *    X-DNS-Prefetch-Control: off          — privacy
 *    Referrer-Policy: strict-origin       — leaks no path info
 *    Permissions-Policy                    — disable unused browser APIs
 *    Strict-Transport-Security            — HTTPS enforcement (production)
 *
 * Environment separation:
 *    - process.env.NODE_ENV === 'production' enables HSTS and stricter headers.
 *    - Development mode relaxes some headers for local testing convenience.
 *
 * NEVER add Access-Control-Allow-Origin: * to /api/* at this level.
 * Per-handler origin validation is the correct mechanism.
 */

const isProd = process.env.NODE_ENV === 'production';

/** Security headers applied to ALL routes. */
const GLOBAL_SECURITY_HEADERS = [
  // Prevent MIME-type sniffing
  { key: 'X-Content-Type-Options',  value: 'nosniff' },
  // Disable browser DNS prefetch (minor privacy improvement)
  { key: 'X-DNS-Prefetch-Control',  value: 'off' },
  // Do not send the full URL in the Referer header
  { key: 'Referrer-Policy',         value: 'strict-origin-when-cross-origin' },
  // Disable access to unused browser APIs
  {
    key: 'Permissions-Policy',
    value: [
      'camera=()',
      'microphone=()',
      'geolocation=()',
      'payment=()',
      'usb=()',
    ].join(', '),
  },
  // HSTS: enforce HTTPS in production (1 year, include subdomains)
  ...(isProd
    ? [{
        key:   'Strict-Transport-Security',
        value: 'max-age=31536000; includeSubDomains',
      }]
    : []),
];

const nextConfig = {
  reactStrictMode: true,

  // Disable the X-Powered-By header to avoid advertising the framework version.
  poweredByHeader: false,

  async headers() {
    return [
      // ── Global security headers (all pages + API routes) ──────────────────
      {
        source: '/:path*',
        headers: GLOBAL_SECURITY_HEADERS,
      },

      // ── Widget iframe pages ───────────────────────────────────────────────
      // Must be embeddable from any origin — this is the product's core feature.
      // Per-request security (widgetId + origin validation) runs server-side.
      {
        source: '/widget/:path*',
        headers: [
          { key: 'X-Frame-Options',            value: 'ALLOWALL' },
          { key: 'Content-Security-Policy',    value: "frame-ancestors *" },
          { key: 'Access-Control-Allow-Origin', value: '*' },
        ],
      },

      // ── API routes ────────────────────────────────────────────────────────
      // Allow pre-flight from any origin so the browser can send OPTIONS
      // before our handler validates the actual request.
      // Access-Control-Allow-Origin is intentionally NOT set globally here;
      // each handler validates the Origin against the widget registry and
      // sets it only for allowed origins.
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, DELETE, OPTIONS' },
          {
            key:   'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization',
          },
          // Prevent API responses from being cached by intermediary proxies.
          { key: 'Cache-Control', value: 'no-store' },
          // Never serve API responses inside an iframe.
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
