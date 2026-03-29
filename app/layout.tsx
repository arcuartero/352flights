import type { Metadata } from "next";

import { SiteChrome } from "@/components/site-chrome";

import "./globals.css";

export const metadata: Metadata = {
  title: "Lux Flight Deals",
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
        <SiteChrome />
        {children}
      </body>
    </html>
  );
}
