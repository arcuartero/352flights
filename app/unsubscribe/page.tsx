import { V2Status } from "@/components/v2-status";
import { unsubscribeSubscriberByToken } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

type UnsubscribePageProps = {
  searchParams: Promise<{
    token?: string;
  }>;
};

export default async function UnsubscribePage({ searchParams }: UnsubscribePageProps) {
  const params = await searchParams;
  const token = params.token;

  if (!token) {
    return (
      <V2Status
        tone="error"
        eyebrow="Unsubscribe"
        title="That unsubscribe link is incomplete."
        body={
          <p>Open the latest email footer again, or go back to the homepage to subscribe later.</p>
        }
        actions={[{ href: "/", label: "Back to homepage", variant: "primary" }]}
      />
    );
  }

  try {
    const result = await unsubscribeSubscriberByToken(token);

    return (
      <V2Status
        eyebrow="Unsubscribe"
        title={
          result.alreadyUnsubscribed
            ? "This address was already unsubscribed."
            : "You have been unsubscribed from +352 Flights."
        }
        body={
          <p>
            {result.email} will stop receiving digests and flash alerts. You can still reopen your
            preferences if you want to rejoin later.
          </p>
        }
        actions={[
          { href: result.preferencePath, label: "View preferences link", variant: "ghost" },
          { href: "/", label: "Return to homepage", variant: "primary" },
        ]}
      />
    );
  } catch (error) {
    return (
      <V2Status
        tone="error"
        eyebrow="Unsubscribe"
        title="We could not process that unsubscribe link."
        body={
          <p>
            {error instanceof Error
              ? error.message
              : "Try the latest email footer or contact the site operator."}
          </p>
        }
        actions={[{ href: "/", label: "Back to homepage", variant: "primary" }]}
      />
    );
  }
}
