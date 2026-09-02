import { Suspense } from "react";

import { GlobalFlightRouteLoader } from "@/components/flight-route-loader";
import { ScrollToTopButton } from "@/components/scroll-to-top-button";
import { SiteChrome } from "@/components/site-chrome";
import { WebActivityLog } from "@/components/web-activity-log";
import { LanguageProvider } from "@/lib/i18n";
import { htmlLangTags, type Locale } from "@/lib/locales";

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

export function RootDocument({
  children,
  locale,
}: Readonly<{
  children: React.ReactNode;
  locale: Locale;
}>) {
  return (
    <html
      data-locale={locale}
      data-theme="dark"
      lang={htmlLangTags[locale]}
      suppressHydrationWarning
    >
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <LanguageProvider initialLocale={locale}>
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
