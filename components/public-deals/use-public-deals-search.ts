"use client";

import { useEffect, useRef, useState } from "react";
import {
  buildDealsSearchHref,
  type DealSearchFilters,
  type DealSearchSort,
} from "@/lib/public-deals-search";
import {
  getPublicDealsSearchQueryKey,
  PUBLIC_DEALS_SEARCH_MAX_LIMIT,
  type PublicDealsSearchResult,
} from "@/lib/public-deals-query";

/** Accumulate bounded server pages; changing filters cancels the previous search. */
export function usePublicDealsSearch(input: {
  enabled: boolean;
  filters: DealSearchFilters;
  sort: DealSearchSort;
  requestedCount: number;
  initialResult?: PublicDealsSearchResult | null;
}) {
  const { enabled, filters, sort, requestedCount, initialResult } = input;
  const queryKey = getPublicDealsSearchQueryKey(filters, sort, 0);
  const cache = useRef<{ key: string; result: PublicDealsSearchResult } | null>(
    null,
  );
  const [result, setResult] = useState(initialResult ?? null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    if (cache.current?.key !== queryKey) {
      const seed =
        initialResult?.offset === 0 &&
        initialResult.queryKey ===
          getPublicDealsSearchQueryKey(filters, sort, initialResult.limit)
          ? initialResult
          : null;
      cache.current = seed ? { key: queryKey, result: seed } : null;
      setResult(seed);
    }
    const cached = cache.current?.result;
    if (
      cached &&
      (cached.nextOffset === null || cached.deals.length >= requestedCount)
    ) {
      setResult({ ...cached, deals: cached.deals.slice(0, requestedCount) });
      setPending(false);
      setError(false);
      return;
    }
    setPending(true);
    setError(false);
    const timeout = window.setTimeout(async () => {
      try {
        let current = cache.current?.result ?? null;
        while (!controller.signal.aborted) {
          const offset = current?.nextOffset ?? 0;
          const url = new URL(
            buildDealsSearchHref(filters, "/api/public-deals/search", sort),
            window.location.origin,
          );
          url.searchParams.set("offset", String(offset));
          url.searchParams.set(
            "limit",
            String(
              Math.min(
                PUBLIC_DEALS_SEARCH_MAX_LIMIT,
                Math.max(10, requestedCount - (current?.deals.length ?? 0)),
              ),
            ),
          );
          const response = await fetch(url, {
            headers: { Accept: "application/json" },
            signal: controller.signal,
          });
          if (!response.ok) throw new Error("Search request failed");
          const page = (await response.json()) as PublicDealsSearchResult;
          if (controller.signal.aborted) return;
          // IDs are stable even if a fare refresh happens between page requests.
          const deals = [
            ...new Map(
              [...(current?.deals ?? []), ...page.deals].map((deal) => [
                deal.id,
                deal,
              ]),
            ).values(),
          ];
          current = { ...page, deals };
          cache.current = { key: queryKey, result: current };
          setResult({
            ...current,
            deals: current.deals.slice(0, requestedCount),
          });
          if (page.nextOffset === null || deals.length >= requestedCount) break;
          if (page.nextOffset <= offset)
            throw new Error("Search pagination did not advance");
        }
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        if (!controller.signal.aborted) setPending(false);
      }
    }, 180);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [
    enabled,
    filters,
    sort,
    queryKey,
    requestedCount,
    initialResult,
    attempt,
  ]);
  return {
    result,
    pending,
    error,
    retry: () => setAttempt((value) => value + 1),
  };
}
