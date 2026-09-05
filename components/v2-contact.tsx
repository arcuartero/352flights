import { Mail } from "lucide-react";
import Link from "next/link";

import { ContactForm } from "@/components/contact-form";
import { LanguageSelector } from "@/components/language-selector";
import { V2AlertsButton } from "@/components/v2-alerts";
import { V2Footer } from "@/components/v2-footer";
import { contactCopy } from "@/lib/contact-localization";
import { getLocalizedHomePath, type Locale } from "@/lib/locales";

function EmailOption({
  locale,
  placement,
}: {
  locale: Locale;
  placement: "desktop" | "mobile";
}) {
  const copy = contactCopy[locale];

  return (
    <div className={`v2-contact__email-option v2-contact__email-option--${placement}`}>
      <span className="v2-contact__email-icon" aria-hidden="true">
        <Mail strokeWidth={1.8} />
      </span>
      <span className="v2-contact__email-copy">
        <a className="v2-contact__email" href="mailto:info@352flights.com">
          info@352flights.com
        </a>
        <small>{copy.responseTime}</small>
      </span>
    </div>
  );
}

export function V2Contact({ locale }: { locale: Locale }) {
  const copy = contactCopy[locale];
  const homePath = getLocalizedHomePath(locale);

  return (
    <div className="v2 v2-contact">
      <header className="v2-topbar">
        <Link className="v2-topbar__brand" href={homePath} aria-label="352 Flights">
          <img src="/v2-logo.png" alt="352 Flights" />
        </Link>
        <div className="v2-topbar__actions">
          <LanguageSelector />
          <V2AlertsButton />
        </div>
      </header>

      <main className="v2-contact__main">
        <section className="v2-contact__intro" aria-labelledby="contact-title">
          <p className="v2-eyebrow">{copy.eyebrow}</p>
          <h1 id="contact-title">{copy.title}</h1>
          <p className="v2-contact__lede">{copy.intro}</p>
          <EmailOption locale={locale} placement="desktop" />
        </section>

        <section className="v2-contact__panel" aria-label={copy.formTitle}>
          <ContactForm locale={locale} />
        </section>
        <EmailOption locale={locale} placement="mobile" />
      </main>

      <V2Footer />
    </div>
  );
}
