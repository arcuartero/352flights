import type { CampaignPreviewDeal } from "@/lib/ops-shared";

export type HomeBoardDestination = {
  city: string;
  landmark: string;
  price: number;
  drop: number | null;
  nights: string;
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

const FALLBACK_HOME_BOARD_DESTINATIONS: HomeBoardDestination[] = [
  {
    city: "Lisbon",
    landmark: "Belem Tower",
    price: 39,
    drop: 47,
    nights: "4 nights",
  },
  {
    city: "Rome",
    landmark: "Colosseum",
    price: 44,
    drop: 41,
    nights: "3 nights",
  },
  {
    city: "Barcelona",
    landmark: "Sagrada Familia",
    price: 36,
    drop: 38,
    nights: "weekend",
  },
  {
    city: "Budapest",
    landmark: "Hungarian Parliament Building",
    price: 49,
    drop: 35,
    nights: "5 nights",
  },
  {
    city: "Porto",
    landmark: "Dom Luis I Bridge",
    price: 42,
    drop: 36,
    nights: "4 nights",
  },
];

function normalizeDestinationKey(city: string) {
  return city.trim().toLowerCase();
}

function getDropPercent(deal: CampaignPreviewDeal) {
  if (deal.dropRatio === null) {
    return null;
  }

  return Math.max(0, Math.round((1 - deal.dropRatio) * 100));
}

function formatNights(nights: number) {
  return `${nights} ${nights === 1 ? "night" : "nights"}`;
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

export function buildHomeBoardDestinations(
  deals: readonly CampaignPreviewDeal[],
  limit: number = 5,
): HomeBoardDestination[] {
  const groups = new Map<string, CampaignPreviewDeal[]>();

  for (const deal of deals) {
    const city = deal.destinationCity?.trim();
    if (!city || deal.dealPrice <= 0) {
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
    return FALLBACK_HOME_BOARD_DESTINATIONS.slice(0, limit);
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
        nights: formatNights(bestDeal.tripNights),
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
