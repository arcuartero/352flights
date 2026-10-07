import { z } from "zod";
import { V2Status } from "@/components/v2-status";
import { SubscriptionConfirmationForm } from "@/components/subscription-confirmation-form";

export const dynamic = "force-dynamic";

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = z
    .string()
    .uuid()
    .safeParse((await searchParams).token);
  return (
    <V2Status
      eyebrow="Unsubscribe"
      title={
        token.success
          ? "Unsubscribe from flight emails?"
          : "This link is incomplete or invalid."
      }
      tone={token.success ? "default" : "error"}
      body={
        token.success ? (
          <>
            <p>
              Click below to stop daily digests, weekly roundups and flash
              alerts.
            </p>
            <SubscriptionConfirmationForm
              token={token.data}
              kind="unsubscribe"
            />
          </>
        ) : (
          <p>Open the latest link in your email or return to the homepage.</p>
        )
      }
      actions={[{ href: "/", label: "Back to homepage", variant: "ghost" }]}
    />
  );
}
