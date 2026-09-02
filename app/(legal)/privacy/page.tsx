import type { Metadata } from "next";

import { V2Legal } from "@/components/v2-legal";
import { getLegalMetadata } from "@/lib/legal-localization";

export const metadata: Metadata = getLegalMetadata("en", "privacy");

export default function PrivacyPage() {
  return <V2Legal locale="en" page="privacy" />;
}
