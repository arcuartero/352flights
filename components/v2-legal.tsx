import Link from "next/link";
import { Heart } from "lucide-react";
import type { ReactNode } from "react";

import { LanguageSelector } from "@/components/language-selector";

type V2LegalProps = {
  title: string;
  intro: string;
  children: ReactNode;
};

export function V2Legal({ title, intro, children }: V2LegalProps) {
  return (
    <div className="v2 v2-legal">
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

      <main className="v2-legal__main">
        <p className="v2-eyebrow">Legal</p>
        <h1 className="v2-legal__title">{title}</h1>
        <p className="v2-legal__intro">{intro}</p>
        <div className="v2-legal__content">{children}</div>
      </main>

      <footer className="v2-footer v2-legal__footer">
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
