"use client";

import Link from "next/link";
import { Heart, Mailbox, Send, Tag } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { NewsletterForm } from "@/components/newsletter-form";
import { useI18n } from "@/lib/i18n";

function CountUp({ value, suffix = "", prefix = "" }: { value: number; suffix?: string; prefix?: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }

    let raf = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }
        observer.disconnect();
        const start = performance.now();
        const duration = 1400;
        function tick(now: number) {
          const t = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - t, 4);
          setDisplay(Math.round(value * eased));
          if (t < 1) {
            raf = window.requestAnimationFrame(tick);
          }
        }
        raf = window.requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      if (raf) {
        window.cancelAnimationFrame(raf);
      }
    };
  }, [value]);

  return (
    <span ref={ref}>
      {prefix}
      {display.toLocaleString("en-US")}
      {suffix}
    </span>
  );
}

export function V2BottomSections() {
  const { t } = useI18n();

  return (
    <>
      {/* ---------- Section 7 of 8 · Proof — light stats strip with icons ---------- */}
      <section className="v2-metrics" aria-label={t("bottom.metricsLabel")}>
        <dl className="v2-metrics__grid">
          <div data-reveal>
            <span className="v2-metrics__icon" aria-hidden="true">
              <Tag strokeWidth={1.7} />
            </span>
            <dd>
              <CountUp suffix="+" value={1400} />
            </dd>
            <dt>{t("bottom.faresChecked")}</dt>
          </div>
          <div data-reveal style={{ "--d": "100ms" } as React.CSSProperties}>
            <span className="v2-metrics__icon" aria-hidden="true">
              <Send strokeWidth={1.7} />
            </span>
            <dd>
              <CountUp prefix="−" suffix="%" value={38} />
            </dd>
            <dt>{t("bottom.averageDrop")}</dt>
          </div>
          <div data-reveal style={{ "--d": "200ms" } as React.CSSProperties}>
            <span className="v2-metrics__icon" aria-hidden="true">
              <Mailbox strokeWidth={1.7} />
            </span>
            <dd>€0</dd>
            <dt>{t("bottom.priceLetter")}</dt>
          </div>
          <div data-reveal style={{ "--d": "300ms" } as React.CSSProperties}>
            <span className="v2-metrics__icon" aria-hidden="true">
              <Heart strokeWidth={1.7} />
            </span>
            <dd>
              <CountUp suffix="%" value={100} />
            </dd>
            <dt>{t("bottom.handpicked")}</dt>
          </div>
        </dl>
      </section>

      {/* ---------- Section 8 of 8 · Final CTA — mini minimalist, stacked center ---------- */}
      <section className="v2-join" id="v2-join" aria-label={t("bottom.joinLabel")}>
        <p className="v2-eyebrow" data-reveal>
          {t("bottom.joinKicker")}
        </p>
        <h2 data-reveal style={{ "--d": "100ms" } as React.CSSProperties}>
          {t("bottom.joinTitle")} <em>{t("bottom.joinEm")}</em>
        </h2>
        <div className="v2-join__form" data-reveal style={{ "--d": "200ms" } as React.CSSProperties}>
          <NewsletterForm />
        </div>
        <footer className="v2-footer" data-reveal style={{ "--d": "300ms" } as React.CSSProperties}>
          <span className="v2-footer__brand">
            +352 Flights <span aria-hidden="true">|</span> © 2026
          </span>
          <nav aria-label="Legal">
            <Link href="/privacy">{t("common.privacy")}</Link>
            <Link href="/cookies">{t("common.cookies")}</Link>
            <Link href="/terms">{t("common.terms")}</Link>
          </nav>
          <span className="v2-footer__made">
            {t("bottom.madeWith")}
            <Heart className="v2-footer__heart" fill="currentColor" strokeWidth={0} aria-hidden="true" />
            {t("bottom.inLuxembourg")}
          </span>
        </footer>
      </section>
    </>
  );
}
