import Link from "next/link";
import { Heart } from "lucide-react";

export function V2Footer() {
  return (
    <footer className="v2-footer v2-footer--standalone">
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
  );
}
