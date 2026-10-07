import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 30-minute fare freshness plus at most 30 minutes of stale CDN serving.
  expireTime: 3600,
  async headers() {
    return [{
      source: "/sitemap.xml",
      headers: [{ key: "Vercel-CDN-Cache-Control", value: "public, s-maxage=1800, stale-while-revalidate=1800" }],
    }];
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
