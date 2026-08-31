import "server-only";

import { headers } from "next/headers";

import { isLocale, localeRequestHeader, type Locale } from "@/lib/locales";

export async function getRequestLocale(): Promise<Locale> {
  const requestHeaders = await headers();
  const locale = requestHeaders.get(localeRequestHeader);
  return isLocale(locale) ? locale : "en";
}
