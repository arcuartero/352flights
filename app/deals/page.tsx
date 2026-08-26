import type { Metadata } from "next";

import { PublicDealsExplorer } from "@/components/public-deals-explorer";
import { getDestinationPhotoUrlMap } from "@/lib/destination-photo-storage";
import { getPublicDealsPageData } from "@/lib/ops";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Find flights from Luxembourg, while they're still cheap.",
  description:
    "Every day we surface the fares that still look unusually good, then group them by timing, trip length, and travel style.",
  alternates: {
    canonical: "/deals",
  },
};

export default async function DealsPage() {
  const [data, destinationPhotoUrls] = await Promise.all([
    getPublicDealsPageData(),
    getDestinationPhotoUrlMap(),
  ]);

  return (
    <main className="page-shell page-shell--deals">
      <PublicDealsExplorer data={data} destinationPhotoUrls={destinationPhotoUrls} />
    </main>
  );
}
