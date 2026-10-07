import "server-only";

import { JWT } from "google-auth-library";

type GaRow = { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] };
type GaResponse = { rows?: GaRow[]; totals?: GaRow[] };
type MetricSummary = { users: number; sessions: number; views: number; newUsers: number };

export type GaDashboard = {
  configured: boolean;
  measurementConfigured: boolean;
  error: string | null;
  activeNow: number;
  last7: MetricSummary;
  last30: MetricSummary;
  daily: { date: string; users: number; sessions: number; views: number }[];
  pages: { path: string; views: number; users: number }[];
  countries: { country: string; users: number }[];
};

const emptySummary = (): MetricSummary => ({ users: 0, sessions: 0, views: 0, newUsers: 0 });
const zero = (value?: string) => Number.isFinite(Number(value)) ? Number(value) : 0;
const metric = (row: GaRow | undefined, index: number) => zero(row?.metricValues?.[index]?.value);
let cached: { value: GaDashboard; expires: number } | null = null;

function summary(report: GaResponse): MetricSummary {
  const row = report.totals?.[0] ?? report.rows?.[0];
  return { users: metric(row, 0), sessions: metric(row, 1), views: metric(row, 2), newUsers: metric(row, 3) };
}

export async function getGaDashboard(): Promise<GaDashboard> {
  if (cached && Date.now() < cached.expires) return cached.value;
  const propertyId = process.env.GA4_PROPERTY_ID?.trim();
  const email = process.env.GA4_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = process.env.GA4_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const measurementConfigured = /^G-[A-Z0-9]+$/.test(process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID ?? "");
  const empty: GaDashboard = { configured: false, measurementConfigured, error: null, activeNow: 0,
    last7: emptySummary(), last30: emptySummary(), daily: [], pages: [], countries: [] };

  if (!propertyId || !/^\d+$/.test(propertyId) || !email || !privateKey) return empty;

  try {
    const client = new JWT({ email, key: privateKey, scopes: ["https://www.googleapis.com/auth/analytics.readonly"] });
    const access = await client.getAccessToken();
    if (!access.token) throw new Error("Could not authenticate with Google Analytics.");
    const endpoint = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}`;
    async function report(method: "runReport" | "runRealtimeReport", body: Record<string, unknown>): Promise<GaResponse> {
      const response = await fetch(`${endpoint}:${method}`, {
        method: "POST", headers: { Authorization: `Bearer ${access.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Google Analytics returned ${response.status}. Check the property ID and service account access.`);
      return response.json() as Promise<GaResponse>;
    }

    const metrics = ["activeUsers", "sessions", "screenPageViews", "newUsers"].map((name) => ({ name }));
    const [realtime, last7, last30, daily, pages, countries] = await Promise.all([
      report("runRealtimeReport", { metrics: [{ name: "activeUsers" }] }),
      report("runReport", { dateRanges: [{ startDate: "6daysAgo", endDate: "today" }], metrics }),
      report("runReport", { dateRanges: [{ startDate: "29daysAgo", endDate: "today" }], metrics }),
      report("runReport", { dateRanges: [{ startDate: "29daysAgo", endDate: "today" }],
        dimensions: [{ name: "date" }], metrics: metrics.slice(0, 3), orderBys: [{ dimension: { dimensionName: "date" } }] }),
      report("runReport", { dateRanges: [{ startDate: "29daysAgo", endDate: "today" }],
        dimensions: [{ name: "pagePath" }], metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }], limit: "8" }),
      report("runReport", { dateRanges: [{ startDate: "29daysAgo", endDate: "today" }],
        dimensions: [{ name: "country" }], metrics: [{ name: "activeUsers" }],
        orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }], limit: "8" }),
    ]);

    const value: GaDashboard = {
      configured: true, measurementConfigured, error: null,
      activeNow: metric(realtime.totals?.[0] ?? realtime.rows?.[0], 0),
      last7: summary(last7), last30: summary(last30),
      daily: (daily.rows ?? []).map((row) => ({ date: row.dimensionValues?.[0]?.value ?? "", users: metric(row, 0), sessions: metric(row, 1), views: metric(row, 2) })),
      pages: (pages.rows ?? []).map((row) => ({ path: row.dimensionValues?.[0]?.value ?? "", views: metric(row, 0), users: metric(row, 1) })),
      countries: (countries.rows ?? []).map((row) => ({ country: row.dimensionValues?.[0]?.value ?? "", users: metric(row, 0) })),
    };
    cached = { value, expires: Date.now() + 60_000 };
    return value;
  } catch (error) {
    return { ...empty, configured: true, error: error instanceof Error ? error.message : "Could not load Google Analytics." };
  }
}
