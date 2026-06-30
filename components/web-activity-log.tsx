"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  getClientActivityEventName,
  type ClientActivityLogKind,
  type ClientActivityLogLevel,
  type ClientActivityLogPayload,
} from "@/lib/client-activity-log";

type ActivityLogLevel = ClientActivityLogLevel;
type ActivityLogKind = ClientActivityLogKind;

type ActivityLogEntry = {
  id: string;
  at: string;
  kind: ActivityLogKind;
  level: ActivityLogLevel;
  title: string;
  detail?: string;
  path: string;
};

const STORAGE_KEY = "luxflightdeals-web-activity-log";
const MAX_ENTRIES = 220;
const MAX_FETCH_ERROR_BODY_LENGTH = 420;
const FETCH_ERROR_DEDUP_MS = 30_000;

function buildId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatLogTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function safeSessionStorageRead() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as ActivityLogEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeSessionStorageWrite(entries: ActivityLogEntry[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Ignore quota or privacy-mode write failures.
  }
}

function normalizePath(url: string) {
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin === window.location.origin) {
      return `${parsed.pathname}${parsed.search}`;
    }

    return parsed.toString();
  } catch {
    return url;
  }
}

function normalizeText(value: string | null | undefined, fallback: string) {
  const text = value?.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 96) : fallback;
}

function trimMultilineText(value: string | null | undefined, fallback = "") {
  const text = value?.replace(/\s+/g, " ").trim();
  if (!text) {
    return fallback;
  }

  return text.length > MAX_FETCH_ERROR_BODY_LENGTH
    ? `${text.slice(0, MAX_FETCH_ERROR_BODY_LENGTH - 1)}…`
    : text;
}

function describeErrorLike(error: unknown) {
  if (error instanceof Error) {
    const stack = trimMultilineText(error.stack, "");
    return stack ? `${error.name}: ${error.message}\n${stack}` : `${error.name}: ${error.message}`;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

function isEventLikeReason(value: unknown) {
  return Boolean(
    value &&
      typeof value === "object" &&
      "isTrusted" in value &&
      typeof (value as { isTrusted?: unknown }).isTrusted === "boolean",
  );
}

function isAbortLikeError(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }

  if (error instanceof Error) {
    const normalized = `${error.name} ${error.message}`.toLowerCase();
    return normalized.includes("abort");
  }

  if (typeof error === "string") {
    return error.toLowerCase().includes("abort");
  }

  if (error && typeof error === "object") {
    const name =
      "name" in error && typeof (error as { name?: unknown }).name === "string"
        ? (error as { name: string }).name
        : "";
    const message =
      "message" in error && typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "";

    return `${name} ${message}`.toLowerCase().includes("abort");
  }

  return false;
}

function shouldIgnoreFetchUrl(url: string) {
  return url.startsWith("https://en.wikipedia.org/api/rest_v1/page/summary/");
}

function stripHtmlTags(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

async function describeFailedFetchResponse(response: Response) {
  const statusLine = `${response.status}${response.statusText ? ` ${response.statusText}` : ""}`;
  const contentType = response.headers.get("content-type") ?? "";

  try {
    const bodyText = await response.clone().text();
    if (!bodyText.trim()) {
      return statusLine;
    }

    if (contentType.includes("application/json")) {
      try {
        const payload = JSON.parse(bodyText) as Record<string, unknown>;
        const main =
          typeof payload.error === "string"
            ? payload.error
            : typeof payload.message === "string"
              ? payload.message
              : typeof payload.detail === "string"
                ? payload.detail
                : bodyText;
        const detail =
          typeof payload.detail === "string" && payload.detail !== main ? payload.detail : null;
        const stack =
          typeof payload.stack === "string" && payload.stack.trim().length > 0
            ? trimMultilineText(payload.stack)
            : null;

        return [statusLine, trimMultilineText(main), detail ? trimMultilineText(detail) : null, stack]
          .filter(Boolean)
          .join(" · ");
      } catch {
        return `${statusLine} · ${trimMultilineText(bodyText)}`;
      }
    }

    if (contentType.includes("text/html")) {
      const stripped = trimMultilineText(stripHtmlTags(bodyText), "");
      return stripped ? `${statusLine} · ${stripped}` : statusLine;
    }

    return `${statusLine} · ${trimMultilineText(bodyText)}`;
  } catch (error) {
    return `${statusLine} · Could not read error body (${error instanceof Error ? error.message : "unknown error"})`;
  }
}

function describeTarget(element: Element) {
  if (element instanceof HTMLAnchorElement) {
    return `Link: ${normalizeText(element.textContent, normalizePath(element.href))}`;
  }

  if (element instanceof HTMLButtonElement) {
    return `Button: ${normalizeText(
      element.textContent ?? element.getAttribute("aria-label"),
      "Unnamed button",
    )}`;
  }

  if (element instanceof HTMLInputElement) {
    const label =
      element.getAttribute("aria-label") ||
      element.name ||
      element.placeholder ||
      element.type ||
      "input";
    return `Input: ${normalizeText(label, "input")}`;
  }

  if (element instanceof HTMLSelectElement) {
    const label =
      element.getAttribute("aria-label") ||
      element.name ||
      element.id ||
      "select";
    return `Select: ${normalizeText(label, "select")}`;
  }

  if (element instanceof HTMLTextAreaElement) {
    const label =
      element.getAttribute("aria-label") ||
      element.name ||
      element.placeholder ||
      "textarea";
    return `Textarea: ${normalizeText(label, "textarea")}`;
  }

  if (element instanceof HTMLElement && element.getAttribute("role") === "button") {
    return `Action: ${normalizeText(
      element.textContent ?? element.getAttribute("aria-label"),
      "Custom button",
    )}`;
  }

  if (element instanceof HTMLElement && element.tagName === "SUMMARY") {
    return `Toggle: ${normalizeText(element.textContent, "Details toggle")}`;
  }

  return normalizeText(element.textContent, element.tagName.toLowerCase());
}

function describeChangeTarget(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) {
  const label =
    element.getAttribute("aria-label") ??
    element.getAttribute("name") ??
    element.getAttribute("id") ??
    element.getAttribute("placeholder") ??
    element.tagName.toLowerCase();

  if (element instanceof HTMLSelectElement) {
    const selected = element.selectedOptions.item(0)?.textContent ?? element.value;
    return `${normalizeText(label, "select")} -> ${normalizeText(selected, "value")}`;
  }

  if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
    return `${normalizeText(label, element.type)} -> ${element.checked ? "checked" : "unchecked"}`;
  }

  const length = element.value.length;
  return `${normalizeText(label, "field")} updated (${length} chars)`;
}

function isTrackedElement(target: EventTarget | null): target is Element {
  return target instanceof Element;
}

function shouldIgnoreTarget(target: Element) {
  return Boolean(target.closest("[data-web-activity-log-root]"));
}

function isReactServerActionSentinel(action: string) {
  return action.startsWith(
    "javascript:throw new Error('A React form was unexpectedly submitted.",
  );
}

export function WebActivityLog() {
  const pathname = usePathname();
  const isVisibleOnPath = pathname.startsWith("/ops");
  const [isOpen, setIsOpen] = useState(false);
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const hasHydratedRef = useRef(false);
  const lastRouteRef = useRef("");
  const recentFetchFailuresRef = useRef(new Map<string, number>());

  function pushEntry(entry: Omit<ActivityLogEntry, "id" | "at">) {
    setEntries((current) => {
      const next = [
        {
          id: buildId(),
          at: new Date().toISOString(),
          ...entry,
        },
        ...current,
      ].slice(0, MAX_ENTRIES);
      safeSessionStorageWrite(next);
      return next;
    });
  }

  useEffect(() => {
    if (hasHydratedRef.current) {
      return;
    }

    hasHydratedRef.current = true;
    setEntries(safeSessionStorageRead());
  }, []);

  useEffect(() => {
    if (!isVisibleOnPath) {
      return;
    }

    const route =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : pathname;

    if (lastRouteRef.current === route) {
      return;
    }

    lastRouteRef.current = route;
    pushEntry({
      kind: "route",
      level: "info",
      title: "Route changed",
      detail: route,
      path: route,
    });
  }, [isVisibleOnPath, pathname]);

  useEffect(() => {
    if (!isVisibleOnPath) {
      return;
    }

    function handleClick(event: MouseEvent) {
      if (!isTrackedElement(event.target) || shouldIgnoreTarget(event.target)) {
        return;
      }

      const interactive = event.target.closest(
        'a, button, summary, [role="button"], input, select, textarea',
      );

      if (!interactive || shouldIgnoreTarget(interactive)) {
        return;
      }

      pushEntry({
        kind: "click",
        level: "info",
        title: describeTarget(interactive),
        detail: "Click",
        path: `${window.location.pathname}${window.location.search}`,
      });
    }

    function handleSubmit(event: SubmitEvent) {
      if (!isTrackedElement(event.target) || shouldIgnoreTarget(event.target)) {
        return;
      }

      const form = event.target.closest("form");
      if (!form) {
        return;
      }

      const action = form.getAttribute("action") || window.location.pathname;
      const method = (form.getAttribute("method") || "GET").toUpperCase();
      const submitter =
        event.submitter && isTrackedElement(event.submitter) ? event.submitter : null;

      if (isReactServerActionSentinel(action)) {
        pushEntry({
          kind: "submit",
          level: "info",
          title: "Server action submit",
          detail: submitter ? describeTarget(submitter) : "React server action",
          path: `${window.location.pathname}${window.location.search}`,
        });
        return;
      }

      pushEntry({
        kind: "submit",
        level: "warning",
        title: `Form submit: ${method}`,
        detail: normalizePath(action),
        path: `${window.location.pathname}${window.location.search}`,
      });
    }

    function handleChange(event: Event) {
      if (!isTrackedElement(event.target) || shouldIgnoreTarget(event.target)) {
        return;
      }

      if (
        !(
          event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLSelectElement ||
          event.target instanceof HTMLTextAreaElement
        )
      ) {
        return;
      }

      pushEntry({
        kind: "change",
        level: "info",
        title: "Field changed",
        detail: describeChangeTarget(event.target),
        path: `${window.location.pathname}${window.location.search}`,
      });
    }

    function handleWindowError(event: ErrorEvent) {
      const location =
        event.filename || event.lineno || event.colno
          ? [event.filename || "unknown source", event.lineno, event.colno]
              .filter(Boolean)
              .join(":")
          : null;
      const stack = event.error ? describeErrorLike(event.error) : null;

      pushEntry({
        kind: "error",
        level: "error",
        title: "JavaScript error",
        detail: [event.message || "Unknown browser error", location, stack]
          .filter(Boolean)
          .join("\n"),
        path: `${window.location.pathname}${window.location.search}`,
      });
    }

    function handleUnhandledRejection(event: PromiseRejectionEvent) {
      if (isAbortLikeError(event.reason) || isEventLikeReason(event.reason)) {
        return;
      }

      const detail = describeErrorLike(event.reason);

      pushEntry({
        kind: "error",
        level: "error",
        title: "Unhandled promise rejection",
        detail,
        path: `${window.location.pathname}${window.location.search}`,
      });
    }

    function handleClientActivity(event: Event) {
      if (!(event instanceof CustomEvent)) {
        return;
      }

      const detail = event.detail as ClientActivityLogPayload | undefined;
      if (!detail) {
        return;
      }

      pushEntry({
        kind: detail.kind,
        level: detail.level,
        title: detail.title,
        detail: detail.detail,
        path: detail.path ?? `${window.location.pathname}${window.location.search}`,
      });
    }

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (
        init?.method ??
        (input instanceof Request ? input.method : "GET")
      ).toUpperCase();
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const normalizedUrl = normalizePath(url);
      const startedAt = performance.now();

      try {
        const response = await originalFetch(input, init);
        if (!response.ok) {
          const duration = Math.round(performance.now() - startedAt);
          const responseDetail = await describeFailedFetchResponse(response);
          const signature = `${method}:${normalizedUrl}:${response.status}:${responseDetail}`;
          const lastLoggedAt = recentFetchFailuresRef.current.get(signature) ?? 0;
          const now = Date.now();
          if (now - lastLoggedAt < FETCH_ERROR_DEDUP_MS) {
            return response;
          }
          recentFetchFailuresRef.current.set(signature, now);
          pushEntry({
            kind: "fetch",
            level: "error",
            title: `${method} failed (${response.status})`,
            detail: `${normalizedUrl} · ${duration}ms\n${responseDetail}`,
            path: `${window.location.pathname}${window.location.search}`,
          });
        }
        return response;
      } catch (error) {
        if (shouldIgnoreFetchUrl(url) || isAbortLikeError(error)) {
          throw error;
        }

        const duration = Math.round(performance.now() - startedAt);
        const detail = `${normalizedUrl} · ${duration}ms · ${
          error instanceof Error ? error.message : "Unknown fetch error"
        }`;
        const signature = `${method}:${normalizedUrl}:crashed:${detail}`;
        const lastLoggedAt = recentFetchFailuresRef.current.get(signature) ?? 0;
        const now = Date.now();
        if (now - lastLoggedAt >= FETCH_ERROR_DEDUP_MS) {
          recentFetchFailuresRef.current.set(signature, now);
          pushEntry({
            kind: "fetch",
            level: "error",
            title: `${method} request crashed`,
            detail,
            path: `${window.location.pathname}${window.location.search}`,
          });
        }
        throw error;
      }
    };

    document.addEventListener("click", handleClick, true);
    document.addEventListener("submit", handleSubmit, true);
    document.addEventListener("change", handleChange, true);
    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener(getClientActivityEventName(), handleClientActivity as EventListener);

    return () => {
      window.fetch = originalFetch;
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("submit", handleSubmit, true);
      document.removeEventListener("change", handleChange, true);
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
      window.removeEventListener(getClientActivityEventName(), handleClientActivity as EventListener);
    };
  }, [isVisibleOnPath]);

  const errorCount = entries.filter((entry) => entry.level === "error").length;

  async function handleCopy() {
    const payload = entries
      .slice()
      .reverse()
      .map((entry) => {
        const detail = entry.detail ? `\n  ${entry.detail}` : "";
        return `[${entry.at}] ${entry.kind.toUpperCase()} · ${entry.title}\n  ${entry.path}${detail}`;
      })
      .join("\n\n");

    try {
      await navigator.clipboard.writeText(payload || "No web activity logs captured yet.");
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }

    window.setTimeout(() => {
      setCopyState("idle");
    }, 1600);
  }

  function handleClear() {
    setEntries([]);
    safeSessionStorageWrite([]);
  }

  if (!isVisibleOnPath) {
    return null;
  }

  return (
    <div
      className={`web-activity-log ${isOpen ? "is-open" : ""}`}
      data-web-activity-log-root
    >
      <button
        aria-expanded={isOpen}
        className="web-activity-log__toggle"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span className="web-activity-log__toggle-label">Activity log</span>
        <span className="web-activity-log__toggle-count">
          {entries.length} events{errorCount > 0 ? ` · ${errorCount} errors` : ""}
        </span>
      </button>

      {isOpen ? (
        <div className="web-activity-log__panel">
          <div className="web-activity-log__header">
            <div>
              <p className="web-activity-log__eyebrow">Visible debug panel</p>
              <h2>Clicks, actions, and failures</h2>
            </div>
            <div className="web-activity-log__actions">
              <button onClick={handleCopy} type="button">
                {copyState === "idle" && "Copy logs"}
                {copyState === "copied" && "Copied"}
                {copyState === "failed" && "Copy failed"}
              </button>
              <button onClick={handleClear} type="button">
                Clear
              </button>
            </div>
          </div>

          <div className="web-activity-log__list" role="log" aria-live="polite">
            {entries.length === 0 ? (
              <p className="web-activity-log__empty">
                No browser activity captured yet. As soon as you click around or something fails,
                it will show up here.
              </p>
            ) : null}

            {entries.map((entry) => (
              <article
                className={`web-activity-log__entry web-activity-log__entry--${entry.level}`}
                key={entry.id}
              >
                <div className="web-activity-log__entry-top">
                  <span>{formatLogTime(entry.at)}</span>
                  <strong>{entry.kind.replace("-", " ")}</strong>
                </div>
                <p className="web-activity-log__title">{entry.title}</p>
                {entry.detail ? <p className="web-activity-log__detail">{entry.detail}</p> : null}
                <p className="web-activity-log__path">{entry.path}</p>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
