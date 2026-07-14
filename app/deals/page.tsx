import type { Metadata } from "next";

import { PublicDealsExplorer } from "@/components/public-deals-explorer";
import { getPublicDealsPageData } from "@/lib/ops";

export const metadata: Metadata = {
  title: "Ofertas de vuelos baratos desde Luxemburgo",
  description:
    "Explora ofertas de vuelos baratos desde Luxemburgo con tarifas en directo, comparacion historica y filtros para playa, fin de semana y vuelos directos.",
  alternates: {
    canonical: "/deals",
    languages: {
      "es-LU": "/deals",
    },
  },
};

export default async function DealsPage() {
  const data = await getPublicDealsPageData();

  return (
    <main className="page-shell page-shell--deals">
      <PublicDealsExplorer data={data} />
    </main>
  );
}
