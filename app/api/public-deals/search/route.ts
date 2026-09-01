import { NextRequest, NextResponse } from "next/server";

import { getPublicSearchDealsPageData } from "@/lib/ops";
import {
  buildPublicDealsSearchResult,
  PUBLIC_DEALS_SEARCH_MAX_LIMIT,
  PUBLIC_DEALS_SEARCH_PAGE_SIZE,
} from "@/lib/public-deals-query";
import { parseDealSearchFilters, parseDealSearchSort } from "@/lib/public-deals-search";

export async function GET(request: NextRequest) {
  const filters = parseDealSearchFilters(request.nextUrl.searchParams);
  const sort = parseDealSearchSort(request.nextUrl.searchParams);
  const requestedLimit = Number(request.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(
        PUBLIC_DEALS_SEARCH_MAX_LIMIT,
        Math.max(PUBLIC_DEALS_SEARCH_PAGE_SIZE, Math.round(requestedLimit)),
      )
    : PUBLIC_DEALS_SEARCH_PAGE_SIZE;
  const data = await getPublicSearchDealsPageData();
  const result = buildPublicDealsSearchResult(data, filters, sort, limit);

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Vercel-CDN-Cache-Control":
        "public, s-maxage=1800, stale-while-revalidate=1800",
    },
  });
}
