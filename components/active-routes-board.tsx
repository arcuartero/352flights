"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import {
  createAutomaticRoutePlannerRulesAction,
  createAutomaticRoutePlannerRulesForRoutesAction,
  saveRoutePlannerRulesAction,
} from "@/app/ops/actions";
import { emitClientActivityLog } from "@/lib/client-activity-log";
import { formatStayBucketListLabel } from "@/lib/stay-buckets";
import type {
  ActiveRouteLatestDiscovery,
  ActiveRouteMonthSummary,
  ActiveRouteRule,
  ActiveRouteSummary,
  OpsActiveRoutesData,
} from "@/lib/active-routes";

const WEEKDAY_ORDER = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
const WEEKDAY_LABELS: Record<(typeof WEEKDAY_ORDER)[number], string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
  SUN: "Sun",
};

type PlannerSelectionState = Record<string, string[]>;
type ActiveRoutesSortField =
  | "route"
  | "bucket"
  | "routing"
  | "airlines"
  | "rulesActive"
  | "cadenceChanges";
type ActiveRoutesSortDirection = "asc" | "desc";
type RuleDraft = {
  departureWeekday: (typeof WEEKDAY_ORDER)[number];
  returnWeekday: (typeof WEEKDAY_ORDER)[number];
  spansNextWeek: boolean;
};

const AUTO_RULE_DRAFTS: RuleDraft[] = [
  { departureWeekday: "THU", returnWeekday: "SUN", spansNextWeek: false },
  { departureWeekday: "THU", returnWeekday: "MON", spansNextWeek: true },
  { departureWeekday: "THU", returnWeekday: "FRI", spansNextWeek: true },
  { departureWeekday: "THU", returnWeekday: "SAT", spansNextWeek: true },
  { departureWeekday: "THU", returnWeekday: "SUN", spansNextWeek: true },
  { departureWeekday: "FRI", returnWeekday: "SUN", spansNextWeek: false },
  { departureWeekday: "FRI", returnWeekday: "MON", spansNextWeek: true },
  { departureWeekday: "FRI", returnWeekday: "FRI", spansNextWeek: true },
  { departureWeekday: "FRI", returnWeekday: "SAT", spansNextWeek: true },
  { departureWeekday: "FRI", returnWeekday: "SUN", spansNextWeek: true },
  { departureWeekday: "SAT", returnWeekday: "MON", spansNextWeek: true },
  { departureWeekday: "SAT", returnWeekday: "FRI", spansNextWeek: true },
  { departureWeekday: "SAT", returnWeekday: "SAT", spansNextWeek: true },
  { departureWeekday: "SAT", returnWeekday: "SUN", spansNextWeek: true },
  { departureWeekday: "SUN", returnWeekday: "FRI", spansNextWeek: true },
  { departureWeekday: "SUN", returnWeekday: "SAT", spansNextWeek: true },
  { departureWeekday: "SUN", returnWeekday: "SUN", spansNextWeek: true },
];

const ACTIVE_ROUTE_COLUMN_DEFS = [
  { key: "route", width: 320, minWidth: 220 },
  { key: "bucket", width: 170, minWidth: 140 },
  { key: "routing", width: 180, minWidth: 150 },
  { key: "airlines", width: 210, minWidth: 150 },
  { key: "rules", width: 110, minWidth: 80 },
  { key: "cadence", width: 180, minWidth: 140 },
  { key: "scan", width: 120, minWidth: 100 },
  { key: "planner", width: 78, minWidth: 64 },
] as const;

type ActiveRouteColumnKey = (typeof ACTIVE_ROUTE_COLUMN_DEFS)[number]["key"];
type ActiveRouteColumnWidths = Record<ActiveRouteColumnKey, number>;

const DEFAULT_ACTIVE_ROUTE_COLUMN_WIDTHS = Object.fromEntries(
  ACTIVE_ROUTE_COLUMN_DEFS.map((column) => [column.key, column.width]),
) as ActiveRouteColumnWidths;

const ACTIVE_ROUTE_COLUMN_MIN_WIDTHS = Object.fromEntries(
  ACTIVE_ROUTE_COLUMN_DEFS.map((column) => [column.key, column.minWidth]),
) as ActiveRouteColumnWidths;

function formatRelativeBucket(bucket: string) {
  return formatStayBucketListLabel([bucket]);
}

function formatStops(value: string) {
  if (value === "NON_STOP") {
    return "Non-stop only";
  }

  if (value === "ONE_STOP_OR_FEWER") {
    return "Up to 1 stop";
  }

  if (value === "ANY") {
    return "Any routing";
  }

  return value.replaceAll("_", " ");
}

function formatDetectionRouting(value: string) {
  if (value === "NON_STOP") {
    return "non-stop";
  }

  if (value === "ONE_STOP_OR_FEWER") {
    return "up to 1 stop";
  }

  if (value === "ANY") {
    return "any-routing";
  }

  return value.replaceAll("_", " ").toLowerCase();
}

function formatMonthCheckedAt(value: string | null) {
  if (!value) {
    return "Not checked yet";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDiscoveryTimestamp(value: string | null) {
  if (!value) {
    return "unknown time";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, undefined, { sensitivity: "base" });
}

function activeRouteTableGridTemplate(columnWidths: ActiveRouteColumnWidths) {
  return [
    `${columnWidths.route}px`,
    `${columnWidths.bucket}px`,
    `${columnWidths.routing}px`,
    `${columnWidths.airlines}px`,
    `${columnWidths.rules}px`,
    `${columnWidths.cadence}px`,
    `${columnWidths.scan}px`,
    `${columnWidths.planner}px`,
  ].join(" ");
}

function emptyRuleDraft(): RuleDraft {
  return {
    departureWeekday: "FRI",
    returnWeekday: "SUN",
    spansNextWeek: false,
  };
}

function buildRuleFromDraft(draft: RuleDraft, maxStops: string): ActiveRouteRule | null {
  const departureIndex = WEEKDAY_ORDER.indexOf(draft.departureWeekday);
  const returnIndex = WEEKDAY_ORDER.indexOf(draft.returnWeekday);
  const tripNights = draft.spansNextWeek
    ? 7 - departureIndex + returnIndex
    : returnIndex - departureIndex;

  if (tripNights <= 0) {
    return null;
  }

  const departureLabel = WEEKDAY_LABELS[draft.departureWeekday];
  const returnLabel = WEEKDAY_LABELS[draft.returnWeekday];
  const key = draft.spansNextWeek
    ? `${draft.departureWeekday.toLowerCase()}-next-${draft.returnWeekday.toLowerCase()}`
    : `${draft.departureWeekday.toLowerCase()}-${draft.returnWeekday.toLowerCase()}`;
  const label = draft.spansNextWeek
    ? `${departureLabel} -> next ${returnLabel}`
    : `${departureLabel} -> ${returnLabel}`;

  return {
    key,
    label,
    departureWeekday: draft.departureWeekday,
    returnWeekday: draft.returnWeekday,
    tripNights,
    maxStops,
    source: "manual",
  };
}

function parseRuleKey(patternKey: string, maxStops: string): ActiveRouteRule | null {
  const match = patternKey
    .trim()
    .toUpperCase()
    .match(
      /^(MON|TUE|WED|THU|FRI|SAT|SUN)(?:-(NEXT))?-(MON|TUE|WED|THU|FRI|SAT|SUN)$/,
    );
  if (!match) {
    return null;
  }

  const [, departureWeekday, nextMarker, returnWeekday] = match;
  return buildRuleFromDraft(
    {
      departureWeekday: departureWeekday as RuleDraft["departureWeekday"],
      returnWeekday: returnWeekday as RuleDraft["returnWeekday"],
      spansNextWeek: nextMarker === "NEXT",
    },
    maxStops,
  );
}

function buildAutomaticPatternKeysForMonth(
  month: ActiveRouteMonthSummary,
  nextMonth: ActiveRouteMonthSummary | null,
  maxStops: string,
  existingPatternKeys: string[],
) {
  const nextSelection = new Set(existingPatternKeys);
  let addedCount = 0;
  const monthWeekdays = new Set(month.departureWeekdays);
  const nextMonthWeekdays = new Set(nextMonth?.departureWeekdays ?? []);

  for (const draft of AUTO_RULE_DRAFTS) {
    const rule = buildRuleFromDraft(draft, maxStops);
    if (!rule || nextSelection.has(rule.key)) {
      continue;
    }

    const hasDepartureWeekday = monthWeekdays.has(draft.departureWeekday);
    const hasReturnWeekday = draft.spansNextWeek
      ? monthWeekdays.has(draft.returnWeekday) || nextMonthWeekdays.has(draft.returnWeekday)
      : monthWeekdays.has(draft.returnWeekday);

    if (!hasDepartureWeekday || !hasReturnWeekday) {
      continue;
    }

    nextSelection.add(rule.key);
    addedCount += 1;
  }

  return {
    patternKeys: Array.from(nextSelection),
    addedCount,
  };
}

function buildAutomaticSelectionsForRoute(
  route: ActiveRouteSummary,
  currentSelection?: PlannerSelectionState,
) {
  let monthsUpdated = 0;
  let rulesAdded = 0;
  const months = route.months.map((month, index) => {
    const existingPatternKeys = currentSelection?.[month.monthStart] ?? month.activePatternKeys;
    const generated = buildAutomaticPatternKeysForMonth(
      month,
      route.months[index + 1] ?? null,
      route.maxStops,
      existingPatternKeys,
    );
    if (generated.addedCount > 0) {
      monthsUpdated += 1;
      rulesAdded += generated.addedCount;
    }

    return {
      monthStart: month.monthStart,
      patternKeys: generated.patternKeys,
    };
  });

  return { months, monthsUpdated, rulesAdded };
}

function nextSortDirection(
  currentField: ActiveRoutesSortField,
  currentDirection: ActiveRoutesSortDirection,
  targetField: ActiveRoutesSortField,
) {
  if (currentField !== targetField) {
    return targetField === "rulesActive" || targetField === "cadenceChanges" ? "desc" : "asc";
  }

  return currentDirection === "asc" ? "desc" : "asc";
}

function ariaSortValue(
  activeField: ActiveRoutesSortField,
  activeDirection: ActiveRoutesSortDirection,
  field: ActiveRoutesSortField,
) {
  if (activeField !== field) {
    return "none";
  }

  return activeDirection === "asc" ? "ascending" : "descending";
}

function SortableHeader({
  label,
  field,
  activeField,
  activeDirection,
  onToggle,
  onResizeStart,
}: {
  label: string;
  field: ActiveRoutesSortField;
  activeField: ActiveRoutesSortField;
  activeDirection: ActiveRoutesSortDirection;
  onToggle: (field: ActiveRoutesSortField) => void;
  onResizeStart?: (event: ReactMouseEvent<HTMLSpanElement>) => void;
}) {
  const isActive = activeField === field;
  const directionLabel = isActive
    ? activeDirection === "asc"
      ? "ascending"
      : "descending"
    : "not sorted";

  return (
    <div className={`ops-route-table__sort-wrap ${isActive ? "is-active" : ""}`}>
      <button
        aria-label={`${label}, ${directionLabel}. Click to sort.`}
        className={`ops-route-table__sort ${isActive ? "is-active" : ""}`}
        onClick={() => onToggle(field)}
        type="button"
      >
        <span>{label}</span>
        <i aria-hidden="true">{isActive ? (activeDirection === "asc" ? "↑" : "↓") : "↕"}</i>
      </button>
      {onResizeStart ? (
        <span
          aria-hidden="true"
          className="ops-route-table__resize-handle"
          onMouseDown={onResizeStart}
        />
      ) : null}
    </div>
  );
}

function summarizeRouteDiscoveryNotice(
  route: ActiveRouteSummary,
  latestDiscovery: ActiveRouteLatestDiscovery | null,
) {
  if (!latestDiscovery) {
    return null;
  }

  const latestSuccessfulCheck = route.months.reduce<string | null>((latest, month) => {
    if (!month.lastCheckedAt) {
      return latest;
    }

    if (!latest) {
      return month.lastCheckedAt;
    }

    return new Date(month.lastCheckedAt).getTime() > new Date(latest).getTime()
      ? month.lastCheckedAt
      : latest;
  }, null);

  const compactError = latestDiscovery.error
    ? latestDiscovery.error.replace(/^POST request failed:\s*/i, "").trim()
    : null;

  if (latestDiscovery.status !== "service_calendar_error") {
    if (latestSuccessfulCheck) {
      return null;
    }

    return {
      title: "No saved calendar yet for this routing",
      body: `The latest monthly discovery finished at ${formatDiscoveryTimestamp(
        latestDiscovery.generatedAt,
      )}, but this route still has no saved calendar for ${formatStops(
        route.maxStops,
      )}. Run monthly discovery again to refresh it with the current routing setup.`,
    };
  }

  if (latestDiscovery.showingOlderData && latestSuccessfulCheck) {
    return {
      title: "Latest monthly discovery failed",
      body: `The last run for this route failed at ${formatDiscoveryTimestamp(
        latestDiscovery.generatedAt,
      )}. The planner below is still showing the previous successful calendar data from ${formatDiscoveryTimestamp(
        latestSuccessfulCheck,
      )}${compactError ? `. Reason: ${compactError}` : "."}`,
    };
  }

  return {
    title: "Latest monthly discovery failed",
    body: `The last run for this route failed at ${formatDiscoveryTimestamp(
      latestDiscovery.generatedAt,
    )}, so no fresh monthly calendar was saved yet${
      compactError ? `. Reason: ${compactError}` : "."
    }`,
  };
}

function weekdayLabel(value: string) {
  return WEEKDAY_LABELS[value as keyof typeof WEEKDAY_LABELS] ?? value;
}

function formatPatternKeyLabel(value: string) {
  const parts = value.split("-");
  if (parts.length === 2) {
    return `${weekdayLabel(parts[0].toUpperCase())} -> ${weekdayLabel(parts[1].toUpperCase())}`;
  }

  if (parts.length === 3 && parts[1] === "next") {
    return `${weekdayLabel(parts[0].toUpperCase())} -> next ${weekdayLabel(parts[2].toUpperCase())}`;
  }

  return value;
}

function diffValues(previous: string[], next: string[]) {
  const previousSet = new Set(previous);
  const nextSet = new Set(next);

  return {
    added: next.filter((value) => !previousSet.has(value)),
    removed: previous.filter((value) => !nextSet.has(value)),
  };
}

function summarizeChangeCounts(addedCount: number, removedCount: number, noun: string) {
  if (addedCount === 0 && removedCount === 0) {
    return `No ${noun} changed.`;
  }

  const parts: string[] = [];
  if (addedCount > 0) {
    parts.push(`${addedCount} added`);
  }
  if (removedCount > 0) {
    parts.push(`${removedCount} removed`);
  }

  return `${noun}: ${parts.join(" · ")}`;
}

function summarizeVisibleValues(values: string[], formatter: (value: string) => string, limit = 10) {
  const visible = values.slice(0, limit).map(formatter);
  const hiddenCount = Math.max(values.length - limit, 0);

  if (hiddenCount === 0) {
    return visible;
  }

  return [...visible, `+${hiddenCount} more`];
}

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

function RouteChangeCard({
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

function patternSortValue(pattern: {
  departureWeekday: string;
  returnWeekday: string;
  tripNights: number;
  label: string;
}) {
  return [
    WEEKDAY_ORDER.indexOf(pattern.departureWeekday as (typeof WEEKDAY_ORDER)[number]),
    WEEKDAY_ORDER.indexOf(pattern.returnWeekday as (typeof WEEKDAY_ORDER)[number]),
    pattern.tripNights,
    pattern.label,
  ];
}

function sortPatterns<T extends { departureWeekday: string; returnWeekday: string; tripNights: number; label: string }>(
  patterns: T[],
) {
  return [...patterns].sort((left, right) => {
    const leftValue = patternSortValue(left);
    const rightValue = patternSortValue(right);
    for (let index = 0; index < leftValue.length; index += 1) {
      if (leftValue[index] < rightValue[index]) {
        return -1;
      }
      if (leftValue[index] > rightValue[index]) {
        return 1;
      }
    }
    return 0;
  });
}

function initialSelectionState(route: ActiveRouteSummary): PlannerSelectionState {
  return Object.fromEntries(
    route.months.map((month) => [month.monthStart, [...month.activePatternKeys]]),
  );
}

function applySelectionToRoute(
  route: ActiveRouteSummary,
  nextSelection: PlannerSelectionState,
): ActiveRouteSummary {
  return {
    ...route,
    months: route.months.map((month) => {
      const nextPatternKeys = Array.from(new Set(nextSelection[month.monthStart] ?? []));
      const nextRules = sortPatterns(
        nextPatternKeys
          .map(
            (patternKey) =>
              month.activeRules.find((rule) => rule.key === patternKey) ??
              parseRuleKey(patternKey, route.maxStops),
          )
          .filter((rule): rule is ActiveRouteRule => rule !== null),
      );
      const detectedKeys = new Set(month.detectedPatterns.map((pattern) => pattern.key));

      return {
        ...month,
        activePatternKeys: nextPatternKeys,
        activeRules: nextRules,
        staleActiveRules: nextRules.filter((rule) => !detectedKeys.has(rule.key)),
      };
    }),
  };
}

function monthCalendarCells(
  monthStart: string,
  departureDates: string[],
  selectedPatterns: ActiveRouteRule[],
) {
  const [yearString, monthString] = monthStart.split("-");
  const year = Number(yearString);
  const month = Number(monthString);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const mondayFirstOffset = (firstDay + 6) % 7;
  const highlighted = new Set(
    departureDates.map((value) => Number(value.split("-")[2] ?? "0")),
  );

  const cells: Array<{
    day: number | null;
    highlighted: boolean;
    selectedCount: number;
  }> = [];
  for (let index = 0; index < mondayFirstOffset; index += 1) {
    cells.push({ day: null, highlighted: false, selectedCount: 0 });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const weekdayCode = WEEKDAY_ORDER[(new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7];
    const selectedCount = selectedPatterns.reduce((total, pattern) => {
      const touchedWeekdays = new Set([pattern.departureWeekday, pattern.returnWeekday]);
      return total + (touchedWeekdays.has(weekdayCode) ? 1 : 0);
    }, 0);

    cells.push({
      day,
      highlighted: highlighted.has(day),
      selectedCount,
    });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ day: null, highlighted: false, selectedCount: 0 });
  }

  return cells;
}

function RouteRuleChip({
  rule,
  onRemove,
}: {
  rule: ActiveRouteRule;
  onRemove: (patternKey: string) => void;
}) {
  return (
    <div className="active-route-rule-chip">
      <div>
        <strong>{rule.label}</strong>
        <small>{rule.tripNights} night{rule.tripNights === 1 ? "" : "s"}</small>
      </div>
      <button aria-label={`Remove ${rule.label}`} onClick={() => onRemove(rule.key)} type="button">
        Remove
      </button>
    </div>
  );
}

function RuleComposer({
  draft,
  onChange,
  onSubmit,
  submitLabel,
}: {
  draft: RuleDraft;
  onChange: (nextDraft: RuleDraft) => void;
  onSubmit: () => void;
  submitLabel: string;
}) {
  const draftPreview = buildRuleFromDraft(draft, "ANY");

  return (
    <div className="active-route-rule-composer">
      <label>
        <span>Out</span>
        <select
          onChange={(event) =>
            onChange({
              ...draft,
              departureWeekday: event.target.value as RuleDraft["departureWeekday"],
            })
          }
          value={draft.departureWeekday}
        >
          {WEEKDAY_ORDER.map((weekday) => (
            <option key={`out:${weekday}`} value={weekday}>
              {WEEKDAY_LABELS[weekday]}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Back</span>
        <select
          onChange={(event) =>
            onChange({
              ...draft,
              returnWeekday: event.target.value as RuleDraft["returnWeekday"],
            })
          }
          value={draft.returnWeekday}
        >
          {WEEKDAY_ORDER.map((weekday) => (
            <option key={`back:${weekday}`} value={weekday}>
              {WEEKDAY_LABELS[weekday]}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>When back</span>
        <select
          onChange={(event) =>
            onChange({
              ...draft,
              spansNextWeek: event.target.value === "next_week",
            })
          }
          value={draft.spansNextWeek ? "next_week" : "same_week"}
        >
          <option value="same_week">Same week</option>
          <option value="next_week">Next week</option>
        </select>
      </label>
      <button
        className="ops-button ops-button--ghost"
        disabled={!draftPreview}
        onClick={onSubmit}
        type="button"
      >
        {submitLabel}
      </button>
    </div>
  );
}

function MonthPlanner({
  month,
  selectedRules,
  onAddRule,
  onRemoveRule,
}: {
  month: ActiveRouteMonthSummary;
  selectedRules: ActiveRouteRule[];
  onAddRule: (monthStart: string, draft: RuleDraft) => void;
  onRemoveRule: (monthStart: string, patternKey: string) => void;
}) {
  const [draft, setDraft] = useState<RuleDraft>(emptyRuleDraft());
  const selectedPatterns = useMemo(() => sortPatterns(selectedRules), [selectedRules]);
  const cells = useMemo(
    () => monthCalendarCells(month.monthStart, month.departureDates, selectedPatterns),
    [month.departureDates, month.monthStart, selectedPatterns],
  );
  const unmatchedRules = useMemo(
    () =>
      selectedRules.filter((rule) => !month.departureWeekdays.includes(rule.departureWeekday)),
    [month.departureWeekdays, selectedRules],
  );

  return (
    <article className="active-route-month">
      <div className="active-route-month__header">
        <div>
          <h4>{month.monthLabel}</h4>
          <p>
            {month.departureWeekdays.length > 0
              ? `Detected outbound ${formatDetectionRouting(month.routing)} departures on ${month.departureWeekdays.map(weekdayLabel).join(", ")}`
              : `No outbound ${formatDetectionRouting(month.routing)} departures detected in this month`}
          </p>
        </div>
        <span>{formatMonthCheckedAt(month.lastCheckedAt)}</span>
      </div>

      <div className="active-route-month__calendar">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
          <span className="active-route-month__calendar-head" key={day}>
            {day}
          </span>
        ))}
        {cells.map((cell, index) => (
          <span
            className={`active-route-month__calendar-cell ${
              cell.selectedCount >= 2
                ? "is-overlap"
                : cell.selectedCount === 1
                  ? "is-selected"
                  : cell.highlighted
                    ? "is-active"
                    : ""
            } ${cell.day === null ? "is-empty" : ""}`}
            key={`${month.monthStart}:${index}`}
          >
            {cell.day ?? ""}
          </span>
        ))}
      </div>

      <div className="active-route-month__legend">
        <span>
          <i className="is-detected" />
          Detected departures
        </span>
        <span>
          <i className="is-selected" />
          Used by 1 selected rule
        </span>
        <span>
          <i className="is-overlap" />
          Used by 2+ selected rules
        </span>
      </div>

      <div className="active-route-month__form">
        <p className="active-route-month__hint">
          The dates scanner only records outbound Luxembourg departures. Add manual rules here for
          this month only, or use the top builder to apply the same rule everywhere.
        </p>

        <div className="active-route-month__meta">
          <span>{month.departureDates.length} outbound date(s) detected</span>
          <span>{selectedRules.length} selected rule(s)</span>
        </div>

        {selectedRules.length === 0 ? (
          <p className="active-route-month__empty">
            No month-specific rules selected yet.
          </p>
        ) : (
          <div className="active-route-month__rule-list">
            {selectedRules.map((rule) => (
              <RouteRuleChip
                key={`${month.monthStart}:${rule.key}`}
                onRemove={(patternKey) => onRemoveRule(month.monthStart, patternKey)}
                rule={rule}
              />
            ))}
          </div>
        )}

        <RuleComposer
          draft={draft}
          onChange={setDraft}
          onSubmit={() => {
            onAddRule(month.monthStart, draft);
            setDraft(emptyRuleDraft());
          }}
          submitLabel="Add month rule"
        />

        {unmatchedRules.length > 0 ? (
          <div className="active-route-month__warning">
            <strong>Selected departure weekday is not operating this month</strong>
            <p>
              {unmatchedRules.map((rule) => rule.label).join(", ")} will still be scanned, but the
              latest dates scan did not find outbound Luxembourg departures on those weekday(s) this
              month.
            </p>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function RoutePlannerModal({
  route,
  routeIndex,
  routeCount,
  onClose,
  onNext,
  onPrevious,
  onSelectionPersisted,
}: {
  route: ActiveRouteSummary;
  routeIndex: number;
  routeCount: number;
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSelectionPersisted: (routeId: string, nextSelection: PlannerSelectionState) => void;
}) {
  const router = useRouter();
  const [selection, setSelection] = useState<PlannerSelectionState>(() => initialSelectionState(route));
  const [globalDraft, setGlobalDraft] = useState<RuleDraft>(emptyRuleDraft());
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showChangeAlerts, setShowChangeAlerts] = useState(false);
  const [isPending, startTransition] = useTransition();
  useEffect(() => {
    setSelection(initialSelectionState(route));
    setGlobalDraft(emptyRuleDraft());
    setFeedback(null);
    setError(null);
    setShowChangeAlerts(false);
  }, [route]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key === "ArrowLeft") {
        onPrevious();
        return;
      }

      if (event.key === "ArrowRight") {
        onNext();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, onNext, onPrevious]);

  const rulesByMonth = useMemo(() => {
    const entries = route.months.map((month) => {
      const monthRules = sortPatterns(
        Array.from(new Set(selection[month.monthStart] ?? []))
          .map((patternKey) =>
            month.activeRules.find((rule) => rule.key === patternKey) ??
            parseRuleKey(patternKey, route.maxStops),
          )
          .filter((rule): rule is ActiveRouteRule => rule !== null),
      );

      return [month.monthStart, monthRules] as const;
    });

    return new Map(entries);
  }, [route.maxStops, route.months, selection]);

  const sharedRules = useMemo(() => {
    if (route.months.length === 0) {
      return [];
    }

    const firstMonthKeys = new Set(selection[route.months[0].monthStart] ?? []);
    const sharedKeys = Array.from(firstMonthKeys).filter((patternKey) =>
      route.months.every((month) => (selection[month.monthStart] ?? []).includes(patternKey)),
    );

    return sortPatterns(
      sharedKeys
        .map((patternKey) => parseRuleKey(patternKey, route.maxStops))
        .filter((rule): rule is ActiveRouteRule => rule !== null),
    );
  }, [route.maxStops, route.months, selection]);

  async function persistPlannerSelection(
    nextSelection: PlannerSelectionState,
    {
      successTitle,
      successDetail,
      successFeedback,
      errorTitle,
    }: {
      successTitle: string;
      successDetail: string;
      successFeedback: string;
      errorTitle: string;
    },
  ) {
    setFeedback(null);
    setError(null);

    startTransition(async () => {
      try {
        await saveRoutePlannerRulesAction({
          routeId: route.id,
          months: route.months.map((month) => ({
            monthStart: month.monthStart,
            patternKeys: nextSelection[month.monthStart] ?? [],
          })),
        });
        setSelection(nextSelection);
        onSelectionPersisted(route.id, nextSelection);
        setFeedback(successFeedback);
        emitClientActivityLog({
          kind: "action",
          level: "info",
          title: successTitle,
          detail: successDetail,
        });
        router.refresh();
      } catch (saveError) {
        const message =
          saveError instanceof Error
            ? saveError.message
            : "The route planner could not be saved right now.";
        setError(message);
        emitClientActivityLog({
          kind: "action",
          level: "error",
          title: errorTitle,
          detail: `${route.label} · ${message}`,
        });
      }
    });
  }

  function addMonthRule(monthStart: string, draft: RuleDraft) {
    const monthSummary = route.months.find((month) => month.monthStart === monthStart);
    const rule = buildRuleFromDraft(draft, route.maxStops);
    if (!rule) {
      const message =
        "That rule is not valid. Use a later weekday in the same week, or switch to next week.";
      setError(message);
      setFeedback(null);
      emitClientActivityLog({
        kind: "action",
        level: "error",
        title: "Month rule rejected",
        detail: `${route.label} · ${message}`,
      });
      return;
    }

    const alreadyExists = (selection[monthStart] ?? []).includes(rule.key);
    if (alreadyExists) {
      const message = `${rule.label} was already selected for ${monthSummary?.monthLabel ?? monthStart}.`;
      setFeedback(message);
      setError(null);
      emitClientActivityLog({
        kind: "action",
        level: "warning",
        title: "Month rule already selected",
        detail: `${route.label} · ${message}`,
      });
      return;
    }

    setSelection((current) => {
      const next = new Set(current[monthStart] ?? []);
      next.add(rule.key);

      return {
        ...current,
        [monthStart]: Array.from(next),
      };
    });
    setFeedback(`${rule.label} added to ${monthSummary?.monthLabel ?? monthStart}.`);
    setError(null);
    emitClientActivityLog({
      kind: "action",
      level: "info",
      title: "Month rule added",
      detail: `${route.label} · ${monthSummary?.monthLabel ?? monthStart} · ${rule.label}`,
    });
  }

  function removeMonthRule(monthStart: string, patternKey: string) {
    const monthSummary = route.months.find((month) => month.monthStart === monthStart);
    const rule = parseRuleKey(patternKey, route.maxStops);
    setSelection((current) => {
      const next = new Set(current[monthStart] ?? []);
      next.delete(patternKey);

      return {
        ...current,
        [monthStart]: Array.from(next),
      };
    });
    setFeedback(
      rule
        ? `${rule.label} removed from ${monthSummary?.monthLabel ?? monthStart}.`
        : "Month rule removed.",
    );
    setError(null);
    emitClientActivityLog({
      kind: "action",
      level: "info",
      title: "Month rule removed",
      detail: `${route.label} · ${monthSummary?.monthLabel ?? monthStart} · ${rule?.label ?? patternKey}`,
    });
  }

  function addRuleToAllMonths(draft: RuleDraft) {
    const rule = buildRuleFromDraft(draft, route.maxStops);
    if (!rule) {
      const message =
        "That rule is not valid. Use a later weekday in the same week, or switch to next week.";
      setError(message);
      setFeedback(null);
      emitClientActivityLog({
        kind: "action",
        level: "error",
        title: "Apply to all months failed",
        detail: `${route.label} · ${message}`,
      });
      return;
    }

    const monthsMissingRule = route.months.filter(
      (month) => !(selection[month.monthStart] ?? []).includes(rule.key),
    );
    if (monthsMissingRule.length === 0) {
      const message = `${rule.label} was already applied to all visible months.`;
      setFeedback(message);
      setError(null);
      emitClientActivityLog({
        kind: "action",
        level: "warning",
        title: "Rule already applied everywhere",
        detail: `${route.label} · ${message}`,
      });
      return;
    }

    setSelection((current) => {
      const next: PlannerSelectionState = { ...current };
      for (const month of route.months) {
        const monthSelection = new Set(next[month.monthStart] ?? []);
        monthSelection.add(rule.key);
        next[month.monthStart] = Array.from(monthSelection);
      }

      return next;
    });
    setFeedback(`${rule.label} applied to ${monthsMissingRule.length} visible month(s).`);
    setError(null);
    emitClientActivityLog({
      kind: "action",
      level: "info",
      title: "Rule applied to all visible months",
      detail: `${route.label} · ${rule.label} · ${monthsMissingRule.length} month(s) updated`,
    });
  }

  function removeRuleFromAllMonths(patternKey: string) {
    const rule = parseRuleKey(patternKey, route.maxStops);
    setSelection((current) => {
      const next: PlannerSelectionState = { ...current };
      for (const month of route.months) {
        const monthSelection = new Set(next[month.monthStart] ?? []);
        monthSelection.delete(patternKey);
        next[month.monthStart] = Array.from(monthSelection);
      }

      return next;
    });
    setFeedback(rule ? `${rule.label} removed from all visible months.` : "Rule removed from all visible months.");
    setError(null);
    emitClientActivityLog({
      kind: "action",
      level: "info",
      title: "Rule removed from all visible months",
      detail: `${route.label} · ${rule?.label ?? patternKey}`,
    });
  }

  function savePlanner() {
    void persistPlannerSelection(selection, {
      successTitle: "Route planner saved",
      successDetail: `${route.label} · ${route.months.length} month(s) persisted`,
      successFeedback: "Planner saved across all visible months.",
      errorTitle: "Route planner save failed",
    });
  }

  function createAutomaticRules() {
    setFeedback(null);
    setError(null);

    startTransition(async () => {
      try {
        await createAutomaticRoutePlannerRulesAction({
          routeId: route.id,
        });
        const generated = buildAutomaticSelectionsForRoute(route);
        const nextSelection: PlannerSelectionState = Object.fromEntries(
          generated.months.map((month) => [month.monthStart, month.patternKeys]),
        );

        if (generated.rulesAdded === 0) {
          const message =
            "No new automatic rules were possible for the visible months with the currently detected outbound weekdays.";
          setFeedback(message);
          emitClientActivityLog({
            kind: "action",
            level: "warning",
            title: "Create rules found nothing new",
            detail: `${route.label} · ${message}`,
          });
          return;
        }

        setSelection(nextSelection);
        onSelectionPersisted(route.id, nextSelection);
        setFeedback(
          `Automatic rules created in ${generated.monthsUpdated} visible month(s) and saved automatically.`,
        );
        emitClientActivityLog({
          kind: "action",
          level: "info",
          title: "Automatic rules created",
          detail: `${route.label} · ${generated.monthsUpdated} month(s) updated · ${generated.rulesAdded} new rule slot(s) generated and saved automatically`,
        });
        router.refresh();
      } catch (saveError) {
        const message =
          saveError instanceof Error
            ? saveError.message
            : "The automatic rules could not be created right now.";
        setError(message);
        emitClientActivityLog({
          kind: "action",
          level: "error",
          title: "Automatic rule creation failed",
          detail: `${route.label} · ${message}`,
        });
      }
    });
  }

  function clearAllRules() {
    const hasAnyRules = route.months.some((month) => (selection[month.monthStart] ?? []).length > 0);
    if (!hasAnyRules) {
      const message = "There are no visible rules to clear.";
      setFeedback(message);
      setError(null);
      emitClientActivityLog({
        kind: "action",
        level: "warning",
        title: "Clear all rules found nothing",
        detail: `${route.label} · ${message}`,
      });
      return;
    }

    const nextSelection: PlannerSelectionState = Object.fromEntries(
      route.months.map((month) => [month.monthStart, []]),
    );

    void persistPlannerSelection(nextSelection, {
      successTitle: "All rules cleared",
      successDetail: `${route.label} · all visible month rules removed · saved automatically`,
      successFeedback: "All visible rules cleared and saved automatically.",
      errorTitle: "Clear all rules failed",
    });
  }

  const totalSelectedRules = route.months.reduce(
    (total, month) => total + (selection[month.monthStart] ?? []).length,
    0,
  );
  const discoveryNotice = summarizeRouteDiscoveryNotice(route, route.latestDiscovery);

  const content = (
    <div className="active-route-modal__overlay" onClick={onClose} role="presentation">
      <div
        aria-modal="true"
        className="active-route-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="active-route-modal__header">
          <div>
            <p className="ops-panel__eyebrow">Route planner</p>
            <h2>{route.label}</h2>
            <p>
              {formatStayBucketListLabel(route.stayBuckets)} · {formatStops(route.maxStops)} ·{" "}
              {route.airlineSummary ?? "Airline pending"} · {route.pendingChangeCount} cadence change(s) waiting
            </p>
          </div>
          <div className="active-route-modal__header-actions">
            <div className="active-route-modal__pager">
              <span className="active-route-modal__pager-count">
                {routeIndex + 1} / {routeCount}
              </span>
              <button
                aria-label="Previous route"
                className="active-route-modal__nav"
                onClick={onPrevious}
                type="button"
              >
                ←
              </button>
              <button
                aria-label="Next route"
                className="active-route-modal__nav"
                onClick={onNext}
                type="button"
              >
                →
              </button>
            </div>
            <button
              className="ops-button ops-button--approve"
              disabled={isPending}
              onClick={savePlanner}
              type="button"
            >
              {isPending ? "Saving..." : "Save all visible months"}
            </button>
            <button className="active-route-modal__close" onClick={onClose} type="button">
              Close
            </button>
          </div>
        </div>

        {route.changeAlerts.length > 0 ? (
          <section className="active-route-modal__changes">
            <button
              aria-expanded={showChangeAlerts}
              className={`active-route-modal__toggle ${
                showChangeAlerts ? "is-open" : ""
              }`}
              onClick={() => setShowChangeAlerts((current) => !current)}
              type="button"
            >
              <div>
                <strong>Cadence changes detected</strong>
                <span>
                  {route.changeAlerts.length} month{route.changeAlerts.length === 1 ? "" : "s"} with
                  changes
                </span>
              </div>
              <small>{showChangeAlerts ? "Hide" : "Open"}</small>
            </button>
            {showChangeAlerts ? (
              <>
                <div className="active-route-modal__section-head">
                  <p>These were found by the latest monthly discovery pass.</p>
                </div>
                <div className="active-route-modal__change-list">
                  {route.changeAlerts.map((alert) => (
                    <RouteChangeCard alert={alert} key={alert.id} />
                  ))}
                </div>
              </>
            ) : null}
          </section>
        ) : null}

        {discoveryNotice ? (
          <section className="active-route-modal__status">
            <div className="active-route-month__warning">
              <strong>{discoveryNotice.title}</strong>
              <p>{discoveryNotice.body}</p>
            </div>
          </section>
        ) : null}

        <section className="active-route-global">
          <div className="active-route-global__header">
            <div>
              <h3>Rules for all visible months</h3>
              <p>
                The dates scanner below only records Luxembourg departure dates. Add manual search
                rules here, then use the month cards below only for exceptions or extra month-only
                rules.
              </p>
            </div>
            <span>{totalSelectedRules} selected rule slots across the planner</span>
          </div>

          {sharedRules.length === 0 ? (
            <p className="active-route-month__empty">
              No shared rules applied to every visible month yet.
            </p>
          ) : (
            <div className="active-route-month__rule-list">
              {sharedRules.map((rule) => (
                <RouteRuleChip
                  key={`global:${rule.key}`}
                  onRemove={removeRuleFromAllMonths}
                  rule={rule}
                />
              ))}
            </div>
          )}

          <div className="active-route-global__controls">
            <RuleComposer
              draft={globalDraft}
              onChange={setGlobalDraft}
              onSubmit={() => {
                addRuleToAllMonths(globalDraft);
                setGlobalDraft(emptyRuleDraft());
              }}
              submitLabel="Apply to all months"
            />
            <div className="active-route-global__actions">
              <button
                className="ops-button ops-button--ghost active-route-global__create"
                disabled={isPending}
                onClick={createAutomaticRules}
                type="button"
              >
                {isPending ? "Creating..." : "Create rules (auto-save)"}
              </button>
              <button
                className="ops-button ops-button--ghost active-route-global__clear"
                disabled={isPending}
                onClick={clearAllRules}
                type="button"
              >
                {isPending ? "Clearing..." : "Clear all rules (auto-save)"}
              </button>
            </div>
          </div>

          {feedback ? <p className="active-route-global__feedback is-success">{feedback}</p> : null}
          {error ? <p className="active-route-global__feedback is-error">{error}</p> : null}
        </section>

        <section className="active-route-modal__months">
          {route.months.map((month) => (
            <MonthPlanner
              key={`${route.id}:${month.monthStart}`}
              month={month}
              onAddRule={addMonthRule}
              onRemoveRule={removeMonthRule}
              selectedRules={rulesByMonth.get(month.monthStart) ?? []}
            />
          ))}
        </section>
      </div>
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(content, document.body);
}

export function ActiveRoutesBoard({ data }: { data: OpsActiveRoutesData }) {
  const router = useRouter();
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedRouteSnapshot, setSelectedRouteSnapshot] = useState<ActiveRouteSummary | null>(null);
  const [routeOverrides, setRouteOverrides] = useState<Record<string, ActiveRouteSummary>>({});
  const [isDiscoveryRunning, setIsDiscoveryRunning] = useState(false);
  const [isDiscoveryBusy, setIsDiscoveryBusy] = useState(false);
  const [bulkFeedback, setBulkFeedback] = useState<string | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [discoveryRouteId, setDiscoveryRouteId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<ActiveRoutesSortField>("route");
  const [sortDirection, setSortDirection] = useState<ActiveRoutesSortDirection>("asc");
  const [columnWidths, setColumnWidths] = useState<ActiveRouteColumnWidths>(
    DEFAULT_ACTIVE_ROUTE_COLUMN_WIDTHS,
  );
  const [isBulkPending, startBulkTransition] = useTransition();
  const wasDiscoveryRunningRef = useRef(false);
  const resizeStateRef = useRef<{
    key: ActiveRouteColumnKey;
    startX: number;
    startWidth: number;
  } | null>(null);
  const routesForView = useMemo(
    () => data.routes.map((route) => routeOverrides[route.id] ?? route),
    [data.routes, routeOverrides],
  );
  const sortedRoutes = useMemo(() => {
    return [...routesForView].sort((left, right) => {
      const leftRulesActive = left.months.reduce(
        (total, month) => total + month.activePatternKeys.length,
        0,
      );
      const rightRulesActive = right.months.reduce(
        (total, month) => total + month.activePatternKeys.length,
        0,
      );

      let comparison = 0;
      switch (sortField) {
        case "route":
          comparison = compareText(left.label, right.label);
          break;
        case "bucket":
          comparison =
            compareText(
              formatStayBucketListLabel(left.stayBuckets),
              formatStayBucketListLabel(right.stayBuckets),
            ) ||
            compareText(left.label, right.label);
          break;
        case "routing":
          comparison =
            compareText(formatStops(left.maxStops), formatStops(right.maxStops)) ||
            compareText(left.label, right.label);
          break;
        case "airlines":
          comparison =
            compareText(left.airlineSummary ?? "zzzz", right.airlineSummary ?? "zzzz") ||
            compareText(left.label, right.label);
          break;
        case "rulesActive":
          comparison = leftRulesActive - rightRulesActive || compareText(left.label, right.label);
          break;
        case "cadenceChanges":
          comparison =
            left.pendingChangeCount - right.pendingChangeCount || compareText(left.label, right.label);
          break;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [routesForView, sortDirection, sortField]);
  const selectedRoute = useMemo(
    () =>
      sortedRoutes.find((route) => route.id === selectedRouteId) ??
      routesForView.find((route) => route.id === selectedRouteId) ??
      (selectedRouteSnapshot?.id === selectedRouteId ? selectedRouteSnapshot : null) ??
      null,
    [routesForView, selectedRouteId, selectedRouteSnapshot, sortedRoutes],
  );
  const selectedRouteIndex = useMemo(
    () => sortedRoutes.findIndex((route) => route.id === selectedRouteId),
    [selectedRouteId, sortedRoutes],
  );

  function openRoute(route: ActiveRouteSummary) {
    setSelectedRouteId(route.id);
    setSelectedRouteSnapshot(route);
  }

  function closeRoutePlanner() {
    setSelectedRouteId(null);
    setSelectedRouteSnapshot(null);
  }

  function applySelectionOverrides(
    updates: Array<{ routeId: string; nextSelection: PlannerSelectionState }>,
  ) {
    if (updates.length === 0) {
      return;
    }

    setRouteOverrides((current) => {
      const next = { ...current };
      for (const update of updates) {
        const baseRoute =
          current[update.routeId] ??
          routesForView.find((route) => route.id === update.routeId) ??
          data.routes.find((route) => route.id === update.routeId);
        if (!baseRoute) {
          continue;
        }

        next[update.routeId] = applySelectionToRoute(baseRoute, update.nextSelection);
      }

      return next;
    });
  }

  function applyPersistedSelectionToSnapshot(routeId: string, nextSelection: PlannerSelectionState) {
    applySelectionOverrides([{ routeId, nextSelection }]);
    setSelectedRouteSnapshot((current) => {
      if (!current || current.id !== routeId) {
        return current;
      }

      return applySelectionToRoute(current, nextSelection);
    });
  }

  useEffect(() => {
    setRouteOverrides({});
    setSelectedRouteSnapshot((current) => {
      if (!current) {
        return current;
      }

      return data.routes.find((route) => route.id === current.id) ?? current;
    });
  }, [data.routes]);

  useEffect(() => {
    let isMounted = true;

    async function loadStatus() {
      try {
        const response = await fetch("/api/ops/pattern-discovery-status", {
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { running?: boolean };
        if (!isMounted) {
          return;
        }

        const running = Boolean(payload.running);
        const wasRunning = wasDiscoveryRunningRef.current;
        wasDiscoveryRunningRef.current = running;
        setIsDiscoveryRunning(running);
        if (wasRunning && !running) {
          router.refresh();
        }
        if (!running) {
          setDiscoveryRouteId(null);
        }
      } catch {
        // Keep quiet if the ops poll fails.
      }
    }

    void loadStatus();
    const interval = window.setInterval(loadStatus, 10000);
    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [router]);

  useEffect(() => {
    function handlePointerMove(event: MouseEvent) {
      const resizeState = resizeStateRef.current;
      if (!resizeState) {
        return;
      }

      const delta = event.clientX - resizeState.startX;
      const nextWidth = Math.max(
        ACTIVE_ROUTE_COLUMN_MIN_WIDTHS[resizeState.key],
        resizeState.startWidth + delta,
      );

      setColumnWidths((current) => ({
        ...current,
        [resizeState.key]: nextWidth,
      }));
    }

    function stopResize() {
      resizeStateRef.current = null;
      document.body.classList.remove("is-resizing-columns");
    }

    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", stopResize);

    return () => {
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", stopResize);
    };
  }, []);

  async function runSingleRouteDiscovery(route: ActiveRouteSummary) {
    setIsDiscoveryBusy(true);

    try {
      const response = await fetch("/api/ops/pattern-discovery-run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          route: {
            originAirport: route.originAirport,
            destinationAirport: route.destinationAirport,
            maxStops: route.maxStops,
          },
        }),
      });

      if (response.status === 409) {
        setIsDiscoveryRunning(true);
        return;
      }

      if (!response.ok) {
        return;
      }

      setDiscoveryRouteId(route.id);
      setIsDiscoveryRunning(true);
    } catch {
      // Ignore transient trigger errors in the inline button.
    } finally {
      setIsDiscoveryBusy(false);
    }
  }

  function toggleSort(field: ActiveRoutesSortField) {
    setSortDirection((currentDirection) =>
      nextSortDirection(sortField, currentDirection, field),
    );
    setSortField(field);
  }

  function startColumnResize(key: ActiveRouteColumnKey, event: ReactMouseEvent<HTMLSpanElement>) {
    event.preventDefault();
    event.stopPropagation();
    resizeStateRef.current = {
      key,
      startX: event.clientX,
      startWidth: columnWidths[key],
    };
    document.body.classList.add("is-resizing-columns");
  }

  function openPreviousRoute() {
    if (sortedRoutes.length === 0 || selectedRouteIndex < 0) {
      return;
    }

    const nextIndex = (selectedRouteIndex - 1 + sortedRoutes.length) % sortedRoutes.length;
    const nextRoute = sortedRoutes[nextIndex] ?? null;
    setSelectedRouteId(nextRoute?.id ?? null);
    setSelectedRouteSnapshot(nextRoute);
  }

  function openNextRoute() {
    if (sortedRoutes.length === 0 || selectedRouteIndex < 0) {
      return;
    }

    const nextIndex = (selectedRouteIndex + 1) % sortedRoutes.length;
    const nextRoute = sortedRoutes[nextIndex] ?? null;
    setSelectedRouteId(nextRoute?.id ?? null);
    setSelectedRouteSnapshot(nextRoute);
  }

  function createRulesForAllRoutes() {
    setBulkFeedback(null);
    setBulkError(null);
    startBulkTransition(async () => {
      try {
        await createAutomaticRoutePlannerRulesForRoutesAction({
          routeIds: sortedRoutes.map((route) => route.id),
        });
        const generatedPayload = sortedRoutes.map((route) => {
          const generated = buildAutomaticSelectionsForRoute(route);
          return {
            routeId: route.id,
            months: generated.months,
            monthsUpdated: generated.monthsUpdated,
            rulesAdded: generated.rulesAdded,
          };
        });
        const routesUpdated = generatedPayload.filter((route) => route.rulesAdded > 0).length;
        const rulesAdded = generatedPayload.reduce((total, route) => total + route.rulesAdded, 0);
        const monthsUpdated = generatedPayload.reduce((total, route) => total + route.monthsUpdated, 0);

        if (rulesAdded === 0) {
          const message =
            "No new automatic rules were possible for the visible destinations with the currently detected outbound weekdays.";
          setBulkFeedback(message);
          setBulkError(null);
          emitClientActivityLog({
            kind: "action",
            level: "warning",
            title: "Global create rules found nothing",
            detail: message,
          });
          return;
        }

        applySelectionOverrides(
          generatedPayload.map((route) => ({
            routeId: route.routeId,
            nextSelection: Object.fromEntries(
              route.months.map((month) => [month.monthStart, month.patternKeys]),
            ),
          })),
        );
        setSelectedRouteSnapshot((current) => {
          if (!current) {
            return current;
          }
          const matching = generatedPayload.find((route) => route.routeId === current.id);
          if (!matching) {
            return current;
          }
          return applySelectionToRoute(
            current,
            Object.fromEntries(matching.months.map((month) => [month.monthStart, month.patternKeys])),
          );
        });
        setBulkFeedback(
          `Automatic rules created in ${monthsUpdated} month(s) across ${routesUpdated} destination(s) and saved automatically.`,
        );
        emitClientActivityLog({
          kind: "action",
          level: "info",
          title: "Global automatic rules created",
          detail: `${monthsUpdated} month(s) updated in ${routesUpdated} destination(s) · ${rulesAdded} new rule slot(s) generated and saved automatically`,
        });
        router.refresh();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "The automatic rules could not be created right now.";
        setBulkError(message);
        emitClientActivityLog({
          kind: "action",
          level: "error",
          title: "Global create rules failed",
          detail: message,
        });
      }
    });
  }

  function clearRulesForAllRoutes() {
    const routesWithRules = sortedRoutes.filter((route) =>
      route.months.some((month) => month.activePatternKeys.length > 0),
    );
    if (routesWithRules.length === 0) {
      const message = "There are no visible route rules to clear.";
      setBulkFeedback(message);
      setBulkError(null);
      emitClientActivityLog({
        kind: "action",
        level: "warning",
        title: "Global clear rules found nothing",
        detail: message,
      });
      return;
    }

    const payload = routesWithRules.map((route) => ({
      routeId: route.id,
      months: route.months.map((month) => ({
        monthStart: month.monthStart,
        patternKeys: [] as string[],
      })),
    }));

    setBulkFeedback(null);
    setBulkError(null);
    startBulkTransition(async () => {
      try {
        for (const route of payload) {
          await saveRoutePlannerRulesAction({
            routeId: route.routeId,
            months: route.months,
          });
        }
        applySelectionOverrides(
          payload.map((route) => ({
            routeId: route.routeId,
            nextSelection: Object.fromEntries(
              route.months.map((month) => [month.monthStart, month.patternKeys]),
            ),
          })),
        );
        setSelectedRouteSnapshot((current) => {
          if (!current) {
            return current;
          }
          const matching = payload.find((route) => route.routeId === current.id);
          if (!matching) {
            return current;
          }
          return applySelectionToRoute(
            current,
            Object.fromEntries(matching.months.map((month) => [month.monthStart, month.patternKeys])),
          );
        });
        setBulkFeedback(
          `All visible rules cleared across ${routesWithRules.length} destination(s) and saved automatically.`,
        );
        emitClientActivityLog({
          kind: "action",
          level: "info",
          title: "Global rules cleared",
          detail: `${routesWithRules.length} destination(s) cleared · saved automatically`,
        });
        router.refresh();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "The rules could not be cleared right now.";
        setBulkError(message);
        emitClientActivityLog({
          kind: "action",
          level: "error",
          title: "Global clear rules failed",
          detail: message,
        });
      }
    });
  }

  const tableGridTemplate = useMemo(
    () => activeRouteTableGridTemplate(columnWidths),
    [columnWidths],
  );
  const rowStyle = useMemo(
    () => ({ gridTemplateColumns: tableGridTemplate } satisfies CSSProperties),
    [tableGridTemplate],
  );

  return (
    <section className="ops-panel ops-panel--wide">
      <div className="ops-panel__header">
        <div>
          <p className="ops-panel__eyebrow">Coverage</p>
          <h2>Active route grid</h2>
        </div>
        <div className="active-route-grid__header-side">
          <p>
            {data.routes.length} seeded routes · {data.totalChangeAlerts} cadence change(s) waiting
          </p>
          <div className="active-route-grid__actions">
            <button
              className="ops-button ops-button--ghost"
              disabled={isBulkPending}
              onClick={createRulesForAllRoutes}
              type="button"
            >
              {isBulkPending ? "Creating..." : "Create rules"}
            </button>
            <button
              className="ops-button ops-button--ghost"
              disabled={isBulkPending}
              onClick={clearRulesForAllRoutes}
              type="button"
            >
              {isBulkPending ? "Clearing..." : "Clear all rules"}
            </button>
          </div>
        </div>
      </div>

      {bulkFeedback ? <p className="active-route-grid__feedback is-success">{bulkFeedback}</p> : null}
      {bulkError ? <p className="active-route-grid__feedback is-error">{bulkError}</p> : null}

      {data.routes.length === 0 ? (
        <div className="ops-empty">
          <p>
            Run the monthly service discovery after applying the schema and this planner will fill
            with route calendars for the next 9 months.
          </p>
        </div>
      ) : (
        <div className="ops-route-table active-route-table" role="table" aria-label="Active route grid">
          <div className="ops-route-table__row ops-route-table__row--head" role="row" style={rowStyle}>
            <span
              aria-sort={ariaSortValue(sortField, sortDirection, "route")}
              role="columnheader"
            >
              <SortableHeader
                activeDirection={sortDirection}
                activeField={sortField}
                field="route"
                label="Route"
                onToggle={toggleSort}
                onResizeStart={(event) => startColumnResize("route", event)}
              />
            </span>
            <span
              aria-sort={ariaSortValue(sortField, sortDirection, "bucket")}
              role="columnheader"
            >
              <SortableHeader
                activeDirection={sortDirection}
                activeField={sortField}
                field="bucket"
                label="Bucket"
                onToggle={toggleSort}
                onResizeStart={(event) => startColumnResize("bucket", event)}
              />
            </span>
            <span
              aria-sort={ariaSortValue(sortField, sortDirection, "routing")}
              role="columnheader"
            >
              <SortableHeader
                activeDirection={sortDirection}
                activeField={sortField}
                field="routing"
                label="Routing"
                onToggle={toggleSort}
                onResizeStart={(event) => startColumnResize("routing", event)}
              />
            </span>
            <span
              aria-sort={ariaSortValue(sortField, sortDirection, "airlines")}
              role="columnheader"
            >
              <SortableHeader
                activeDirection={sortDirection}
                activeField={sortField}
                field="airlines"
                label="Airlines"
                onToggle={toggleSort}
                onResizeStart={(event) => startColumnResize("airlines", event)}
              />
            </span>
            <span
              aria-sort={ariaSortValue(sortField, sortDirection, "rulesActive")}
              role="columnheader"
            >
              <SortableHeader
                activeDirection={sortDirection}
                activeField={sortField}
                field="rulesActive"
                label="Rules"
                onToggle={toggleSort}
                onResizeStart={(event) => startColumnResize("rules", event)}
              />
            </span>
            <span
              aria-sort={ariaSortValue(sortField, sortDirection, "cadenceChanges")}
              role="columnheader"
            >
              <SortableHeader
                activeDirection={sortDirection}
                activeField={sortField}
                field="cadenceChanges"
                label="Cadence changes"
                onToggle={toggleSort}
                onResizeStart={(event) => startColumnResize("cadence", event)}
              />
            </span>
            <span role="columnheader">
              <div className="ops-route-table__sort-wrap">
                <span className="ops-route-table__plain-head">Scan</span>
                <span
                  aria-hidden="true"
                  className="ops-route-table__resize-handle"
                  onMouseDown={(event) => startColumnResize("scan", event)}
                />
              </div>
            </span>
            <span role="columnheader">
              <div className="ops-route-table__sort-wrap">
                <span className="ops-route-table__plain-head">Open</span>
                <span
                  aria-hidden="true"
                  className="ops-route-table__resize-handle"
                  onMouseDown={(event) => startColumnResize("planner", event)}
                />
              </div>
            </span>
          </div>
          {sortedRoutes.map((route) => {
            const activeRuleCount = route.months.reduce(
              (total, month) => total + month.activePatternKeys.length,
              0,
            );
            const isRouteBeingScanned = discoveryRouteId === route.id;
            const discoveryButtonLabel = isDiscoveryBusy && isRouteBeingScanned
              ? "Starting..."
              : isDiscoveryRunning && isRouteBeingScanned
                ? "Scanning..."
                : isDiscoveryRunning
                  ? "Scanner busy"
                  : "Scan dates";

            return (
              <div
                aria-label={`Open planner for ${route.label}`}
                className="ops-route-table__row active-route-table__row is-clickable"
                key={route.id}
                onClick={() => openRoute(route)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openRoute(route);
                  }
                }}
                role="row"
                style={rowStyle}
                tabIndex={0}
              >
                <span role="cell">
                  <strong>{route.label}</strong>
                </span>
                <span role="cell">{formatStayBucketListLabel(route.stayBuckets)}</span>
                <span role="cell">{formatStops(route.maxStops)}</span>
                <span role="cell">{route.airlineSummary ?? "Pending"}</span>
                <span role="cell">{activeRuleCount}</span>
                <span role="cell">
                  {route.pendingChangeCount > 0 ? (
                    <span className="active-route-table__badge is-warning">
                      {route.pendingChangeCount} change(s)
                    </span>
                  ) : (
                    <span className="active-route-table__badge">Stable</span>
                  )}
                </span>
                <span role="cell">
                  <button
                    className="ops-button ops-button--ghost"
                    disabled={isDiscoveryBusy || isDiscoveryRunning}
                onClick={(event) => {
                      event.stopPropagation();
                      void runSingleRouteDiscovery(route);
                    }}
                    type="button"
                  >
                    {discoveryButtonLabel === "Scan dates" ? "Scan" : discoveryButtonLabel}
                  </button>
                </span>
                <span role="cell">
                  <button
                    aria-label={`Open planner for ${route.label}`}
                    className="ops-button ops-button--ghost active-route-table__icon-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openRoute(route);
                    }}
                    type="button"
                  >
                    ↗
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {selectedRoute ? (
        <RoutePlannerModal
          onClose={closeRoutePlanner}
          onNext={openNextRoute}
          onPrevious={openPreviousRoute}
          onSelectionPersisted={applyPersistedSelectionToSnapshot}
          route={selectedRoute}
          routeCount={sortedRoutes.length}
          routeIndex={Math.max(selectedRouteIndex, 0)}
        />
      ) : null}
    </section>
  );
}
