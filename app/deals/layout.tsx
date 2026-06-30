import Link from "next/link";

import { LanguageSelector } from "@/components/language-selector";
import { V2AlertsButton } from "@/components/v2-alerts";
import { V2Outro } from "@/components/v2-outro";

import "../home.css";
import "./deals-redesign.css";

export default function DealsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="deals-redesign">
      <header className="v2-topbar deals-redesign__topbar">
        <Link className="v2-topbar__brand" href="/" aria-label="352 Flights">
          <img src="/v2-logo.png" alt="352 Flights" />
        </Link>
        <div className="v2-topbar__actions">
          <LanguageSelector />
          <V2AlertsButton />
        </div>
      </header>
      {children}
      <V2Outro />
    </div>
  );
}
