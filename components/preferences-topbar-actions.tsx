"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";

import { LanguageSelector } from "@/components/language-selector";
import { useI18n, type Locale } from "@/lib/i18n";

const exitSetupCopy: Record<Locale, string> = {
  en: "Exit setup",
  fr: "Quitter la configuration",
  de: "Einrichtung verlassen",
  pt: "Sair da configuração",
  it: "Esci dalla configurazione",
  es: "Salir de la configuración",
};

export function PreferencesTopbarActions() {
  const { locale } = useI18n();

  return (
    <div className="v2-topbar__actions">
      <LanguageSelector />
      <Link className="v2-topbar__cta" href="/">
        <LogOut aria-hidden="true" size={18} />
        {exitSetupCopy[locale]}
      </Link>
    </div>
  );
}
