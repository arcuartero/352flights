import "server-only";
import { headers } from "next/headers";
import { isOpsAuthorized } from "@/lib/ops-auth";

export async function assertOpsAccess() {
  if (!isOpsAuthorized((await headers()).get("authorization"))) {
    throw new Error("Unauthorized ops access.");
  }
}
