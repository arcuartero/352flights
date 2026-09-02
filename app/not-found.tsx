import { RootDocument } from "@/components/root-document";
import { V2NotFound } from "@/components/v2-not-found";

import "./home.css";
import "./not-found.css";

export default function NotFound() {
  return (
    <RootDocument locale="en">
      <V2NotFound />
    </RootDocument>
  );
}
