import type { Metadata } from "next";

import { ScrollToTopButton } from "@/components/scroll-to-top-button";
import { SiteChrome } from "@/components/site-chrome";
import { WebActivityLog } from "@/components/web-activity-log";
import { LanguageProvider } from "@/lib/i18n";

import "./globals.css";

export const metadata: Metadata = {
  title: "+352 Flights",
  description:
    "A Luxembourg-first cheap flight newsletter powered by route scanning, historical pricing, and editorial deal selection.",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html data-theme="dark" lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <LanguageProvider>
          <SiteChrome />
          {children}
          <WebActivityLog />
          <ScrollToTopButton />
        </LanguageProvider>
      </body>
    </html>
  );
}
