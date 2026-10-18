/** One private, batched request per tab; never persisted in browser storage. */
export const OPS_IDLE_POLL_MS = 60_000;
export const OPS_ACTIVE_POLL_MS = 7_500;
export type PollResult = { status: number; body: unknown };
type Listener = (result: PollResult) => void | Promise<void>;
export type PollEnvironment = {
  available: () => boolean;
  now: () => number;
  schedule: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancel: (timer: ReturnType<typeof setTimeout>) => void;
  fetch: (resources: string[], signal: AbortSignal) => Promise<Record<string, PollResult>>;
};

export function hasActiveScan(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const value = body as { running?: boolean; pendingAction?: unknown; runs?: { status: string }[] };
  return value.running === true || Boolean(value.pendingAction) ||
    Boolean(value.runs?.some((run) => run.status === "running"));
}

export function createOpsPoller(env: PollEnvironment) {
  const listeners = new Map<string, Set<Listener>>();
  const cache = new Map<string, { result: PollResult; at: number }>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let refreshRequested = false;

  function stopTimer() {
    if (timer !== undefined) env.cancel(timer);
    timer = undefined;
  }
  function interval() {
    return [...listeners.keys()].some((key) => hasActiveScan(cache.get(key)?.result.body))
      ? OPS_ACTIVE_POLL_MS : OPS_IDLE_POLL_MS;
  }
  function schedule(delay: number) {
    stopTimer();
    if (listeners.size && env.available()) timer = env.schedule(() => { void poll(); }, delay);
  }
  function deliver(listener: Listener, result: PollResult) {
    // A failing/unmounted consumer must not break the other widgets.
    void Promise.resolve().then(() => listener(result)).catch(() => {});
  }
  async function poll() {
    stopTimer();
    if (controller || !env.available() || !listeners.size) return;
    const activeController = new AbortController();
    controller = activeController;
    const resources = [...listeners.keys()].sort();
    const timeout = env.schedule(() => activeController.abort(), 25_000);
    try {
      const results = await env.fetch(resources, activeController.signal);
      if (!activeController.signal.aborted) {
        for (const key of resources) {
          const result = results[key];
          if (!result) continue;
          cache.set(key, { result, at: env.now() });
          for (const listener of listeners.get(key) ?? []) deliver(listener, result);
        }
      }
    } catch {
      // Keep the last response on transient network failures; retry at the normal cadence.
    } finally {
      env.cancel(timeout);
      controller = undefined;
      schedule(refreshRequested ? 100 : interval());
      refreshRequested = false;
    }
  }
  return {
    subscribe(key: string, listener: Listener) {
      const group = listeners.get(key) ?? new Set<Listener>();
      group.add(listener);
      listeners.set(key, group);
      const existing = cache.get(key);
      if (existing) deliver(listener, existing.result);
      if (!existing || env.now() - existing.at >= interval()) {
        if (controller) refreshRequested = true;
        else schedule(100); // batch subscriptions mounted in the same React commit
      } else if (timer === undefined && !controller) {
        schedule(Math.max(100, interval() - (env.now() - existing.at)));
      }
      return () => {
        group.delete(listener);
        if (!group.size) listeners.delete(key);
        if (!listeners.size) {
          stopTimer();
          controller?.abort();
        }
      };
    },
    refresh() {
      if (controller) refreshRequested = true;
      else schedule(100);
    },
    availabilityChanged() {
      stopTimer();
      if (!env.available()) controller?.abort();
      else if (controller) refreshRequested = true;
      else schedule(100);
    },
  };
}
