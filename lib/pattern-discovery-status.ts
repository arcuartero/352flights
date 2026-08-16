import { getLocalPatternDiscoveryStatus } from "@/lib/local-pattern-discovery-status";
import type {
  LocalPatternDiscoveryLogLine,
  LocalPatternDiscoveryStatus,
} from "@/lib/local-pattern-discovery-status-shared";
import {
  callVpsScannerAgent,
  hasVpsScannerAgentConfig,
  type VpsScannerAgentStatus,
} from "@/lib/vps-scanner-agent";

function asIsoTimestamp(value: string | null | undefined) {
  if (!value || value === "n/a") {
    return null;
  }

  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}

function journalMessage(line: string) {
  const serviceMessage = line.match(/\]:\s+(.*)$/)?.[1] ?? line;
  return serviceMessage.replace(/^\[[^\]]+\]\s*/, "").trim();
}

function journalTimestamp(line: string, fallback: string | null) {
  const embedded = line.match(/\[(\d{4}-\d{2}-\d{2}T[^\]]+Z)\]/)?.[1];
  return asIsoTimestamp(embedded) ?? fallback ?? new Date().toISOString();
}

function latestRunJournal(status: VpsScannerAgentStatus) {
  const startIndex = status.journal.findLastIndex((line) =>
    journalMessage(line).startsWith("Starting VPS route pattern discovery."),
  );
  return startIndex >= 0 ? status.journal.slice(startIndex) : status.journal;
}

function serviceExitStatus(status: VpsScannerAgentStatus) {
  const raw = status.service.ExecMainStatus;
  if (!raw || raw === "n/a") return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function latestFailureDetail(status: VpsScannerAgentStatus) {
  const scannerLines = status.latestScannerLog?.tail ?? [];
  const journalLines = latestRunJournal(status).map(journalMessage);
  const candidates = [...scannerLines, ...journalLines]
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.length <= 800)
    .filter((line) => !line.startsWith("Traceback (most recent call last)"))
    .filter((line) => !/^File \".*\", line \d+/.test(line))
    .filter((line) => !line.startsWith("VPS route pattern discovery failed with status "))
    .filter((line) => !line.includes("Main process exited, code=exited"))
    .filter((line) => !line.includes("Failed with result 'exit-code'"));
  const diagnostic = candidates.findLast((line) =>
    /(error|exception|failed|timeout|timed out|killed|memory|keyboardinterrupt|permission|denied|not found|no space)/i.test(line),
  );
  return diagnostic?.replace(/^\[[^\]]+\]\s*/, "") ?? null;
}

function stoppedFailureReason(status: VpsScannerAgentStatus) {
  const result = status.service.Result?.trim() || "unknown";
  const exitStatus = serviceExitStatus(status);
  const detail = latestFailureDetail(status);

  if (exitStatus === 137) {
    return `El VPS terminó el Date Scanner por falta de memoria o una señal de apagado (exit 137).${detail ? ` Último error: ${detail}` : ""}`;
  }
  if (exitStatus === 143 || exitStatus === 130) {
    return `El Date Scanner fue detenido mientras estaba en curso (exit ${exitStatus}).${detail ? ` Último mensaje: ${detail}` : ""}`;
  }
  if (exitStatus === 203) {
    return "systemd no pudo ejecutar el comando del Date Scanner (203/EXEC). Comprueba la ruta y los permisos del script.";
  }

  return `El servicio del VPS terminó con ${result}${exitStatus === null ? "" : ` (exit ${exitStatus})`}.${detail ? ` Último error: ${detail}` : ""}`;
}

function toRemoteLogLine(
  line: string,
  index: number,
  startedAt: string | null,
): LocalPatternDiscoveryLogLine | null {
  const message = journalMessage(line);
  const timestamp = journalTimestamp(line, startedAt);
  const base = {
    id: `vps:${timestamp}:${index}:${message}`,
    timestamp,
    secondaryDetail: null,
  };

  if (message.startsWith("Starting VPS route pattern discovery.")) {
    return { ...base, label: "Discovery started", detail: "VPS worker accepted the run.", tone: "progress" };
  }
  if (message.startsWith("Discovery scope: ")) {
    return {
      ...base,
      label: "Route scope",
      detail: message.slice("Discovery scope: ".length),
      tone: "progress",
    };
  }
  if (message.startsWith("Pattern discovery start: ")) {
    return {
      ...base,
      label: "Route started",
      detail: message.slice("Pattern discovery start: ".length),
      tone: "progress",
    };
  }
  if (message.startsWith("Service calendar result: ")) {
    return {
      ...base,
      label: "Service calendar",
      detail: message.slice("Service calendar result: ".length),
      tone: message.includes("no outbound departure dates") ? "muted" : "success",
    };
  }
  if (message.startsWith("Service cadence change: ")) {
    return {
      ...base,
      label: "Cadence change",
      detail: message.slice("Service cadence change: ".length),
      tone: "success",
    };
  }
  if (message.startsWith("Pattern discovery skipped: ")) {
    return {
      ...base,
      label: "Manual rules kept",
      detail: message.slice("Pattern discovery skipped: ".length),
      tone: "muted",
    };
  }
  if (message.startsWith("Pattern discovery result: ")) {
    return {
      ...base,
      label: "Defaults confirmed",
      detail: message.slice("Pattern discovery result: ".length),
      tone: "success",
    };
  }
  if (message.startsWith("VPS route pattern discovery finished successfully.")) {
    return { ...base, label: "Discovery finished", detail: "VPS run completed.", tone: "success" };
  }
  if (message.startsWith("VPS route pattern discovery failed")) {
    return { ...base, label: "Discovery failed", detail: message, tone: "error" };
  }

  return null;
}

function mergeRunningVpsStatus(
  persisted: LocalPatternDiscoveryStatus,
  remote: VpsScannerAgentStatus,
): LocalPatternDiscoveryStatus {
  const startedAt = asIsoTimestamp(remote.service.ExecMainStartTimestamp);
  const runJournal = latestRunJournal(remote);
  const remoteLogLines = runJournal
    .map((line, index) => toRemoteLogLine(line, index, startedAt))
    .filter(Boolean) as LocalPatternDiscoveryLogLine[];
  const routeStarts = runJournal
    .map((line) => journalMessage(line).match(/^Pattern discovery start:\s*(.+)$/)?.[1] ?? null)
    .filter(Boolean) as string[];
  const uniqueRoutes = new Set(
    routeStarts.map((route) => route.match(/^([A-Z0-9]{3}\s*->\s*[A-Z0-9]{3})/)?.[1] ?? route),
  );
  const currentRouteLabel = routeStarts.at(-1) ?? persisted.currentRouteLabel;
  const totalRoutes = persisted.totalRoutes;
  const startedRoutes = uniqueRoutes.size || null;
  const recentLogLines = [...persisted.recentLogLines, ...remoteLogLines].slice(-120);

  return {
    ...persisted,
    source: "vps",
    available: true,
    running: true,
    startedAt,
    startedRoutes,
    remainingRoutes:
      totalRoutes !== null && startedRoutes !== null
        ? Math.max(totalRoutes - startedRoutes, 0)
        : null,
    currentRouteLabel,
    latestActivity:
      remoteLogLines.at(-1)?.detail ?? journalMessage(runJournal.at(-1) ?? "") ?? null,
    recentLogLines,
    liveTotals: null,
  };
}

function mergeStoppedVpsStatus(
  persisted: LocalPatternDiscoveryStatus,
  remote: VpsScannerAgentStatus,
): LocalPatternDiscoveryStatus {
  const result = remote.service.Result?.trim().toLowerCase() ?? "";
  const exitAt = asIsoTimestamp(remote.service.ExecMainExitTimestamp);
  const failedAt = result && result !== "success" ? exitAt : null;

  return {
    ...persisted,
    source: "vps",
    available: true,
    running: false,
    startedRoutes: null,
    remainingRoutes: null,
    currentRouteLabel: null,
    latestFinishedAt:
      result === "success" ? exitAt ?? persisted.latestFinishedAt : persisted.latestFinishedAt,
    latestFailedAt: failedAt ?? persisted.latestFailedAt,
    failureReason: failedAt ? stoppedFailureReason(remote) : null,
    latestActivity: failedAt
      ? stoppedFailureReason(remote)
      : "VPS discovery is not running.",
    liveTotals: null,
  };
}

export async function getPatternDiscoveryStatus(): Promise<LocalPatternDiscoveryStatus> {
  const persisted = await getLocalPatternDiscoveryStatus();
  if (!hasVpsScannerAgentConfig()) {
    return persisted;
  }

  try {
    const remote = await callVpsScannerAgent<VpsScannerAgentStatus>(
      "pattern-discovery/status",
    );
    if (remote.running) {
      return mergeRunningVpsStatus(persisted, remote);
    }

    // VPS is authoritative when configured. Do not let an old local PID/log
    // make the UI report a live discovery after the remote service stopped.
    return mergeStoppedVpsStatus(persisted, remote);
  } catch {
    // Older agents do not expose Dates Scanner yet. Keep saved Supabase results available.
    return persisted;
  }
}
