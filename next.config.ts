import type { NextConfig } from "next";

// Applied by Next itself so they hold on any host (Vercel or the reverse proxy in front of the app).
// A full script/style CSP is not enforced yet: GA4, Leaflet tiles and remote photos need a report-only pass first.
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
];

const nextConfig: NextConfig = {
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
