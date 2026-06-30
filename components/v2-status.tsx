import Link from "next/link";
import { Heart } from "lucide-react";
import type { ReactNode } from "react";

import { LanguageSelector } from "@/components/language-selector";

type V2StatusNote = {
  label: string;
  value: string;
};

type V2StatusAction = {
  href: string;
  label: string;
  variant?: "primary" | "ghost";
};

type V2StatusProps = {
  eyebrow: string;
  title: string;
  body: ReactNode;
  tone?: "default" | "success" | "error";
  notes?: V2StatusNote[];
  actions?: V2StatusAction[];
};

export function V2Status({
  eyebrow,
  title,
  body,
  tone = "default",
  notes,
  actions,
}: V2StatusProps) {
  return (
    <div className="v2 v2-status">
      <header className="v2-topbar">
        <Link className="v2-topbar__brand" href="/" aria-label="352 Flights">
          <img src="/v2-logo.png" alt="352 Flights" />
        </Link>
        <div className="v2-topbar__actions">
          <LanguageSelector />
          <Link className="v2-topbar__cta" href="/">
            Back to home
          </Link>
        </div>
      </header>

      <main className="v2-status__main">
        <div className={`v2-status__card v2-status__card--${tone}`}>
          <span className={`v2-status__badge v2-status__badge--${tone}`} aria-hidden="true" />
          <p className="v2-eyebrow">{eyebrow}</p>
          <h1 className="v2-status__title">{title}</h1>
          <div className="v2-status__body">{body}</div>

          {notes && notes.length > 0 ? (
            <ul className="v2-status__notes">
              {notes.map((note) => (
                <li key={note.label}>
                  <span>{note.label}</span>
                  <strong>{note.value}</strong>
                </li>
              ))}
            </ul>
          ) : null}

          {actions && actions.length > 0 ? (
            <div className="v2-status__actions">
              {actions.map((action) => (
                <Link
                  className={`v2-status__action v2-status__action--${action.variant ?? "primary"}`}
                  href={action.href}
                  key={action.href + action.label}
                >
                  {action.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </main>

      <footer className="v2-footer v2-status__footer">
        <span className="v2-footer__brand">
          +352 Flights <span aria-hidden="true">|</span> © 2026
        </span>
        <nav aria-label="Legal">
          <Link href="/privacy">Privacy</Link>
          <Link href="/cookies">Cookies</Link>
          <Link href="/terms">Terms</Link>
        </nav>
        <span className="v2-footer__made">
          Made with
          <Heart className="v2-footer__heart" fill="currentColor" strokeWidth={0} aria-hidden="true" />
          in Luxembourg
        </span>
      </footer>
    </div>
  );
}
