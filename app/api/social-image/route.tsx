import { ImageResponse } from "next/og";

import { getDestinationPhotoUrlMap } from "@/lib/destination-photo-storage";
import { toDestinationSlug } from "@/lib/destination-slugs";
import { getSiteUrl } from "@/lib/env";
import {
  SOCIAL_IMAGE_HEIGHT,
  SOCIAL_IMAGE_WIDTH,
} from "@/lib/social-image";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_CITY_SLUG = "bordeaux";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const requestedCitySlug = toDestinationSlug(
    requestUrl.searchParams.get("city") ?? "",
  );
  const destinationPhotos = await getDestinationPhotoUrlMap();
  const fallbackPhotoUrl =
    destinationPhotos[DEFAULT_CITY_SLUG] ??
    Object.values(destinationPhotos)[0] ??
    new URL("/destinations/european-city.webp", requestUrl.origin).toString();
  const cityPhotoUrl =
    destinationPhotos[requestedCitySlug] ?? fallbackPhotoUrl;
  const configuredSiteUrl = getSiteUrl();
  const logoOrigin = configuredSiteUrl.includes("localhost")
    ? requestUrl.origin
    : configuredSiteUrl;
  const logoUrl = new URL("/v2-logo.png", logoOrigin).toString();

  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          backgroundColor: "#dcecff",
        }}
      >
        <img
          alt=""
          height={SOCIAL_IMAGE_HEIGHT}
          src={cityPhotoUrl}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
          width={SOCIAL_IMAGE_WIDTH}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            display: "flex",
            width: "100%",
            height: "100%",
            background:
              "linear-gradient(180deg, rgba(5, 20, 42, 0.12) 0%, rgba(5, 20, 42, 0.28) 100%)",
          }}
        />
        <div
          style={{
            position: "relative",
            display: "flex",
            width: 660,
            height: 240,
            alignItems: "center",
            justifyContent: "center",
            padding: "34px 52px",
            border: "2px solid rgba(255, 255, 255, 0.96)",
            borderRadius: 42,
            background: "rgba(255, 255, 255, 0.94)",
            boxShadow: "0 28px 72px rgba(5, 20, 42, 0.34)",
          }}
        >
          <img
            alt="+352 Flights"
            height={174}
            src={logoUrl}
            style={{
              width: 556,
              height: 174,
              objectFit: "contain",
            }}
            width={556}
          />
        </div>
      </div>
    ),
    {
      width: SOCIAL_IMAGE_WIDTH,
      height: SOCIAL_IMAGE_HEIGHT,
      headers: {
        "Cache-Control":
          "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
