import Link from "next/link";
import type { Metadata } from "next";

import { PreferencesTopbarActions } from "@/components/preferences-topbar-actions";
import { RootDocument } from "@/components/root-document";
import { V2Footer } from "@/components/v2-footer";
import { getSiteUrl } from "@/lib/env";

import "../globals.css";
import "../public-deals-date-picker.css";
import "../public-deals-price-range.css";
import "../preferences.css";
import "../home.css";
import "./preferences-redesign.css";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: "Manage your flight alerts | +352 Flights",
  description: "Open your private +352 Flights link to manage your alert preferences.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function PreferencesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RootDocument locale="en">
      <div className="preferences-redesign">
        <header className="v2-topbar preferences-redesign__topbar">
          <Link className="v2-topbar__brand" href="/" aria-label="352 Flights">
            <img src="/v2-logo.png" alt="352 Flights" />
          </Link>
          <PreferencesTopbarActions />
        </header>
        {children}
        <V2Footer />
      </div>
    </RootDocument>
  );
}
