"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { LocalPatternDiscoveryStatusWidget } from "@/components/local-pattern-discovery-status";
import { LocalScannerStatusWidget } from "@/components/local-scanner-status";

type HubTab = "price" | "dates";

export function OpsScannerStatusHub() {
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState<HubTab>("price");
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    if (pathname.startsWith("/ops/dates-scanner")) {
      setActiveTab("dates");
      return;
    }

    if (pathname.startsWith("/ops/scanner-live")) {
      setActiveTab("price");
    }
  }, [pathname]);

  if (pathname.startsWith("/ops/scanner-live") || pathname.startsWith("/ops/dates-scanner")) {
    return null;
  }

  return (
    <aside
      aria-live="polite"
      className={`ops-scanner-hub ops-scanner-status ops-scanner-status--floating ${
        activeTab === "dates" ? "is-dates" : "is-price"
      } ${
        isCollapsed ? "is-collapsed" : "is-expanded"
      }`}
    >
      <div className="ops-scanner-hub__header">
        <div className="ops-scanner-hub__tabs" role="tablist" aria-label="Scanner widgets">
          <button
            aria-selected={activeTab === "price"}
            className={`ops-scanner-hub__tab ${activeTab === "price" ? "is-active" : ""}`}
            onClick={() => setActiveTab("price")}
            role="tab"
            type="button"
          >
            Price Scanner
          </button>
          <button
            aria-selected={activeTab === "dates"}
            className={`ops-scanner-hub__tab ${activeTab === "dates" ? "is-active" : ""}`}
            onClick={() => setActiveTab("dates")}
            role="tab"
            type="button"
          >
            Dates Scanner
          </button>
        </div>
        <button
          aria-expanded={!isCollapsed}
          className="ops-scanner-status__toggle"
          onClick={() => setIsCollapsed((current) => !current)}
          type="button"
        >
          {isCollapsed ? "Expand" : "Minimize"}
        </button>
      </div>

      {isCollapsed ? (
        <div className="ops-scanner-hub__collapsed">
          <p className="ops-scanner-status__meta">
            {activeTab === "price" ? "Price Scanner" : "Dates Scanner"}
          </p>
        </div>
      ) : (
        <div className="ops-scanner-hub__panel" role="tabpanel">
          {activeTab === "price" ? (
            <LocalScannerStatusWidget displayMode="page" />
          ) : (
            <LocalPatternDiscoveryStatusWidget displayMode="page" />
          )}
        </div>
      )}
    </aside>
  );
}
