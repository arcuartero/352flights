"use client";

import Link from "next/link";

import { LanguageSelector } from "@/components/language-selector";
import { useI18n } from "@/lib/i18n";

export function PreferencesTopbarActions() {
  const { t } = useI18n();

  return (
    <div className="v2-topbar__actions">
      <LanguageSelector />
      <Link className="v2-topbar__cta" href="/">
        {t("common.home")}
      </Link>
    </div>
  );
}
