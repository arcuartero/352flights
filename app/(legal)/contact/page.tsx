import type { Metadata } from "next";

import { V2Contact } from "@/components/v2-contact";
import { getContactMetadata } from "@/lib/contact-localization";

export const metadata: Metadata = getContactMetadata("en");

export default function ContactPage() {
  return <V2Contact locale="en" />;
}
