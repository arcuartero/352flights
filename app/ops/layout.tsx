import type { Metadata } from "next";

import { OpsScannerStatusHub } from "@/components/ops-scanner-status-hub";
import { RootDocument } from "@/components/root-document";
import { getSiteUrl } from "@/lib/env";

import "../globals.css";
import "../ops.css";
import "../public-deals-date-picker.css";
import "../public-deals-price-range.css";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: "Operations | +352 Flights",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function OpsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <RootDocument locale="en">
      <div className="ops-app">
        {children}
        <div className="ops-scanner-status-stack">
          <OpsScannerStatusHub />
        </div>
      </div>
    </RootDocument>
  );
}
