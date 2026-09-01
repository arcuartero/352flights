import { hasDestinationEditorialContent } from "@/lib/destination-content";
import { matchesDestinationSlug, toDestinationSlug } from "@/lib/destination-slugs";
import type { PublicDealsPageData } from "@/lib/ops";

/**
 * Destination pages remain useful and indexable while they have live public
 * inventory or deliberately written destination content. A destination that
 * has neither is just the empty results template, so it stays accessible but
 * is temporarily removed from search indexes and the sitemap.
 *
 * Fail open when the fare source is unavailable: an infrastructure failure
 * must never remove otherwise valid pages from the index.
 */
export function isDestinationIndexable(
  destination: string,
  data: Pick<PublicDealsPageData, "configured" | "schemaReady" | "deals">,
) {
  if (!data.configured || !data.schemaReady) {
    return true;
  }

  const slug = toDestinationSlug(destination);
  const hasLivePublicFares = data.deals.some((deal) =>
    matchesDestinationSlug(deal.destinationCity, slug),
  );

  return hasLivePublicFares || hasDestinationEditorialContent(slug);
}
