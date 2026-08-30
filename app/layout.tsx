import type { Metadata } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";

import { GlobalFlightRouteLoader } from "@/components/flight-route-loader";
import { ScrollToTopButton } from "@/components/scroll-to-top-button";
import { SiteChrome } from "@/components/site-chrome";
import { WebActivityLog } from "@/components/web-activity-log";
import { getSiteUrl } from "@/lib/env";
import { LanguageProvider } from "@/lib/i18n";
import { htmlLangTags, isLocale, localeRequestHeader } from "@/lib/locales";

import "./globals.css";
import "./public-deals-date-picker.css";
import "./public-deals-price-range.css";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "You know when to fly. We'll find where. | +352 Flights",
    template: "%s | +352 Flights",
  },
  description:
    "We watch every fare out of LUX and write to you only when it's genuinely cheap. No noise — just the right deals, at the right time.",
  alternates: {
    canonical: "/",
  },
};

const themeBootScript = `
(() => {
  const storageKey = "luxflightdeals-theme";
  const root = document.documentElement;
  const stored = window.localStorage.getItem(storageKey);
  const resolved =
    stored === "light" || stored === "dark"
      ? stored
      : window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
})();
`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers();
  const requestLocale = requestHeaders.get(localeRequestHeader);
  const initialLocale = isLocale(requestLocale) ? requestLocale : "en";

  return (
    <html
      data-locale={initialLocale}
      data-theme="dark"
      lang={htmlLangTags[initialLocale]}
      suppressHydrationWarning
    >
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <LanguageProvider initialLocale={initialLocale}>
          <Suspense fallback={null}>
            <GlobalFlightRouteLoader />
          </Suspense>
          <SiteChrome />
          {children}
          <WebActivityLog />
          <ScrollToTopButton />
        </LanguageProvider>
      </body>
    </html>
  );
}
