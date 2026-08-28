"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Radar, X } from "lucide-react";

import { LocalPatternDiscoveryStatusWidget } from "@/components/local-pattern-discovery-status";
import { LocalScannerStatusWidget } from "@/components/local-scanner-status";

type HubTab = "price" | "dates";

export function OpsScannerStatusHub() {
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState<HubTab>("price");
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileCloseRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (pathname.startsWith("/ops/dates-scanner")) {
      setActiveTab("dates");
      return;
    }

    if (pathname.startsWith("/ops/scanner-live")) {
      setActiveTab("price");
    }
  }, [pathname]);

  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isMobileOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    mobileCloseRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMobileOpen(false);
        mobileTriggerRef.current?.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isMobileOpen]);

  if (pathname.startsWith("/ops/scanner-live") || pathname.startsWith("/ops/dates-scanner")) {
    return null;
  }

  return (
    <>
      <button
        aria-controls="ops-scanner-mobile-sheet"
        aria-expanded={isMobileOpen}
        aria-label="Open scanner status"
        className="ops-scanner-hub__mobile-trigger"
        onClick={() => setIsMobileOpen(true)}
        ref={mobileTriggerRef}
        type="button"
      >
        <Radar aria-hidden="true" size={24} strokeWidth={2} />
        <span className="ops-scanner-hub__trigger-label">Scanner status</span>
        <span aria-hidden="true" className="ops-scanner-hub__mobile-status" />
      </button>

      <button
        aria-label="Close scanner status"
        aria-hidden={!isMobileOpen}
        className={`ops-scanner-hub__mobile-backdrop ${isMobileOpen ? "is-open" : ""}`}
        onClick={() => setIsMobileOpen(false)}
        tabIndex={isMobileOpen ? 0 : -1}
        type="button"
      />

      <aside
        aria-live="polite"
        aria-modal={isMobileOpen ? "true" : undefined}
        className={`ops-scanner-hub ops-scanner-status ops-scanner-status--floating ${
          activeTab === "dates" ? "is-dates" : "is-price"
        } is-expanded ${isMobileOpen ? "is-mobile-open" : ""}`}
        id="ops-scanner-mobile-sheet"
        role={isMobileOpen ? "dialog" : undefined}
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
            aria-label="Close scanner status"
            className="ops-scanner-status__toggle"
            onClick={() => {
              setIsMobileOpen(false);
              mobileTriggerRef.current?.focus();
            }}
            ref={mobileCloseRef}
            type="button"
          >
            <span className="ops-scanner-hub__mobile-toggle-label">
              <X aria-hidden="true" size={19} />
              Close
            </span>
          </button>
        </div>

        <div className="ops-scanner-hub__panel" role="tabpanel">
          {activeTab === "price" ? (
            <LocalScannerStatusWidget displayMode="page" />
          ) : (
            <LocalPatternDiscoveryStatusWidget displayMode="page" />
          )}
        </div>
      </aside>
    </>
  );
}
