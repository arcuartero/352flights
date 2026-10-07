import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Full policy in report-only mode: violations go to /api/csp-report without blocking anything.
// Promote to enforcement once production reports stay empty. Inline scripts stay allowed because
// nonces would force dynamic rendering of the cached public pages.
const reportOnlyPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://www.googletagmanager.com`,
  "style-src 'self' 'unsafe-inline'",
  [
    "img-src 'self' data: blob:",
    "https://*.supabase.co",
    "https://images.unsplash.com",
    "https://upload.wikimedia.org",
    "https://images.kiwi.com",
    "https://cdn.jsdelivr.net",
    "https://*.tile.openstreetmap.org",
    "https://www.googletagmanager.com",
    "https://*.google-analytics.com",
  ].join(" "),
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws:" : ""} https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com`,
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "report-uri /api/csp-report",
  "report-to csp",
].join("; ");

// Applied by Next itself so they hold on any host (Vercel or the reverse proxy in front of the app).
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'",
  },
  { key: "Content-Security-Policy-Report-Only", value: reportOnlyPolicy },
  { key: "Reporting-Endpoints", value: 'csp="/api/csp-report"' },
];

const nextConfig: NextConfig = {
  // The e2e suite builds into its own directory so it never clobbers a running dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  typescript: { tsconfigPath: process.env.NEXT_TSCONFIG_PATH || "tsconfig.json" },
  reactStrictMode: true,
  poweredByHeader: false,
  // 30-minute fare freshness plus at most 30 minutes of stale CDN serving.
  expireTime: 3600,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/sitemap.xml",
        headers: [{ key: "Vercel-CDN-Cache-Control", value: "public, s-maxage=1800, stale-while-revalidate=1800" }],
      },
    ];
  },
  images: {
    formats: ["image/avif", "image/webp"],
    qualities: [80, 82],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "byehmkysjqrhpdrtdkjk.supabase.co",
        pathname: "/storage/v1/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
