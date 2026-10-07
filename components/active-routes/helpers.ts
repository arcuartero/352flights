import type {
  ActiveRouteRule,
  ActiveRouteMonthSummary,
  ActiveRouteSummary,
  ActiveRouteLatestDiscovery,
} from "@/lib/active-routes";

export const WEEKDAY_ORDER = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

export const WEEKDAY_LABELS: Record<(typeof WEEKDAY_ORDER)[number], string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
  SUN: "Sun",
};

export type PlannerSelectionState = Record<string, string[]>;

export type ActiveRoutesSortField =
  | "route"
  | "bucket"
  | "routing"
  | "airlines"
  | "rulesActive"
  | "cadenceChanges";

export type ActiveRoutesSortDirection = "asc" | "desc";

export type RuleDraft = {
  departureWeekday: (typeof WEEKDAY_ORDER)[number];
  returnWeekday: (typeof WEEKDAY_ORDER)[number];
  spansNextWeek: boolean;
};

export async function createAutomaticRulesRequest<T>(body: { routeId: string } | { routeIds: string[] }) {
  const response = await fetch("/api/ops/route-rules/automatic", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as
    | { result?: T; results?: T; error?: string }
    | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? `Automatic rules request failed (${response.status}).`);
  }

  const result = payload?.result ?? payload?.results;
  if (result === undefined) {
    throw new Error("The server returned an invalid automatic rules response.");
  }
  return result;
}

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

export type ActiveRouteColumnKey = (typeof ACTIVE_ROUTE_COLUMN_DEFS)[number]["key"];

export type ActiveRouteColumnWidths = Record<ActiveRouteColumnKey, number>;

export const DEFAULT_ACTIVE_ROUTE_COLUMN_WIDTHS = Object.fromEntries(
  ACTIVE_ROUTE_COLUMN_DEFS.map((column) => [column.key, column.width]),
) as ActiveRouteColumnWidths;

export const ACTIVE_ROUTE_COLUMN_MIN_WIDTHS = Object.fromEntries(
  ACTIVE_ROUTE_COLUMN_DEFS.map((column) => [column.key, column.minWidth]),
) as ActiveRouteColumnWidths;

export function formatStops(value: string) {
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

export function formatDetectionRouting(value: string) {
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

export function formatMonthCheckedAt(value: string | null) {
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

export function compareText(left: string, right: string) {
  return left.localeCompare(right, undefined, { sensitivity: "base" });
}

export function activeRouteTableGridTemplate(columnWidths: ActiveRouteColumnWidths) {
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

export function emptyRuleDraft(): RuleDraft {
  return {
    departureWeekday: "FRI",
    returnWeekday: "SUN",
    spansNextWeek: false,
  };
}

export function buildRuleFromDraft(draft: RuleDraft, maxStops: string): ActiveRouteRule | null {
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

export function parseRuleKey(patternKey: string, maxStops: string): ActiveRouteRule | null {
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

export function nextSortDirection(
  currentField: ActiveRoutesSortField,
  currentDirection: ActiveRoutesSortDirection,
  targetField: ActiveRoutesSortField,
) {
  if (currentField !== targetField) {
    return targetField === "rulesActive" || targetField === "cadenceChanges" ? "desc" : "asc";
  }

  return currentDirection === "asc" ? "desc" : "asc";
}

export function ariaSortValue(
  activeField: ActiveRoutesSortField,
  activeDirection: ActiveRoutesSortDirection,
  field: ActiveRoutesSortField,
) {
  if (activeField !== field) {
    return "none";
  }

  return activeDirection === "asc" ? "ascending" : "descending";
}

function weekdayCodeForIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return WEEKDAY_ORDER[(date.getUTCDay() + 6) % 7];
}

function returnWeekdayCodeForIsoDate(value: string, tripNights: number) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day || !Number.isInteger(tripNights) || tripNights <= 0) {
    return null;
  }

  const returnDate = new Date(Date.UTC(year, month - 1, day + tripNights));
  return WEEKDAY_ORDER[(returnDate.getUTCDay() + 6) % 7];
}

function countMonthPricePossibilities(month: ActiveRouteMonthSummary) {
  return month.activeRules.reduce((total, rule) => {
    const matchingDepartures = month.departureDates.filter(
      (departureDate) =>
        weekdayCodeForIsoDate(departureDate) === rule.departureWeekday &&
        returnWeekdayCodeForIsoDate(departureDate, rule.tripNights) === rule.returnWeekday,
    ).length;

    return total + matchingDepartures;
  }, 0);
}

export function summarizePriceScanCapacity(routes: ActiveRouteSummary[]) {
  return routes.reduce(
    (summary, route) => {
      if (!route.isActive) {
        return summary;
      }

      let routePossibilities = 0;
      let routeHasRules = false;
      for (const month of route.months) {
        if (month.activeRules.length === 0) {
          continue;
        }

        routeHasRules = true;
        summary.activeRouteMonths += 1;
        summary.activeRuleSlots += month.activeRules.length;
        routePossibilities += countMonthPricePossibilities(month);
      }

      if (routeHasRules) {
        summary.activeRoutes += 1;
      }
      summary.pricePossibilities += routePossibilities;
      return summary;
    },
    {
      pricePossibilities: 0,
      activeRoutes: 0,
      activeRouteMonths: 0,
      activeRuleSlots: 0,
    },
  );
}

export function summarizeRouteDiscoveryNotice(
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

export function weekdayLabel(value: string) {
  return WEEKDAY_LABELS[value as keyof typeof WEEKDAY_LABELS] ?? value;
}

export function formatPatternKeyLabel(value: string) {
  const parts = value.split("-");
  if (parts.length === 2) {
    return `${weekdayLabel(parts[0].toUpperCase())} -> ${weekdayLabel(parts[1].toUpperCase())}`;
  }

  if (parts.length === 3 && parts[1] === "next") {
    return `${weekdayLabel(parts[0].toUpperCase())} -> next ${weekdayLabel(parts[2].toUpperCase())}`;
  }

  return value;
}

export function diffValues(previous: string[], next: string[]) {
  const previousSet = new Set(previous);
  const nextSet = new Set(next);

  return {
    added: next.filter((value) => !previousSet.has(value)),
    removed: previous.filter((value) => !nextSet.has(value)),
  };
}

export function summarizeChangeCounts(addedCount: number, removedCount: number, noun: string) {
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

export function summarizeVisibleValues(values: string[], formatter: (value: string) => string, limit = 10) {
  const visible = values.slice(0, limit).map(formatter);
  const hiddenCount = Math.max(values.length - limit, 0);

  if (hiddenCount === 0) {
    return visible;
  }

  return [...visible, `+${hiddenCount} more`];
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

export function sortPatterns<T extends { departureWeekday: string; returnWeekday: string; tripNights: number; label: string }>(
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

export function initialSelectionState(route: ActiveRouteSummary): PlannerSelectionState {
  return Object.fromEntries(
    route.months.map((month) => [month.monthStart, [...month.activePatternKeys]]),
  );
}

export function applySelectionToRoute(
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

export function monthCalendarCells(
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
