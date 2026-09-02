import type { Metadata } from "next";

import { RootDocument } from "@/components/root-document";
import { getSiteUrl } from "@/lib/env";

import "../globals.css";
import "../home.css";
import "../public-deals-date-picker.css";
import "../public-deals-price-range.css";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: "Unsubscribe from flight alerts | +352 Flights",
  description: "Stop receiving emails from your private +352 Flights alert profile.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function UnsubscribeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RootDocument locale="en">{children}</RootDocument>;
}
