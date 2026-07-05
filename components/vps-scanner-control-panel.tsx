"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import type { VpsScannerAgentStatus } from "@/lib/vps-scanner-agent";

type StatusResponse =
  | VpsScannerAgentStatus
  | {
      ok: false;
      reason: string;
      detail?: string;
    };

function formatSystemdTimestamp(value: string | undefined) {
  if (!value || value === "n/a") return "n/a";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function lastMeaningfulLine(lines: string[]) {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim();
    if (line) return line;
  }
  return "No journal entries yet.";
}

function isStatusError(status: StatusResponse | null): status is Extract<StatusResponse, { ok: false }> {
  return Boolean(status && status.ok === false);
}

export function VpsScannerControlPanel() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function loadStatus() {
    const response = await fetch("/api/ops/vps-scanner/status", { cache: "no-store" });
    const payload = (await response.json()) as StatusResponse;
    setStatus(payload);
  }

  useEffect(() => {
    let mounted = true;

    async function poll() {
      try {
        const response = await fetch("/api/ops/vps-scanner/status", { cache: "no-store" });
        const payload = (await response.json()) as StatusResponse;
        if (mounted) setStatus(payload);
      } catch {
        if (mounted) {
          setStatus({ ok: false, reason: "status_request_failed" });
        }
      }
    }

    void poll();
    const interval = window.setInterval(poll, 10_000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  const configured = !isStatusError(status) || status.reason !== "vps_agent_not_configured";
  const running = Boolean(status && "running" in status && status.running);
  const recentJournal = useMemo(() => {
    if (!status || !("journal" in status)) return [];
    return status.journal.slice(-80);
  }, [status]);

  function runAction(action: "start" | "stop") {
    setMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/ops/vps-scanner/${action}`, {
          method: "POST",
          cache: "no-store",
        });
        const payload = await response.json();
        setMessage(payload.reason ?? (response.ok ? `${action} requested` : `${action} failed`));
        await loadStatus();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : `${action} failed`);
      }
    });
  }

  return (
    <section className="ops-panel ops-panel--wide vps-scanner-panel">
      <div className="ops-panel__header">
        <div>
          <p className="ops-panel__eyebrow">VPS Scanner</p>
          <h2>Remote scanner control</h2>
        </div>
        <span className={`ops-send-badge ${running ? "is-live" : "is-warning"}`}>
          {running ? "Running" : configured ? "Idle" : "Not configured"}
        </span>
      </div>

      {isStatusError(status) ? (
        <p className="ops-status ops-status--error">
          {status.reason}
          {status.detail ? `: ${status.detail}` : ""}
        </p>
      ) : null}

      {status && "service" in status ? (
        <>
          <dl className="vps-scanner-panel__facts">
            <div>
              <dt>Service</dt>
              <dd>
                {status.service.ActiveState ?? "unknown"} / {status.service.SubState ?? "unknown"}
              </dd>
            </div>
            <div>
              <dt>Last result</dt>
              <dd>{status.service.Result ?? "unknown"}</dd>
            </div>
            <div>
              <dt>Next automatic run</dt>
              <dd>{formatSystemdTimestamp(status.timer.NextElapseUSecRealtime)}</dd>
            </div>
            <div>
              <dt>Last line</dt>
              <dd>{lastMeaningfulLine(status.journal)}</dd>
            </div>
          </dl>

          <div className="vps-scanner-panel__actions">
            <button
              className="ops-button ops-button--approve"
              disabled={isPending || running}
              onClick={() => runAction("start")}
              type="button"
            >
              Run now
            </button>
            <button
              className="ops-button ops-button--ghost"
              disabled={isPending || !running}
              onClick={() => runAction("stop")}
              type="button"
            >
              Stop
            </button>
            <button
              className="ops-button ops-button--ghost"
              disabled={isPending}
              onClick={() => {
                startTransition(async () => {
                  await loadStatus();
                });
              }}
              type="button"
            >
              Refresh
            </button>
          </div>

          {message ? <p className="ops-status ops-status--success">{message}</p> : null}

          <details className="vps-scanner-panel__logs" open>
            <summary>Latest service logs</summary>
            <pre>{recentJournal.join("\n") || "No logs yet."}</pre>
          </details>
        </>
      ) : (
        <p className="ops-status ops-status--warning">
          Add the VPS scanner agent URL and token to enable remote controls.
        </p>
      )}
    </section>
  );
}
