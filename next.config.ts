import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
  async headers() {
    const publicDealsCacheHeaders = [
      {
        key: "Vercel-CDN-Cache-Control",
        value: "public, s-maxage=1800, stale-while-revalidate=1800",
      },
    ];

    return [
      {
        source: "/deals/:path*",
        headers: publicDealsCacheHeaders,
      },
      {
        source:
          "/:locale(fr|de|pt|it|es)/:section(deals|offres|angebote|ofertas|offerte)/:path*",
        headers: publicDealsCacheHeaders,
      },
    ];
  },
};

export default nextConfig;
