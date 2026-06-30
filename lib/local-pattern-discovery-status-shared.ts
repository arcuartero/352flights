export type LocalPatternDiscoveryLogLine = {
  id: string;
  timestamp: string;
  label: string;
  detail: string;
  secondaryDetail?: string | null;
  tone: "progress" | "success" | "muted" | "error";
};

export type LocalPatternDiscoveryRunTotals = {
  usesDefaults: number;
  manualRules: number;
  newOverrides: number;
  noSupportedPatterns: number;
  cadenceChanges: number;
  hardErrors: number;
};

export type LocalPatternDiscoveryStatus = {
  available: boolean;
  running: boolean;
  totalRoutes: number | null;
  startedRoutes: number | null;
  remainingRoutes: number | null;
  startedAt: string | null;
  latestFinishedAt: string | null;
  latestFailedAt: string | null;
  currentRouteLabel: string | null;
  latestActivity: string | null;
  recentLogLines: LocalPatternDiscoveryLogLine[];
  liveTotals: LocalPatternDiscoveryRunTotals | null;
};
