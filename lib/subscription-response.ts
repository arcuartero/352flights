export type SubscriptionApiPayload = {
  code?: string;
  error?: string;
  message?: string;
  requiresConfirmation?: boolean;
};

type SubscriptionSuccessCopy = {
  accessLinkSent: string;
  confirmationRequired: string;
  savedWithoutEmail: string;
};

type SubscriptionErrorCopy = {
  generic: string;
  invalidEmail: string;
};

export function subscriptionSuccessMessage(
  payload: SubscriptionApiPayload,
  copy: SubscriptionSuccessCopy,
) {
  if (payload.code === "access_link_sent") {
    return copy.accessLinkSent;
  }

  if (payload.code === "saved_without_email") {
    return copy.savedWithoutEmail;
  }

  return copy.confirmationRequired;
}

export function subscriptionErrorMessage(
  payload: SubscriptionApiPayload,
  copy: SubscriptionErrorCopy,
) {
  return payload.code === "invalid_email" ? copy.invalidEmail : copy.generic;
}
