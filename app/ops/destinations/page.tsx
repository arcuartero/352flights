import { DestinationPhotoManager } from "@/components/destination-photo-manager";
import { OpsSubnav } from "@/components/ops-subnav";
import routes from "@/data/lux-routes.json";
import { toDestinationSlug } from "@/lib/destination-slugs";

export const dynamic = "force-dynamic";

type RouteSeed = {
  destination_airport: string;
  destination_city: string;
};

function getDestinations() {
  const destinations = new Map<
    string,
    {
      city: string;
      slug: string;
      airports: Set<string>;
    }
  >();

  for (const route of routes as RouteSeed[]) {
    const city = route.destination_city.trim();
    const slug = toDestinationSlug(city);
    const destination = destinations.get(slug) ?? {
      city,
      slug,
      airports: new Set<string>(),
    };
    destination.airports.add(route.destination_airport);
    destinations.set(slug, destination);
  }

  return [...destinations.values()]
    .map((destination) => ({
      city: destination.city,
      slug: destination.slug,
      airports: [...destination.airports].sort(),
    }))
    .sort((left, right) => left.city.localeCompare(right.city));
}

export default function OpsDestinationsPage() {
  const destinations = getDestinations();

  return (
    <main className="ops-shell">
      <OpsSubnav />
      <div className="ops-shell__center-panel">
        <section className="ops-panel ops-panel--wide">
          <div className="ops-panel__header">
            <div>
              <h1>Destination photos</h1>
              <p>
                Upload one manual image per destination. Public destination cards will
                use it automatically and fall back to the generic image when no upload
                exists.
              </p>
            </div>
          </div>
          <DestinationPhotoManager destinations={destinations} />
        </section>
      </div>
    </main>
  );
}
