import { V2Legal } from "@/components/v2-legal";

import "../home.css";

export default function TermsPage() {
  return (
    <V2Legal
      title="Terms"
      intro="+352 Flights surfaces fare opportunities from Luxembourg and groups them into useful travel patterns, but prices can change quickly and airline availability is never guaranteed."
    >
      <h2>Fare information</h2>
      <p>
        Deals are based on the best live combinations the system can still verify at the time of
        scanning. Final price and availability always depend on the booking page.
      </p>
      <h2>No travel guarantee</h2>
      <p>
        Routes, schedules, and prices may change without notice. Always double-check the final
        booking details before purchasing.
      </p>
      <h2>Use of the service</h2>
      <p>
        The product is designed to help you discover potentially strong fares faster, not to
        replace the final booking confirmation from airlines or travel platforms.
      </p>
    </V2Legal>
  );
}
