import { redirect } from "next/navigation";

import { V2Status } from "@/components/v2-status";
import { confirmSubscriberByToken } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

type ConfirmPageProps = {
  searchParams: Promise<{
    token?: string;
  }>;
};

export default async function ConfirmPage({ searchParams }: ConfirmPageProps) {
  const params = await searchParams;
  const token = params.token;

  if (!token) {
    return (
      <V2Status
        tone="error"
        eyebrow="Confirmation"
        title="That confirmation link is missing a token."
        body={<p>Go back to the homepage and subscribe again to generate a fresh email.</p>}
        actions={[{ href: "/", label: "Back to homepage", variant: "primary" }]}
      />
    );
  }

  try {
    const result = await confirmSubscriberByToken(token);

    if (result.status === "unsubscribed") {
      return (
        <V2Status
          eyebrow="Subscription confirmed"
          title="This address is currently unsubscribed."
          body={<p>{`If you want back in for ${result.email}, subscribe again from the homepage.`}</p>}
          notes={[
            { label: "Status", value: result.status },
            { label: "Profile", value: result.onboardingCompleted ? "Saved" : "Needs setup" },
          ]}
          actions={[{ href: "/", label: "Back to homepage", variant: "ghost" }]}
        />
      );
    }

    if (result.status === "active") {
      redirect(result.preferencePath);
    }

    return null;
  } catch (error) {
    return (
      <V2Status
        tone="error"
        eyebrow="Confirmation"
        title="We could not confirm that email right now."
        body={
          <p>
            {error instanceof Error
              ? error.message
              : "Try opening the latest email from +352 Flights or subscribe again."}
          </p>
        }
        actions={[{ href: "/", label: "Back to homepage", variant: "primary" }]}
      />
    );
  }
}
