import { CampaignLauncher } from "@/components/campaign-launcher";
import { DigestAutomationPanel } from "@/components/digest-automation-panel";
import type { OpsDashboardData } from "@/lib/ops";
import { formatStayBucketLabel } from "@/lib/stay-buckets";

type EmailCampaignsBoardProps = {
  data: Pick<OpsDashboardData, "digestAutomation" | "sendQueue" | "subscribers" | "recentCampaigns">;
};

function formatDate(value: string | null) {
  if (!value) {
    return "n/a";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatRelativeBucket(bucket: string) {
  return formatStayBucketLabel(bucket);
}

function formatDeliveryMode(value: string) {
  if (value === "daily_digest") return "Daily digest";
  if (value === "flash_only") return "Flash only";
  if (value === "weekly_best_of") return "Weekly best-of";
  return value.replaceAll("_", " ");
}

function formatDeliveryModes(values: string[]) {
  if (
    values.includes("daily_digest") &&
    values.includes("flash_only") &&
    values.includes("weekly_best_of")
  ) {
    return "Daily + flash + weekly";
  }

  return values.map(formatDeliveryMode).join(" + ");
}

function formatStops(value: string) {
  if (value === "NON_STOP") return "Non-stop only";
  if (value === "ONE_STOP_OR_FEWER") return "Up to 1 stop";
  if (value === "ANY") return "Any routing";
  return value.replaceAll("_", " ");
}

function formatStopsPreferences(values: string[]) {
  if (values.includes("ANY")) {
    return "Any routing";
  }

  if (values.includes("NON_STOP") && values.includes("ONE_STOP_OR_FEWER")) {
    return "Non-stop + up to 1 stop";
  }

  return values.map(formatStops).join(" + ");
}

function formatWeekday(value: string) {
  if (value === "MON") return "Mon";
  if (value === "TUE") return "Tue";
  if (value === "WED") return "Wed";
  if (value === "THU") return "Thu";
  if (value === "FRI") return "Fri";
  if (value === "SAT") return "Sat";
  if (value === "SUN") return "Sun";
  return value;
}

function formatWeekdays(values: string[]) {
  if (values.length === 7) {
    return "Any departure day";
  }

  return values.map(formatWeekday).join(", ");
}

function formatTripRange(minNights: number | null, maxNights: number | null) {
  if (minNights === null && maxNights === null) {
    return "Any stay length";
  }

  if (minNights !== null && maxNights !== null) {
    return `${minNights}-${maxNights} nights`;
  }

  if (minNights !== null) {
    return `${minNights}+ nights`;
  }

  return `Up to ${maxNights} nights`;
}

function formatCampaignStatus(status: string) {
  if (status === "sent") return "Sent";
  if (status === "partial") return "Partial";
  if (status === "failed") return "Failed";
  return status;
}

function formatSendType(sendType: string) {
  return sendType === "flash" ? "Flash" : "Digest";
}

export function EmailCampaignsBoard({ data }: EmailCampaignsBoardProps) {
  return (
    <section className="ops-grid">
      <DigestAutomationPanel settings={data.digestAutomation} />

      <section className="ops-panel ops-panel--wide">
        <div className="ops-panel__header">
          <div>
            <p className="ops-panel__eyebrow">Campaigns</p>
            <h2>Send queue</h2>
          </div>
          <p>Reviewed deals only. Audience counts are matched against saved subscriber filters.</p>
        </div>
        <CampaignLauncher previews={data.sendQueue} />
      </section>

      <section className="ops-panel">
        <div className="ops-panel__header">
          <div>
            <p className="ops-panel__eyebrow">Audience</p>
            <h2>Latest subscribers</h2>
          </div>
        </div>
        {data.subscribers.length === 0 ? (
          <div className="ops-empty">
            <p>No subscribers yet. Once the landing page is live, new emails will land here.</p>
          </div>
        ) : (
          <div className="ops-list">
            {data.subscribers.map((subscriber) => (
              <article className="ops-list__item ops-list__item--stacked" key={subscriber.id}>
                <div className="ops-list__stack">
                  <div>
                    <h3>{subscriber.email}</h3>
                    <p>
                      {subscriber.source} · {subscriber.status} ·{" "}
                      {subscriber.emailConfirmed ? "confirmed" : "waiting confirmation"} ·{" "}
                      {subscriber.onboardingCompleted ? "preferences saved" : "preferences pending"}
                    </p>
                  </div>
                  <div className="ops-pill-row">
                    <span className="ops-pill">{formatDeliveryModes(subscriber.deliveryModes)}</span>
                    <span className="ops-pill">
                      {formatStopsPreferences(subscriber.maxStopsPreferences)}
                    </span>
                    <span className="ops-pill">{formatWeekdays(subscriber.departureWeekdays)}</span>
                    <span className="ops-pill">
                      {formatTripRange(subscriber.minTripNights, subscriber.maxTripNights)}
                    </span>
                    {subscriber.budgetCeilingEur !== null ? (
                      <span className="ops-pill">
                        Budget {new Intl.NumberFormat("en-GB", {
                          style: "currency",
                          currency: "EUR",
                          maximumFractionDigits: 0,
                        }).format(subscriber.budgetCeilingEur)}
                      </span>
                    ) : null}
                  </div>
                  <p className="ops-subscriber-note">
                    Buckets: {subscriber.preferredBuckets.map(formatRelativeBucket).join(", ")}
                  </p>
                  <p className="ops-subscriber-note">
                    Routes:{" "}
                    {subscriber.selectedRouteLabels.length > 0
                      ? subscriber.selectedRouteLabels.slice(0, 4).join(", ")
                      : "No explicit route picks yet"}
                  </p>
                  <p className="ops-subscriber-note">
                    Custom watches:{" "}
                    {subscriber.customAlertRules.length > 0
                      ? subscriber.customAlertRules
                          .map((rule) => rule.name)
                          .slice(0, 3)
                          .join(", ")
                      : "No custom watches yet"}
                  </p>
                </div>
                <span>{formatDate(subscriber.createdAt)}</span>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="ops-panel">
        <div className="ops-panel__header">
          <div>
            <p className="ops-panel__eyebrow">Campaigns</p>
            <h2>Recent sends</h2>
          </div>
        </div>
        {data.recentCampaigns.length === 0 ? (
          <div className="ops-empty">
            <p>No campaigns have been sent yet. Review deals and launch a digest from above.</p>
          </div>
        ) : (
          <div className="ops-list">
            {data.recentCampaigns.map((campaign) => (
              <article className="ops-list__item ops-list__item--stacked" key={campaign.id}>
                <div className="ops-list__stack">
                  <div>
                    <h3>{campaign.subject}</h3>
                    <p>
                      {formatSendType(campaign.sendType)} · {formatCampaignStatus(campaign.status)} ·{" "}
                      {campaign.sentCount}/{campaign.recipientCount} sent
                      {campaign.failedCount > 0 ? ` · ${campaign.failedCount} failed` : ""}
                    </p>
                  </div>
                  {campaign.routeLabels.length > 0 ? (
                    <div className="ops-pill-row">
                      {campaign.routeLabels.slice(0, 3).map((routeLabel) => (
                        <span className="ops-pill" key={routeLabel}>
                          {routeLabel}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <span>{formatDate(campaign.sentAt ?? campaign.createdAt)}</span>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
