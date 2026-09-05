import { Mail } from "lucide-react";
import Link from "next/link";

import { ContactForm } from "@/components/contact-form";
import { LanguageSelector } from "@/components/language-selector";
import { V2Footer } from "@/components/v2-footer";
import { contactCopy } from "@/lib/contact-localization";
import { getLocalizedLegalPath } from "@/lib/legal-localization";
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
      <a className="v2-contact__email" href="mailto:info@352flights.com">
        <span className="v2-contact__email-icon" aria-hidden="true">
          <Mail strokeWidth={1.8} />
        </span>
        <span>
          <small>{copy.emailPrompt}</small>
          <strong>info@352flights.com</strong>
        </span>
      </a>
      <p className="v2-contact__response-time">{copy.responseTime}</p>
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
          <Link className="v2-topbar__cta" href={homePath}>{copy.backHome}</Link>
        </div>
      </header>

      <main className="v2-contact__main">
        <section className="v2-contact__intro">
          <p className="v2-eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p className="v2-contact__lede">{copy.intro}</p>
          <EmailOption locale={locale} placement="desktop" />
        </section>

        <section className="v2-contact__panel" aria-labelledby="contact-form-title">
          <h2 id="contact-form-title">{copy.formTitle}</h2>
          <ContactForm locale={locale} />
          <p className="v2-contact__privacy">
            {copy.privacyPrefix}{" "}
            <Link href={getLocalizedLegalPath(locale, "privacy")}>{copy.privacyLink}</Link>.
          </p>
        </section>
        <EmailOption locale={locale} placement="mobile" />
      </main>

      <V2Footer />
    </div>
  );
}
