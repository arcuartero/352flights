import { V2Legal } from "@/components/v2-legal";

import "../home.css";

export default function PrivacyPage() {
  return (
    <V2Legal
      title="Privacy policy"
      intro="+352 Flights uses subscriber preferences, fare data, and essential technical logs to run the service, personalize alerts, and keep the product reliable."
    >
      <h2>What we store</h2>
      <p>
        We store the preferences you choose, the routes and fare combinations surfaced by the
        scanner, and minimal technical information needed to operate the product.
      </p>
      <h2>Why we store it</h2>
      <p>
        This information is used to send relevant fare emails, improve matching, and monitor the
        health of the service.
      </p>
      <h2>Your control</h2>
      <p>
        You can update your email preferences at any time from your subscriber link, or stop all
        emails using the unsubscribe link included in every message.
      </p>
    </V2Legal>
  );
}
