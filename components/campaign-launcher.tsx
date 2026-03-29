"use client";

import { useActionState } from "react";

import { sendCampaignAction, sendCampaignTestAction } from "@/app/ops/actions";
import {
  initialOpsActionState,
  type CampaignPreview,
} from "@/lib/ops-shared";

function CampaignLaunchCard({ preview }: { preview: CampaignPreview }) {
  const [liveState, liveAction, livePending] = useActionState(
    sendCampaignAction,
    initialOpsActionState,
  );
  const [testState, testAction, testPending] = useActionState(
    sendCampaignTestAction,
    initialOpsActionState,
  );

  const statusTone = preview.blockedReason ? "error" : liveState.tone;
  const statusMessage = preview.blockedReason
    ? preview.blockedReason
    : liveState.message || "Ready when the reviewed deals and audience counts look right.";

  return (
    <article className="ops-send-card">
      <div className="ops-send-card__header">
        <div>
          <p className="ops-panel__eyebrow">Campaign launch</p>
          <h3>{preview.label}</h3>
        </div>
        <span className={`ops-send-badge ${preview.isReady ? "is-live" : "is-blocked"}`}>
          {preview.isReady ? "Ready" : "Blocked"}
        </span>
      </div>

      <p className="ops-send-card__body">{preview.description}</p>

      <dl className="ops-send-stats">
        <div>
          <dt>Reviewed deals</dt>
          <dd>{preview.reviewedDeals}</dd>
        </div>
        <div>
          <dt>Matching subscribers</dt>
          <dd>{preview.matchingSubscribers}</dd>
        </div>
      </dl>

      {preview.topRoutes.length > 0 ? (
        <div className="ops-pill-row">
          {preview.topRoutes.map((route) => (
            <span className="ops-pill" key={route}>
              {route}
            </span>
          ))}
        </div>
      ) : null}

      <div className="ops-preview-meta">
        <div>
          <span>Subject</span>
          <strong>{preview.subject}</strong>
        </div>
        <div>
          <span>Preview text</span>
          <p>{preview.previewText}</p>
        </div>
      </div>

      {preview.previewDeals.length > 0 ? (
        <div className="ops-preview-deals">
          {preview.previewDeals.map((deal) => (
            <article className="ops-preview-deal" key={deal.id}>
              <div>
                <strong>{deal.routeLabel}</strong>
                <p>{deal.title}</p>
              </div>
              <span>{Math.round(deal.dealPrice)} EUR</span>
            </article>
          ))}
        </div>
      ) : null}

      <details className="ops-email-preview">
        <summary>Open email preview</summary>
        <iframe srcDoc={preview.previewHtml} title={`${preview.label} preview`} />
      </details>

      <form action={testAction} className="ops-send-form ops-send-form--stacked">
        <input name="sendType" type="hidden" value={preview.sendType} />
        <label className="ops-inline-field">
          <span>Send test to</span>
          <input
            defaultValue={preview.suggestedTestEmail ?? ""}
            name="testEmail"
            placeholder="you@example.com"
            type="email"
          />
        </label>
        <button className="ops-button ops-button--ghost" disabled={testPending} type="submit">
          {testPending ? "Sending test..." : "Send test to myself"}
        </button>
        <p className={`ops-status ops-status--${testState.tone}`}>{testState.message}</p>
      </form>

      <form action={liveAction} className="ops-send-form">
        <input name="sendType" type="hidden" value={preview.sendType} />
        <button
          className={`ops-button ${preview.sendType === "flash" ? "ops-button--flash" : "ops-button--approve"}`}
          disabled={!preview.isReady || livePending}
          type="submit"
        >
          {livePending
            ? "Sending..."
            : preview.sendType === "flash"
              ? "Send flash alerts"
              : "Send daily digest"}
        </button>
      </form>

      <p className={`ops-status ops-status--${statusTone}`}>{statusMessage}</p>
    </article>
  );
}

export function CampaignLauncher({ previews }: { previews: CampaignPreview[] }) {
  return (
    <div className="ops-send-grid">
      {previews.map((preview) => (
        <CampaignLaunchCard key={preview.sendType} preview={preview} />
      ))}
    </div>
  );
}
