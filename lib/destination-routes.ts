import routes from "@/data/lux-routes.json";
import { toDestinationSlug } from "@/lib/destination-slugs";

const destinationCityBySlug = new Map(
  routes.map((route) => [toDestinationSlug(route.destination_city), route.destination_city]),
);

export function getDestinationCityFromSlug(citySlug: string) {
  return destinationCityBySlug.get(citySlug) ?? null;
}

export function getDestinationSlugs() {
  return [...destinationCityBySlug.keys()].sort((left, right) => left.localeCompare(right));
}
