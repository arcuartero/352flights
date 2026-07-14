"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  {
    href: "/ops",
    label: "Review board",
  },
  {
    href: "/ops/prices",
    label: "Price intelligence",
  },
  {
    href: "/ops/scanner-live",
    label: "Price Scanner",
  },
  {
    href: "/ops/dates-scanner",
    label: "Dates Scanner",
  },
  {
    href: "/ops/email-campaigns",
    label: "Email Campaigns",
  },
  {
    href: "/ops/active-routes",
    label: "Active Routes",
  },
  {
    href: "/ops/destinations",
    label: "Destination photos",
  },
];

export function OpsSubnav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Ops sections" className="ops-subnav">
      {links.map((link) => {
        const isActive = pathname === link.href;

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={`ops-subnav__link ${isActive ? "is-active" : ""}`}
            href={link.href}
            key={link.href}
            prefetch={false}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
