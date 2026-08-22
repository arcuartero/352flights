"use client";

import { useEffect, useState } from "react";

import { EmailCampaignsBoard } from "@/components/email-campaigns-board";
import type { OpsEmailCampaignsData } from "@/lib/ops";

type CampaignsResponse =
  | { ok: true; data: OpsEmailCampaignsData }
  | { ok: false; reason: string; detail?: string };

export function EmailCampaignsBoardLoader() {
  const [data, setData] = useState<OpsEmailCampaignsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCampaigns() {
      try {
        const response = await fetch("/api/ops/email-campaigns-data", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as CampaignsResponse;
        if (!response.ok || !payload.ok) {
          throw new Error(
            payload.ok
              ? "Campaign data could not be loaded."
              : payload.detail ?? payload.reason,
          );
        }
        setData(payload.data);
        setError(null);
      } catch (requestError) {
        if (!(requestError instanceof DOMException && requestError.name === "AbortError")) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Campaign data could not be loaded.",
          );
        }
      }
    }

    void loadCampaigns();
    return () => controller.abort();
  }, []);

  if (error) {
    return (
      <section className="ops-banner" role="status">
        <p>Email campaigns are temporarily unavailable.</p>
        <small className="ops-verification-error">{error}</small>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="ops-panel" role="status">
        <p className="ops-panel__eyebrow">Email campaigns</p>
        <h2>Loading campaign data</h2>
        <p>The rest of Operations remains available while this section loads.</p>
      </section>
    );
  }

  return <EmailCampaignsBoard data={data} />;
}
