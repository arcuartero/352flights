import type { Metadata } from "next";

import { V2Landing } from "@/components/v2-landing";
import { buildHomeBoardDestinations } from "@/lib/home-board";
import { getPublicDealsPageData } from "@/lib/ops";

import "./home.css";

export const metadata: Metadata = {
  title: "+352 Flights — Never miss a cheap flight from Luxembourg",
  description:
    "We watch every fare out of Luxembourg and write to you only when it's genuinely cheap. No noise — just the right deals, at the right time.",
};

export default async function HomePage() {
  const data = await getPublicDealsPageData();
  const boardDestinations = buildHomeBoardDestinations(data.deals);

  return <V2Landing boardDestinations={boardDestinations} deals={data.deals} />;
}
