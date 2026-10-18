"use client";

import { useActionState } from "react";

import { saveDigestAutomationAction } from "@/app/ops/actions";
import {
  initialOpsActionState,
  type DigestAutomationSummary,
} from "@/lib/ops-shared";

export function DigestAutomationPanel({
  settings,
}: {
  settings: DigestAutomationSummary;
}) {
  const [state, action, isPending] = useActionState(
    saveDigestAutomationAction,
    initialOpsActionState,
  );

  return (
    <section className="ops-panel ops-panel--wide">
      <div className="ops-panel__header">
        <div>
          <p className="ops-panel__eyebrow">Automation</p>
          <h2>Daily and weekly schedule</h2>
        </div>
        <p>
          Weekly best-of runs on Mondays at the selected Luxembourg time. Missed
          runs are retried during the same week.
        </p>
      </div>

      <form action={action} className="ops-automation-form">
        <label className="ops-toggle">
          <input
            defaultChecked={settings.enabled}
            name="enabled"
            type="checkbox"
          />
          <span>Enable automatic daily digest</span>
        </label>

        <label className="ops-toggle">
          <input
            defaultChecked={settings.weeklyEnabled}
            name="weeklyEnabled"
            type="checkbox"
          />
          <span>Enable weekly best-of (Monday)</span>
        </label>
        <label className="ops-inline-field">
          <span>Luxembourg local time</span>
          <input
            defaultValue={settings.localTime}
            name="localTime"
            type="time"
          />
        </label>

        <label className="ops-inline-field">
          <span>Default test email</span>
          <input
            defaultValue={settings.testEmail ?? ""}
            name="testEmail"
            placeholder="you@example.com"
            type="email"
          />
        </label>

        <div className="ops-pill-row">
          <span className="ops-pill">
            {settings.enabled
              ? `Enabled for ${settings.localTime}`
              : "Automation paused"}
          </span>
          <span className="ops-pill">
            Weekly: {settings.weeklyEnabled ? "enabled" : "paused"}
          </span>
          {settings.lastWeeklySentOn ? (
            <span className="ops-pill">
              Last weekly period: {settings.lastWeeklySentOn}
            </span>
          ) : null}
          {settings.lastDigestSentOn ? (
            <span className="ops-pill">
              Last live digest: {settings.lastDigestSentOn}
            </span>
          ) : null}
        </div>

        <button
          className="ops-button ops-button--approve"
          disabled={isPending}
          type="submit"
        >
          {isPending ? "Saving..." : "Save automation"}
        </button>

        <p className={`ops-status ops-status--${state.tone}`}>
          {state.message ||
            settings.blockedReason ||
            "Add APP_BASE_URL and CRON_SECRET in GitHub Actions, and CRON_SECRET in your deployed app, to make the scheduled digest fire automatically."}
        </p>
      </form>
    </section>
  );
}
