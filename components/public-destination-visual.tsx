import Image from "next/image";

type DestinationVisualProps = {
  destinationCity: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
  alt?: string;
  landmarkTitle?: string;
};

const COASTAL_DESTINATIONS = new Set([
  "Agadir", "Alicante", "Barcelona", "Bari", "Bodrum", "Cagliari", "Corfu",
  "Dubrovnik", "Faro", "Fuerteventura", "Gran Canaria", "Heraklion", "Ibiza",
  "Lanzarote", "Madeira", "Malaga", "Mallorca", "Malta", "Menorca", "Naples",
  "Nice", "Palermo", "Porto", "Split", "Tenerife", "Thessaloniki", "Valencia",
]);

const NATURE_DESTINATIONS = new Set([
  "Bergen", "Geneva", "Innsbruck", "Reykjavik", "Salzburg", "Tromso", "Zurich",
]);

function getDestinationVisual(city: string) {
  if (COASTAL_DESTINATIONS.has(city)) {
    return "/destinations/coastal-town.webp";
  }
  if (NATURE_DESTINATIONS.has(city)) {
    return "/destinations/alpine-nature.webp";
  }
  return "/destinations/european-city.webp";
}

export function DestinationVisual({
  destinationCity,
  className,
  priority = false,
  sizes = "(max-width: 720px) 100vw, 50vw",
}: DestinationVisualProps) {
  return (
    <Image
      alt={`Travel inspiration for ${destinationCity}`}
      className={className}
      fill
      priority={priority}
      sizes={sizes}
      src={getDestinationVisual(destinationCity)}
      style={{ objectFit: "cover" }}
    />
  );
}
