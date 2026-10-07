"use client";

import { useEffect, useMemo, useState } from "react";
import type { GaDashboard } from "@/lib/ga4-reporting";

type Aggregate = { day: string; kind: "reject" | "close" | "selected" | "all" | "declined_view"; page_group: string; total: number };
type Dashboard = { ga: GaDashboard; anonymous: { available: boolean; rows: Aggregate[]; error: string | null } };

const format = (value: number) => new Intl.NumberFormat("en-GB").format(value);

export function OpsAnalyticsDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;
    async function refresh() {
      if (document.visibilityState === "hidden") return;
      try {
        const response = await fetch("/api/ops/analytics", { cache: "no-store" });
        if (!response.ok) throw new Error(`Could not load analytics (${response.status}).`);
        const payload = await response.json() as Dashboard;
        if (active) { setData(payload); setError(null); setUpdated(new Date()); }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load analytics.");
      }
    }
    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { active = false; window.clearInterval(interval); document.removeEventListener("visibilitychange", refresh); };
  }, []);

  const counts = useMemo(() => {
    const result = { reject: 0, close: 0, selected: 0, all: 0, declined_view: 0 };
    for (const row of data?.anonymous.rows ?? []) result[row.kind] += Number(row.total);
    return result;
  }, [data]);
  const maxSessions = Math.max(1, ...(data?.ga.daily ?? []).map((day) => day.sessions));

  return (
    <div className="ops-analytics">
      <div className="ops-analytics__status" role="status">
        {error ? <span>{error}</span> : updated ? `Updated ${updated.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} · refreshes every minute` : "Loading analytics…"}
      </div>
      {data && <>
        {!data.ga.measurementConfigured && <div className="ops-analytics__notice">GA4 collection is not connected yet. Set NEXT_PUBLIC_GA4_MEASUREMENT_ID to start measuring visitors who accept analytics cookies.</div>}
        {!data.ga.configured && <div className="ops-analytics__notice">To read GA4 reports here, add GA4_PROPERTY_ID and a read-only service account email and private key to the server environment. Give the account Viewer access to the GA4 property.</div>}
        {data.ga.error && <div className="ops-analytics__notice">GA4 report unavailable: {data.ga.error}</div>}

        <section className="ops-analytics__section">
          <div className="ops-analytics__section-heading"><div><h3>Google Analytics 4</h3><p>Only visitors who accepted the Analytics category. GA4 may take time to process new traffic.</p></div></div>
          <div className="ops-analytics__cards">
            <div className="ops-analytics__metric ops-analytics__metric--live"><span>Active now</span><strong>{data.ga.configured && !data.ga.error ? format(data.ga.activeNow) : "—"}</strong><small>Last 30 minutes · GA4 realtime</small></div>
            <div className="ops-analytics__metric"><span>Users · 7 days</span><strong>{data.ga.configured && !data.ga.error ? format(data.ga.last7.users) : "—"}</strong><small>Unique active users in GA4</small></div>
            <div className="ops-analytics__metric"><span>Sessions · 7 days</span><strong>{data.ga.configured && !data.ga.error ? format(data.ga.last7.sessions) : "—"}</strong><small>Consented sessions</small></div>
            <div className="ops-analytics__metric"><span>Page views · 7 days</span><strong>{data.ga.configured && !data.ga.error ? format(data.ga.last7.views) : "—"}</strong><small>Consented page views</small></div>
          </div>
          {data.ga.configured && !data.ga.error && <>
            <div className="ops-analytics__submetrics"><span>30 days: <strong>{format(data.ga.last30.users)}</strong> users</span><span><strong>{format(data.ga.last30.sessions)}</strong> sessions</span><span><strong>{format(data.ga.last30.views)}</strong> page views</span><span><strong>{format(data.ga.last30.newUsers)}</strong> new users</span></div>
            <div className="ops-analytics__two-columns">
              <div className="ops-analytics__chart"><h4>Sessions by day · last 30 days</h4><div className="ops-analytics__bars" aria-label="Daily sessions">{data.ga.daily.map((day) => <div className="ops-analytics__bar-column" key={day.date} title={`${day.date}: ${format(day.sessions)} sessions`}><span style={{ height: `${Math.max(3, 100 * day.sessions / maxSessions)}%` }} /></div>)}</div><p>{data.ga.daily.length ? `${data.ga.daily[0].date} → ${data.ga.daily.at(-1)?.date}` : "No sessions yet"}</p></div>
              <div className="ops-analytics__list"><h4>Top countries · 30 days</h4>{data.ga.countries.length ? data.ga.countries.map((item) => <div key={item.country}><span>{item.country}</span><strong>{format(item.users)}</strong></div>) : <p>No country data yet.</p>}</div>
            </div>
            <div className="ops-analytics__list"><h4>Top pages · 30 days</h4>{data.ga.pages.length ? data.ga.pages.map((item) => <div key={item.path}><span>{item.path}</span><strong>{format(item.views)} views · {format(item.users)} users</strong></div>) : <p>No page data yet.</p>}</div>
          </>}
        </section>

        <section className="ops-analytics__section">
          <div className="ops-analytics__section-heading"><div><h3>Anonymous consent activity</h3><p>First-party daily totals. No visitor ID, IP, user agent, session identifier, full URL or Google tag is stored for these counts.</p></div></div>
          {!data.anonymous.available && <div className="ops-analytics__notice">{data.anonymous.error}</div>}
          <div className="ops-analytics__cards">
            <div className="ops-analytics__metric"><span>Rejected</span><strong>{data.anonymous.available ? format(counts.reject) : "—"}</strong><small>Banner decisions · 30 days</small></div>
            <div className="ops-analytics__metric"><span>Closed</span><strong>{data.anonymous.available ? format(counts.close) : "—"}</strong><small>Saved as necessary only</small></div>
            <div className="ops-analytics__metric"><span>Accepted selection</span><strong>{data.anonymous.available ? format(counts.selected) : "—"}</strong><small>Includes necessary-only choices</small></div>
            <div className="ops-analytics__metric"><span>Accepted all</span><strong>{data.anonymous.available ? format(counts.all) : "—"}</strong><small>Banner decisions · 30 days</small></div>
          </div>
          <div className="ops-analytics__submetrics"><span>Views after reject or close: <strong>{data.anonymous.available ? format(counts.declined_view) : "—"}</strong></span></div>
          <p className="ops-analytics__explain">These are actions and page views, not unique people or sessions. Repeated visits and changed choices can add more than one count. Rejected visitors are never sent to Google Analytics.</p>
          {data.anonymous.available && <div className="ops-analytics__list"><h4>Pages viewed after declining · 30 days</h4>{(["home", "deals", "legal", "other"] as const).map((group) => <div key={group}><span>{group}</span><strong>{format(data.anonymous.rows.filter((row) => row.kind === "declined_view" && row.page_group === group).reduce((sum, row) => sum + Number(row.total), 0))}</strong></div>)}</div>}
        </section>
      </>}
    </div>
  );
}
