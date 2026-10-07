import { NextRequest, NextResponse } from "next/server";

import { getPublicSearchDealsPageData } from "@/lib/ops/public-data";
import {
  buildPublicDealsSearchResult,
  PUBLIC_DEALS_SEARCH_MAX_LIMIT,
  PUBLIC_DEALS_SEARCH_PAGE_SIZE,
} from "@/lib/public-deals-query";
import {
  parseDealSearchFilters,
  parseDealSearchSort,
} from "@/lib/public-deals-search";

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
  const offset = Number(request.nextUrl.searchParams.get("offset") ?? 0);
  if (!Number.isSafeInteger(offset) || offset < 0) {
    return NextResponse.json(
      { error: "Invalid search offset." },
      { status: 400 },
    );
  }
  const data = await getPublicSearchDealsPageData();
  const result = buildPublicDealsSearchResult(
    data,
    filters,
    sort,
    limit,
    new Date(),
    offset,
  );

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Vercel-CDN-Cache-Control": "no-store",
    },
  });
}
