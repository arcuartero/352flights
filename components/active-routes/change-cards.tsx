import type { ActiveRouteSummary } from "@/lib/active-routes";
import {
  diffValues,
  formatPatternKeyLabel,
  summarizeChangeCounts,
  summarizeVisibleValues,
  weekdayLabel,
} from "./helpers";

function ChangeDetailRow({
  label,
  values,
  tone,
  formatter,
}: {
  label: string;
  values: string[];
  tone: "added" | "removed";
  formatter: (value: string) => string;
}) {
  if (values.length === 0) {
    return null;
  }

  return (
    <div className="active-route-modal__change-group">
      <strong>{label}</strong>
      <div className="active-route-modal__change-chips">
        {summarizeVisibleValues(values, formatter).map((value) => (
          <span
            className={`active-route-modal__change-chip is-${tone}`}
            key={`${label}:${value}`}
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}

export function RouteChangeCard({
  alert,
}: {
  alert: ActiveRouteSummary["changeAlerts"][number];
}) {
  const weekdayDiff = diffValues(alert.previousDepartureWeekdays, alert.nextDepartureWeekdays);
  const patternDiff = diffValues(alert.previousPatternKeys, alert.nextPatternKeys);

  return (
    <article className="active-route-modal__change" key={alert.id}>
      <div className="active-route-modal__change-head">
        <strong>{alert.monthLabel}</strong>
        <span>
          {summarizeChangeCounts(
            patternDiff.added.length,
            patternDiff.removed.length,
            "rule changes",
          )}
        </span>
      </div>
      <div className="active-route-modal__change-summary">
        <p>
          {summarizeChangeCounts(
            weekdayDiff.added.length,
            weekdayDiff.removed.length,
            "Departure days",
          )}
        </p>
        <p>
          {summarizeChangeCounts(
            patternDiff.added.length,
            patternDiff.removed.length,
            "Scan combinations",
          )}
        </p>
      </div>
      <div className="active-route-modal__change-groups">
        <ChangeDetailRow
          label="Departure days added"
          values={weekdayDiff.added}
          tone="added"
          formatter={(value) => weekdayLabel(value)}
        />
        <ChangeDetailRow
          label="Departure days removed"
          values={weekdayDiff.removed}
          tone="removed"
          formatter={(value) => weekdayLabel(value)}
        />
        <ChangeDetailRow
          label="Rules added"
          values={patternDiff.added}
          tone="added"
          formatter={formatPatternKeyLabel}
        />
        <ChangeDetailRow
          label="Rules removed"
          values={patternDiff.removed}
          tone="removed"
          formatter={formatPatternKeyLabel}
        />
      </div>
    </article>
  );
}
