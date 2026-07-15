import type { Metadata } from "next";

import { PublicDealsExplorer } from "@/components/public-deals-explorer";
import { getPublicSearchDealsPageData } from "@/lib/ops";
import { parseDealSearchFilters, parseDealSearchSort } from "@/lib/public-deals-search";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Buscar vuelos baratos desde Luxemburgo",
  description:
    "Filtra vuelos baratos desde Luxemburgo por destino, playa, fin de semana, vuelos directos, presupuesto y vacaciones escolares.",
  alternates: {
    canonical: "/deals",
    languages: {
      "es-LU": "/deals",
    },
  },
  robots: {
    index: false,
    follow: true,
  },
};

type DealsSearchPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DealsSearchPage({ searchParams }: DealsSearchPageProps) {
  const [data, resolvedSearchParams] = await Promise.all([
    getPublicSearchDealsPageData(),
    searchParams,
  ]);

  return (
    <main className="page-shell page-shell--deals-search">
      <PublicDealsExplorer
        data={data}
        initialFilters={parseDealSearchFilters(resolvedSearchParams)}
        initialSort={parseDealSearchSort(resolvedSearchParams)}
        mode="results"
      />
    </main>
  );
}
