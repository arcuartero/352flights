import type { CampaignPreviewDeal } from "@/lib/ops-shared";

export type HomeBoardDestination = {
  city: string;
  landmark: string;
  price: number;
  drop: number | null;
  tripNights: number;
};

export type HomeRecentDrop = {
  city: string;
  route: string;
  price: number;
  drop: number | null;
};

const LANDMARK_TITLE_BY_DESTINATION: Record<string, string> = {
  agadir: "Kasbah of Agadir Oufella",
  ajaccio: "Citadel of Ajaccio",
  antalya: "Hadrian's Gate",
  "abu dhabi": "Sheikh Zayed Grand Mosque",
  barcelona: "Sagrada Familia",
  berlin: "Brandenburg Gate",
  bordeaux: "Place de la Bourse",
  budapest: "Hungarian Parliament Building",
  cagliari: "Saint Remy's Bastion",
  corfu: "Old Fortress, Corfu",
  copenhagen: "The Little Mermaid",
  djerba: "El Ghriba Synagogue",
  dublin: "Ha'penny Bridge",
  dubai: "Dubai Fountain",
  edinburgh: "Edinburgh Castle",
  faro: "Arco da Vila",
  florence: "Ponte Vecchio",
  heraklion: "Knossos",
  hurghada: "El Mina Mosque",
  istanbul: "Hagia Sophia",
  "jerez de la frontera": "Alcazar of Jerez de la Frontera",
  kos: "Neratzia Castle",
  lisbon: "Belem Tower",
  london: "Big Ben",
  madrid: "Puerta de Alcala",
  malaga: "Alcazaba of Malaga",
  malta: "St. John's Co-Cathedral",
  marrakech: "Koutoubia Mosque",
  milan: "Milan Cathedral",
  munich: "Marienplatz",
  mykonos: "Windmills of Mykonos",
  nice: "Place Massena",
  "new york": "Brooklyn Bridge",
  palma: "Palma Cathedral",
  paris: "Pont Alexandre III",
  porto: "Dom Luis I Bridge",
  rimini: "Arch of Augustus",
  rome: "Colosseum",
  stockholm: "Stockholm City Hall",
  stuttgart: "Schlossplatz",
  tunis: "Al-Zaytuna Mosque",
  valencia: "City of Arts and Sciences",
  vienna: "Schonbrunn Palace",
  warsaw: "Royal Castle, Warsaw",
  zadar: "Sea Organ",
  zurich: "Quaibrucke, Zurich",
};

function normalizeDestinationKey(city: string) {
  return city.trim().toLowerCase();
}

function getDropPercent(deal: CampaignPreviewDeal) {
  if (deal.dropRatio === null) {
    return null;
  }

  return Math.max(0, Math.round((1 - deal.dropRatio) * 100));
}

function getReliableDropPercent(deal: CampaignPreviewDeal) {
  const hasReliableBaseline =
    deal.baselinePrice !== null &&
    deal.baselinePrice > 0 &&
    deal.historyPoints >= 3 &&
    deal.dropRatio !== null &&
    deal.dropRatio > 0 &&
    deal.dropRatio < 1;

  return hasReliableBaseline ? getDropPercent(deal) : null;
}

function isNonstopDeal(deal: CampaignPreviewDeal) {
  const routeIsNonstop = deal.maxStops.trim().toUpperCase() === "NON_STOP";
  const outboundIsNonstop =
    deal.outboundStopCount === null ? routeIsNonstop : deal.outboundStopCount === 0;
  const returnIsNonstop =
    deal.returnStopCount === null ? routeIsNonstop : deal.returnStopCount === 0;

  return outboundIsNonstop && returnIsNonstop;
}

function getVerifiedTimestamp(deal: CampaignPreviewDeal) {
  if (!deal.verifiedAt) {
    return 0;
  }

  const timestamp = new Date(deal.verifiedAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function compareBoardDeals(left: CampaignPreviewDeal, right: CampaignPreviewDeal) {
  if (left.dealPrice !== right.dealPrice) {
    return left.dealPrice - right.dealPrice;
  }

  const leftDrop = getDropPercent(left) ?? -1;
  const rightDrop = getDropPercent(right) ?? -1;
  if (leftDrop !== rightDrop) {
    return rightDrop - leftDrop;
  }

  if (left.score !== right.score) {
    return right.score - left.score;
  }

  const leftVerified = left.verifiedAt ? new Date(left.verifiedAt).getTime() : 0;
  const rightVerified = right.verifiedAt ? new Date(right.verifiedAt).getTime() : 0;
  return rightVerified - leftVerified;
}

function compareRecentDropDeals(left: CampaignPreviewDeal, right: CampaignPreviewDeal) {
  const freshnessDifference = getVerifiedTimestamp(right) - getVerifiedTimestamp(left);
  if (freshnessDifference !== 0) {
    return freshnessDifference;
  }

  const leftDrop = getReliableDropPercent(left) ?? -1;
  const rightDrop = getReliableDropPercent(right) ?? -1;
  if (leftDrop !== rightDrop) {
    return rightDrop - leftDrop;
  }

  if (left.dealPrice !== right.dealPrice) {
    return left.dealPrice - right.dealPrice;
  }

  return left.destinationCity.localeCompare(right.destinationCity);
}

function getOriginAirport(deal: CampaignPreviewDeal) {
  const match = deal.routeLabel.match(/^([A-Z0-9]{3})\s*->/i);
  return match?.[1]?.toUpperCase() ?? "LUX";
}

export function buildHomeBoardDestinations(
  deals: readonly CampaignPreviewDeal[],
  limit: number = 5,
): HomeBoardDestination[] {
  const groups = new Map<string, CampaignPreviewDeal[]>();

  for (const deal of deals) {
    const city = deal.destinationCity?.trim();
    if (!city || deal.dealPrice <= 0 || !isNonstopDeal(deal)) {
      continue;
    }

    const key = normalizeDestinationKey(city);
    const existing = groups.get(key);
    if (existing) {
      existing.push(deal);
    } else {
      groups.set(key, [deal]);
    }
  }

  if (groups.size === 0) {
    return [];
  }

  return [...groups.entries()]
    .map(([key, cityDeals]) => {
      const [bestDeal] = [...cityDeals].sort(compareBoardDeals);
      const city = bestDeal.destinationCity.trim();

      return {
        city,
        landmark: LANDMARK_TITLE_BY_DESTINATION[key] ?? city,
        price: bestDeal.dealPrice,
        drop: getDropPercent(bestDeal),
        tripNights: bestDeal.tripNights,
      };
    })
    .sort((left, right) => {
      const leftDrop = left.drop ?? -1;
      const rightDrop = right.drop ?? -1;
      if (leftDrop !== rightDrop) {
        return rightDrop - leftDrop;
      }

      if (left.price !== right.price) {
        return left.price - right.price;
      }

      return left.city.localeCompare(right.city);
    })
    .slice(0, limit);
}

export function buildHomeRecentDrops(
  deals: readonly CampaignPreviewDeal[],
  limit: number = 8,
): HomeRecentDrop[] {
  const latestFareByDestination = new Map<string, CampaignPreviewDeal>();

  for (const deal of deals) {
    const city = deal.destinationCity?.trim();
    const destinationAirport = deal.destinationAirport?.trim().toUpperCase();

    if (!city || !destinationAirport || deal.dealPrice <= 0) {
      continue;
    }

    const existing = latestFareByDestination.get(destinationAirport);
    if (!existing || compareRecentDropDeals(deal, existing) < 0) {
      latestFareByDestination.set(destinationAirport, deal);
    }
  }

  return [...latestFareByDestination.values()]
    .sort(compareRecentDropDeals)
    .slice(0, limit)
    .map((deal) => ({
      city: deal.destinationCity.trim(),
      route: `${getOriginAirport(deal)} → ${deal.destinationCity.trim()}`,
      price: deal.dealPrice,
      drop: getReliableDropPercent(deal),
    }));
}
