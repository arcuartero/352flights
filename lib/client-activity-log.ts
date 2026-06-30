"use client";

export type ClientActivityLogKind =
  | "route"
  | "click"
  | "submit"
  | "change"
  | "fetch"
  | "error"
  | "action";

export type ClientActivityLogLevel = "info" | "warning" | "error";

export type ClientActivityLogPayload = {
  kind: ClientActivityLogKind;
  level: ClientActivityLogLevel;
  title: string;
  detail?: string;
  path?: string;
};

const EVENT_NAME = "luxflightdeals:activity";

export function emitClientActivityLog(payload: ClientActivityLogPayload) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(EVENT_NAME, {
      detail: {
        ...payload,
        path: payload.path ?? `${window.location.pathname}${window.location.search}`,
      },
    }),
  );
}

export function getClientActivityEventName() {
  return EVENT_NAME;
}
