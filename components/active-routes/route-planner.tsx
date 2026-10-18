import type {
  ActiveRouteRule,
  ActiveRouteMonthSummary,
  ActiveRouteSummary,
} from "@/lib/active-routes";
import { useState, useMemo, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveRoutePlannerRulesAction } from "@/app/ops/actions";
import { emitClientActivityLog } from "@/lib/client-activity-log";
import { formatStayBucketListLabel } from "@/lib/stay-buckets";
import { createPortal } from "react-dom";
import {
  type PlannerSelectionState,
  type RuleDraft,
  WEEKDAY_LABELS,
  WEEKDAY_ORDER,
  buildRuleFromDraft,
  createAutomaticRulesRequest,
  emptyRuleDraft,
  formatDetectionRouting,
  formatMonthCheckedAt,
  formatStops,
  initialSelectionState,
  monthCalendarCells,
  parseRuleKey,
  sortPatterns,
  summarizeRouteDiscoveryNotice,
  weekdayLabel,
} from "./helpers";
import { RouteChangeCard } from "./change-cards";

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

export function RoutePlannerModal({
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
        const generated = await createAutomaticRulesRequest<
          Awaited<ReturnType<typeof import("@/lib/active-routes").createAutomaticRoutePlannerSearchRules>>
        >({
          routeId: route.id,
        });
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
          router.refresh();
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
