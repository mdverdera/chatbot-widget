/** @type {import('next').NextConfig} */

/**
 * Allowed origins for widget iframe embedding and API access.
 *
 * Phase 3: CORS on the /api routes is tightened — only origins registered in
 * WIDGET_REGISTRY are allowed.  next.config.js sets a permissive baseline for
 * the /widget/* pages (iframes must be embeddable) but the API routes enforce
 * origin validation server-side in each handler.
 *
 * The wildcard Access-Control-Allow-Origin on /api/* is intentionally removed.
 * Each API handler validates the Origin header against the widget registry.
 */

const nextConfig = {
  reactStrictMode: true,

  async headers() {
    return [
      {
        // Widget iframe pages must be embeddable from any origin.
        // The per-request security is enforced inside the widget registry lookup.
        source: '/widget/:path*',
        headers: [
          { key: 'X-Frame-Options',                value: 'ALLOWALL' },
          { key: 'Content-Security-Policy',         value: "frame-ancestors *" },
          { key: 'Access-Control-Allow-Origin',     value: '*' },
        ],
      },
      {
        // API routes: allow pre-flight from any origin so the browser doesn't
        // block OPTIONS requests before our handler can run.
        // Actual origin enforcement happens inside each handler via the registry.
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization',
          },
          // NOTE: Access-Control-Allow-Origin is NOT set here to a wildcard.
          // Each API handler reads the Origin header and validates it against
          // the widget registry before responding, which provides the correct
          // per-origin CORS response for allowed origins.
        ],
      },
    ];
  },
};

module.exports = nextConfig;
