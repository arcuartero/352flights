import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase";

const MAC_AGENT_ID = "mac";
const AGENT_ONLINE_WINDOW_MS = 45_000;

export type MacScannerType = "price_scanner" | "dates_scanner";
export type MacScannerAction = "start" | "stop";

type AgentRow = {
  id: string;
  last_seen_at: string;
  price_scanner_running: boolean;
  dates_scanner_running: boolean;
  active_owner: MacScannerType | null;
  active_pid: number | null;
  metadata: Record<string, unknown> | null;
};

type CommandRow = {
  id: string;
  scanner_type: MacScannerType;
  action: MacScannerAction;
  status: "pending" | "claimed" | "completed" | "failed" | "expired";
  requested_at: string;
  claimed_at: string | null;
  completed_at: string | null;
  error: string | null;
};

export type MacScannerControlState = {
  configured: boolean;
  online: boolean;
  lastSeenAt: string | null;
  priceScannerRunning: boolean;
  datesScannerRunning: boolean;
  activeOwner: MacScannerType | null;
  activePid: number | null;
  pendingCommand: CommandRow | null;
  error: string | null;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? "Unknown error");
}

export async function getMacScannerControlState(
  scannerType: MacScannerType = "price_scanner",
): Promise<MacScannerControlState> {
  try {
    const supabase = getSupabaseAdminClient();
    const [agentQuery, commandQuery] = await Promise.all([
      supabase
        .from("scanner_control_agents")
        .select(
          "id,last_seen_at,price_scanner_running,dates_scanner_running,active_owner,active_pid,metadata",
        )
        .eq("id", MAC_AGENT_ID)
        .maybeSingle(),
      supabase
        .from("scanner_control_commands")
        .select("id,scanner_type,action,status,requested_at,claimed_at,completed_at,error")
        .eq("target_agent_id", MAC_AGENT_ID)
        .eq("scanner_type", scannerType)
        .in("status", ["pending", "claimed"])
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (agentQuery.error || commandQuery.error) {
      return {
        configured: false,
        online: false,
        lastSeenAt: null,
        priceScannerRunning: false,
        datesScannerRunning: false,
        activeOwner: null,
        activePid: null,
        pendingCommand: null,
        error: agentQuery.error?.message ?? commandQuery.error?.message ?? "Unknown error",
      };
    }

    const agent = agentQuery.data as AgentRow | null;
    const pendingCommand = commandQuery.data as CommandRow | null;
    const lastSeenMs = Date.parse(agent?.last_seen_at ?? "");

    return {
      configured: agent !== null,
      online: Number.isFinite(lastSeenMs) && Date.now() - lastSeenMs <= AGENT_ONLINE_WINDOW_MS,
      lastSeenAt: agent?.last_seen_at ?? null,
      priceScannerRunning: Boolean(agent?.price_scanner_running),
      datesScannerRunning: Boolean(agent?.dates_scanner_running),
      activeOwner: agent?.active_owner ?? null,
      activePid: agent?.active_pid ?? null,
      pendingCommand,
      error: null,
    };
  } catch (error) {
    return {
      configured: false,
      online: false,
      lastSeenAt: null,
      priceScannerRunning: false,
      datesScannerRunning: false,
      activeOwner: null,
      activePid: null,
      pendingCommand: null,
      error: errorMessage(error),
    };
  }
}

export async function enqueueMacScannerCommand(
  scannerType: MacScannerType,
  action: MacScannerAction,
  payload: Record<string, unknown> = {},
) {
  const state = await getMacScannerControlState(scannerType);
  if (!state.configured || !state.online) {
    return {
      command: null,
      state,
      error: "mac_controller_offline",
    };
  }

  if (state.pendingCommand) {
    return {
      command: state.pendingCommand,
      state,
      error: null,
    };
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("scanner_control_commands")
      .insert({
        target_agent_id: MAC_AGENT_ID,
        scanner_type: scannerType,
        action,
        payload,
      })
      .select("id,scanner_type,action,status,requested_at,claimed_at,completed_at,error")
      .single();

    if (error) {
      return { command: null, state, error: error.message };
    }

    return { command: data as CommandRow, state, error: null };
  } catch (error) {
    return { command: null, state, error: errorMessage(error) };
  }
}
