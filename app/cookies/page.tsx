import { V2Legal } from "@/components/v2-legal";

import "../home.css";

export default function CookiesPage() {
  return (
    <V2Legal
      title="Cookies"
      intro="+352 Flights uses a small number of essential browser cookies and local storage keys to keep the interface working, remember theme settings, and preserve session-level product behavior."
    >
      <h2>Essential only</h2>
      <p>
        These cookies support core features like subscriber sessions, UI preferences, and basic
        product reliability. They are not used to build unrelated advertising profiles.
      </p>
      <h2>Preference storage</h2>
      <p>
        Some settings may also be saved locally in your browser, such as theme mode or recent UI
        state, to make the product feel consistent between visits.
      </p>
      <h2>How to manage them</h2>
      <p>
        You can clear browser storage or block cookies in your browser settings, although some
        parts of the experience may stop working correctly.
      </p>
    </V2Legal>
  );
}
