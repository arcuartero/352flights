import type { Metadata } from "next";

import { ScrollToTopButton } from "@/components/scroll-to-top-button";
import { SiteChrome } from "@/components/site-chrome";
import { WebActivityLog } from "@/components/web-activity-log";
import { getSiteUrl } from "@/lib/env";
import { LanguageProvider } from "@/lib/i18n";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "+352 Flights | Vuelos baratos desde Luxemburgo",
    template: "%s | +352 Flights",
  },
  description:
    "Compara vuelos baratos desde Luxemburgo con tarifas verificadas, historico de precios y alertas para escapadas, playas y vacaciones escolares.",
  alternates: {
    canonical: "/",
    languages: {
      "es-LU": "/",
    },
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html data-theme="dark" lang="es" suppressHydrationWarning>
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
