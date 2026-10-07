"use client";

import { type PublicDealsSelectOption as SelectOption } from "@/components/public-deals-select";
import type { PublicDealsPageData } from "@/lib/ops/types";
import type { CampaignPreviewDeal } from "@/lib/ops-shared";
import { type PublicDealsSearchResult } from "@/lib/public-deals-query";
import {
  type DealSearchSort,
  type DealSearchFilters,
} from "@/lib/public-deals-search";

export type PublicDealsExplorerProps = {
  data: PublicDealsPageData;
  destinationCatalog?: {
    options: SelectOption[];
    popularOptionValues: string[];
  };
  destinationPhotoUrls?: Record<string, string>;
  initialFilters?: DealSearchFilters;
  initialSearchResult?: PublicDealsSearchResult;
  initialSharedFareId?: string | null;
  initialSort?: DealSearchSort;
  mode: "results" | "city";
  lockedDestinationCity?: string;
  searchPathname?: string;
};

export type DestinationPhotoUrlMap = Record<string, string>;

export type QuickChip =
  | "weekend"
  | "this_weekend"
  | "weeklong"
  | "school_holidays"
  | "under_50"
  | "cheap_direct"
  | "direct"
  | "beach"
  | "city"
  | "nature";

export type MobileResultsPanel = "sort" | "filters" | null;

export type TravelStyleCard = {
  key: string;
  label: string;
  description: string;
  fromPrice: number | null;
  matches: number;
  chip: QuickChip | null;
  icon: string;
  accentClass: string;
  imageCity: string;
  imageLandmarkTitle: string;
};

export type SearchCityGroup = {
  key: string;
  city: string;
  airport: string;
  deals: CampaignPreviewDeal[];
  lowestPrice: number;
};

export type FooterLink = {
  href: string;
  label: string;
};

export type FooterSocial = {
  label: string;
  icon: string;
};

export type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

export type AirlineFilterOption = {
  key: string;
  label: string;
};
