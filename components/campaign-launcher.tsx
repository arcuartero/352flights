"use client";

import { useActionState } from "react";

import { sendCampaignAction } from "@/app/ops/actions";
import {
  initialOpsActionState,
  type CampaignPreview,
} from "@/lib/ops-shared";

export function CampaignLauncher({ previews }: { previews: CampaignPreview[] }) {
  const [digestState, digestAction, digestPending] = useActionState(
    sendCampaignAction,
    initialOpsActionState,
  );
  const [flashState, flashAction, flashPending] = useActionState(
    sendCampaignAction,
    initialOpsActionState,
  );

  return (
    <div className="ops-send-grid">
      {previews.map((preview) => {
        const isFlash = preview.sendType === "flash";
        const state = isFlash ? flashState : digestState;
        const action = isFlash ? flashAction : digestAction;
        const isPending = isFlash ? flashPending : digestPending;
        const statusTone = preview.blockedReason ? "error" : state.tone;
        const statusMessage = preview.blockedReason
          ? preview.blockedReason
          : state.message || "Ready when the queue and audience counts look right.";

        return (
          <article className="ops-send-card" key={preview.sendType}>
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
                <dt>Approved deals</dt>
                <dd>{preview.approvedDeals}</dd>
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

            <form action={action} className="ops-send-form">
              <input name="sendType" type="hidden" value={preview.sendType} />
              <button
                className={`ops-button ${isFlash ? "ops-button--flash" : "ops-button--approve"}`}
                disabled={!preview.isReady || isPending}
                type="submit"
              >
                {isPending
                  ? "Sending..."
                  : isFlash
                    ? "Send flash alerts"
                    : "Send daily digest"}
              </button>
            </form>

            <p className={`ops-status ops-status--${statusTone}`}>{statusMessage}</p>
          </article>
        );
      })}
    </div>
  );
}
