import { NextRequest, NextResponse } from "next/server";

import { getMonthlyPriceAverages } from "@/lib/monthly-price-averages";
import type { TripFilter } from "@/lib/public-deals-search";

export const dynamic = "force-dynamic";

const TRIP_TYPES = new Set<TripFilter>(["any", "weekend", "weeklong", "long_stay"]);

export async function GET(request: NextRequest) {
  const destination = request.nextUrl.searchParams.get("destination")?.trim() ?? "";
  const origin = request.nextUrl.searchParams.get("origin")?.trim().toUpperCase() ?? "LUX";
  const directOnly = request.nextUrl.searchParams.get("direct") !== "0";
  const requestedTrip = request.nextUrl.searchParams.get("trip") ?? "any";
  const tripType = TRIP_TYPES.has(requestedTrip as TripFilter)
    ? (requestedTrip as TripFilter)
    : "any";

  if (!destination || !/^[A-Z]{3}$/.test(origin)) {
    return NextResponse.json({ error: "Invalid route." }, { status: 400 });
  }

  try {
    const data = await getMonthlyPriceAverages({
      originAirport: origin,
      destinationSlug: destination,
      directOnly,
      tripType,
    });
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900",
      },
    });
  } catch (error) {
    console.error("[monthly-prices] Could not calculate monthly averages.", error);
    return NextResponse.json(
      { error: "Monthly prices could not be loaded." },
      { status: 500 },
    );
  }
}
