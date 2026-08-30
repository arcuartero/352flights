import { V2Landing } from "@/components/v2-landing";
import { getDestinationPhotoUrlMap } from "@/lib/destination-photo-storage";
import { buildHomeBoardDestinations, buildHomeRecentDrops } from "@/lib/home-board";
import { getPublicDealsPageData } from "@/lib/ops";

export async function HomePageContent() {
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
