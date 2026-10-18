import type { MouseEvent as ReactMouseEvent } from "react";
import type {
  ActiveRoutesSortDirection,
  ActiveRoutesSortField,
} from "./helpers";

export function CapacityMetricLabel({
  label,
  tooltip,
  tooltipId,
}: {
  label: string;
  tooltip: string;
  tooltipId: string;
}) {
  return (
    <dt className="active-route-capacity-metric__label">
      <span>{label}</span>
      <span className="active-route-capacity-tooltip">
        <button
          aria-describedby={tooltipId}
          aria-label={`What ${label.toLowerCase()} means`}
          className="active-route-capacity-tooltip__trigger"
          type="button"
        >
          i
        </button>
        <span className="active-route-capacity-tooltip__content" id={tooltipId} role="tooltip">
          {tooltip}
        </span>
      </span>
    </dt>
  );
}

export function SortableHeader({
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
