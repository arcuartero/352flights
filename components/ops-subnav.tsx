"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarSearch,
  ChartNoAxesCombined,
  FileJson2,
  Images,
  LayoutDashboard,
  Mail,
  Radar,
  Route,
} from "lucide-react";

const links = [
  {
    href: "/ops",
    label: "Review board",
    icon: LayoutDashboard,
  },
  {
    href: "/ops/prices",
    label: "Price intelligence",
    icon: ChartNoAxesCombined,
  },
  {
    href: "/ops/scanner-live",
    label: "Price Scanner",
    icon: Radar,
  },
  {
    href: "/ops/dates-scanner",
    label: "Dates Scanner",
    icon: CalendarSearch,
  },
  {
    href: "/ops/email-campaigns",
    label: "Email Campaigns",
    icon: Mail,
  },
  {
    href: "/ops/tiktok-json",
    label: "TikTok JSON",
    icon: FileJson2,
  },
  {
    href: "/ops/active-routes",
    label: "Active Routes",
    icon: Route,
  },
  {
    href: "/ops/destinations",
    label: "Destination photos",
    icon: Images,
  },
];

const pageCopy: Record<string, { eyebrow: string; title: string; description: string }> = {
  "/ops": {
    eyebrow: "Operations overview",
    title: "Review board",
    description: "Monitor deal quality, audience health and the signals powering 352 Flights.",
  },
  "/ops/prices": {
    eyebrow: "Fare intelligence",
    title: "Price intelligence",
    description: "Read the price history behind every public deal and spot meaningful movements.",
  },
  "/ops/scanner-live": {
    eyebrow: "Live operations",
    title: "Price scanner",
    description: "Follow each scan from launch to the final verified snapshot.",
  },
  "/ops/dates-scanner": {
    eyebrow: "Schedule discovery",
    title: "Dates scanner",
    description: "Track route patterns and the date pairs feeding the price scanner.",
  },
  "/ops/email-campaigns": {
    eyebrow: "Audience delivery",
    title: "Email campaigns",
    description: "Preview, test and release the same offers subscribers receive.",
  },
  "/ops/tiktok-json": {
    eyebrow: "Social publishing",
    title: "TikTok JSON",
    description: "Turn verified deals into ready-to-publish social content.",
  },
  "/ops/active-routes": {
    eyebrow: "Network coverage",
    title: "Active routes",
    description: "Shape the destinations and travel patterns available to customers.",
  },
  "/ops/destinations": {
    eyebrow: "Visual library",
    title: "Destination photos",
    description: "Manage the imagery customers see across destination and deal cards.",
  },
};

export function OpsSubnav() {
  const pathname = usePathname();
  const copy = pageCopy[pathname] ?? pageCopy["/ops"];

  return (
    <header className="ops-page-header">
      <div className="ops-page-header__copy">
        <p className="ops-page-header__eyebrow">{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <p>{copy.description}</p>
      </div>

      <nav aria-label="Ops sections" className="ops-subnav">
        {links.map((link) => {
          const isActive = pathname === link.href;
          const Icon = link.icon;

          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              className={`ops-subnav__link ${isActive ? "is-active" : ""}`}
              href={link.href}
              key={link.href}
              prefetch={false}
            >
              <Icon aria-hidden="true" size={16} strokeWidth={1.9} />
              <span>{link.label}</span>
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
