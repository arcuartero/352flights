import type { Metadata } from "next";

import { RootDocument } from "@/components/root-document";
import { getSiteUrl } from "@/lib/env";

import "../globals.css";
import "../home.css";
import "../public-deals-date-picker.css";
import "../public-deals-price-range.css";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
};

export default function LegalRootLayout({ children }: { children: React.ReactNode }) {
  return <RootDocument locale="en">{children}</RootDocument>;
}
