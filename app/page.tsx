import type { Metadata } from "next";

import { V2Landing } from "@/components/v2-landing";
import { getDestinationPhotoUrlMap } from "@/lib/destination-photo-storage";
import { buildHomeBoardDestinations, buildHomeRecentDrops } from "@/lib/home-board";
import { getPublicDealsPageData } from "@/lib/ops";

import "./home.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "You know when to fly. We'll find where.",
  description:
    "We watch every fare out of LUX and write to you only when it's genuinely cheap. No noise — just the right deals, at the right time.",
  alternates: {
    canonical: "/",
  },
};

export default async function HomePage() {
  const [data, destinationPhotoUrls] = await Promise.all([
    getPublicDealsPageData(),
    getDestinationPhotoUrlMap(),
  ]);
  const boardDestinations = buildHomeBoardDestinations(data.deals);
  const recentDrops = buildHomeRecentDrops(data.deals);

  return (
    <V2Landing
      boardDestinations={boardDestinations}
      deals={data.deals}
      destinationPhotoUrls={destinationPhotoUrls}
      recentDrops={recentDrops}
    />
  );
}
