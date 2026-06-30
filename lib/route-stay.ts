export type RouteStayInput = {
  tripNights: number;
  minTripNights?: number | null;
  maxTripNights?: number | null;
};

export function formatNightsLabel(nights: number) {
  return `${nights} ${nights === 1 ? "night" : "nights"}`;
}

export function formatRouteStayLabel(input: RouteStayInput) {
  const minTripNights = input.minTripNights ?? null;
  const maxTripNights = input.maxTripNights ?? null;

  if (minTripNights !== null && maxTripNights !== null) {
    if (minTripNights === maxTripNights) {
      return formatNightsLabel(minTripNights);
    }

    return `${minTripNights}-${maxTripNights} nights`;
  }

  if (minTripNights !== null) {
    return `${minTripNights}+ nights`;
  }

  if (maxTripNights !== null) {
    return `Up to ${maxTripNights} nights`;
  }

  return formatNightsLabel(input.tripNights);
}

export function formatRoutePatternLabel(routeLabel: string, patternLabel?: string | null) {
  if (!patternLabel) {
    return routeLabel;
  }

  return `${routeLabel} · ${patternLabel}`;
}
