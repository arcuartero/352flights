import Link from "next/link";

import { PreferencesTopbarActions } from "@/components/preferences-topbar-actions";
import { V2Footer } from "@/components/v2-footer";

import "../preferences.css";
import "../home.css";
import "./preferences-redesign.css";

export default function PreferencesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
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
  );
}
