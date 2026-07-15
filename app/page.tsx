import type { Metadata } from "next";

import { V2Landing } from "@/components/v2-landing";
import { getDestinationPhotoUrlMap } from "@/lib/destination-photo-storage";
import { buildHomeBoardDestinations } from "@/lib/home-board";
import { getPublicDealsPageData } from "@/lib/ops";

import "./home.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Vuelos baratos desde Luxemburgo",
  description:
    "Encuentra vuelos baratos desde Luxemburgo con precios verificados, alertas de bajadas y rutas para escapadas, playa y vacaciones escolares.",
  alternates: {
    canonical: "/",
    languages: {
      "es-LU": "/",
    },
  },
};

export default async function HomePage() {
  const [data, destinationPhotoUrls] = await Promise.all([
    getPublicDealsPageData(),
    getDestinationPhotoUrlMap(),
  ]);
  const boardDestinations = buildHomeBoardDestinations(data.deals);

  return (
    <V2Landing
      boardDestinations={boardDestinations}
      deals={data.deals}
      destinationPhotoUrls={destinationPhotoUrls}
    />
  );
}
