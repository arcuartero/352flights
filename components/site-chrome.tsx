"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ThemeToggle } from "@/components/theme-toggle";

function getPageLabel(pathname: string) {
  if (pathname.startsWith("/ops/prices")) {
    return "Price intelligence";
  }

  if (pathname.startsWith("/ops")) {
    return "Operations board";
  }

  if (pathname.startsWith("/preferences")) {
    return "Subscriber setup";
  }

  return "Luxembourg edition";
}

export function SiteChrome() {
  const pathname = usePathname();

  return (
    <div className="site-chrome">
      <Link className="site-chrome__brand" href="/">
        <span className="site-chrome__mark">LFD</span>
        <span className="site-chrome__wordmark">Lux Flight Deals</span>
      </Link>
      <p className="site-chrome__context">{getPageLabel(pathname)}</p>
      <ThemeToggle />
    </div>
  );
}
