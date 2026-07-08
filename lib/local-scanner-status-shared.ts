export type LocalScannerNoResultDiagnostic = {
  reasonCode: string;
  reasonLabel: string;
  reason: string;
  routeLabel: string;
  destinationCity?: string | null;
  bucket?: string | null;
  routing?: string | null;
  patternLabel: string;
  tripNights?: number | null;
  searchWindowStart?: string | null;
  searchWindowEnd?: string | null;
  departureDate?: string | null;
  returnDate?: string | null;
  airlineSummary?: string | null;
  price?: number | null;
  currency?: string | null;
  skyscannerUrl?: string | null;
  outboundDepartureAt?: string | null;
  outboundArrivalAt?: string | null;
  returnDepartureAt?: string | null;
  returnArrivalAt?: string | null;
  destinationStayHours?: number | null;
  outboundStopCount?: number | null;
  returnStopCount?: number | null;
  totalStopCount?: number | null;
  configuredRouting?: string | null;
  historyPoints?: number | null;
  minimumHistoryPoints?: number | null;
  baselinePrice?: number | null;
  requiredPrice?: number | null;
  dropRatio?: number | null;
  discountPercent?: number | null;
  reviewRatio?: number | null;
  routingRelaxed?: boolean | null;
  routingRelaxedReason?: string | null;
};

export type LocalScannerLogLine = {
  id: string;
  timestamp: string;
  label: string;
  detail: string;
  secondaryDetail?: string | null;
  categoryCode?: string | null;
  categoryLabel?: string | null;
  diagnostic?: LocalScannerNoResultDiagnostic | null;
  tone: "progress" | "success" | "muted" | "error";
};

export type LocalScannerRunTotals = {
  found: number;
  noResults: number;
  timedOut: number;
  networkOutages: number;
  hardErrors: number;
  retries: number;
};

export type LocalScannerBreakdownItem = {
  code: string;
  label: string;
  count: number;
};

export type LocalScannerStatus = {
  available: boolean;
  running: boolean;
  totalRoutes: number | null;
  startedRoutes: number | null;
  remainingRoutes: number | null;
  startedAt: string | null;
  latestCompletedAt: string | null;
  latestFinishedAt: string | null;
  currentRouteLabel: string | null;
  currentPatternLabel: string | null;
  currentPatternWindowLabel: string | null;
  latestActivity: string | null;
  recentLogLines: LocalScannerLogLine[];
  liveTotals: LocalScannerRunTotals | null;
  noResultBreakdown: LocalScannerBreakdownItem[];
  lastRunDurationMs: number | null;
  lastRunTotals: LocalScannerRunTotals | null;
  lastRunNoResultBreakdown: LocalScannerBreakdownItem[];
  lastRunLogLines: LocalScannerLogLine[];
};
