import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
