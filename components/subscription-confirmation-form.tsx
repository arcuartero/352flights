"use client";

import { useActionState } from "react";
import {
  confirmSubscription,
  unsubscribeSubscription,
  type SubscriptionActionState,
} from "@/app/subscription-actions";

export function SubscriptionConfirmationForm({
  token,
  kind,
}: {
  token: string;
  kind: "confirm" | "unsubscribe";
}) {
  const action =
    kind === "confirm" ? confirmSubscription : unsubscribeSubscription;
  const [state, formAction, pending] = useActionState<
    SubscriptionActionState,
    FormData
  >(action, {});
  if (state.completed)
    return (
      <p role="status">
        You have been unsubscribed. You will no longer receive flight emails
        from +352 Flights.
      </p>
    );
  return (
    <form action={formAction}>
      <input type="hidden" name="token" value={token} />
      {state.error ? <p role="alert">{state.error}</p> : null}
      <button
        className="v2-status__action v2-status__action--primary"
        type="submit"
        disabled={pending}
      >
        {pending
          ? "Please wait…"
          : kind === "confirm"
            ? "Confirm my email"
            : "Unsubscribe me"}
      </button>
    </form>
  );
}
