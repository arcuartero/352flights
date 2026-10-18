"use client";

import { createOpsPoller, type PollResult } from "@/lib/ops-polling";

let poller: ReturnType<typeof createOpsPoller> | undefined;
function getPoller() {
  if (poller) return poller;
  poller = createOpsPoller({
    available: () => !document.hidden && navigator.onLine,
    now: Date.now,
    schedule: (callback, delay) => setTimeout(callback, delay),
    cancel: (timer) => clearTimeout(timer),
    fetch: async (resources, signal) => {
      const query = new URLSearchParams({ resources: resources.join(",") });
      const response = await fetch(`/api/ops/status?${query}`, { cache: "no-store", signal });
      if (!response.ok) throw new Error("Status unavailable");
      return response.json() as Promise<Record<string, PollResult>>;
    },
  });
  const changed = () => poller?.availabilityChanged();
  document.addEventListener("visibilitychange", changed);
  window.addEventListener("online", changed);
  window.addEventListener("offline", changed);
  return poller;
}

export function refreshOpsPolling() {
  getPoller().refresh();
}

/** Subscribe only while the rendered widget intersects the viewport. */
export function subscribeOpsPolling(
  endpoint: string,
  consume: (response: Response) => void | Promise<void>,
  element: Element | null,
) {
  const shared = getPoller();
  const key = endpoint.replace(/^\/api\/ops\//, "");
  let unsubscribe: (() => void) | undefined;
  let disposed = false;
  const listener = ({ status, body }: PollResult) => {
    if (!disposed && unsubscribe && !document.hidden && navigator.onLine) return consume(new Response(JSON.stringify(body), { status }));
  };
  function setVisible(visible: boolean) {
    if (visible && !unsubscribe) unsubscribe = shared.subscribe(key, listener);
    else if (!visible && unsubscribe) { unsubscribe(); unsubscribe = undefined; }
  }
  const observer = element ? new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting)) : null;
  if (element) observer?.observe(element);
  // Consumers without an element are explicit controls, not hidden widgets.
  else setVisible(true);
  return () => { disposed = true; observer?.disconnect(); unsubscribe?.(); };
}
