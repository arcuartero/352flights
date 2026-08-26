"use client";

import { useEffect } from "react";

import { useI18n } from "@/lib/i18n";

type LocalizedPageMetadataProps = {
  title: string;
  description: string;
};

const LOCALE_TAGS = {
  en: "en_LU",
  fr: "fr_LU",
  de: "de_LU",
  pt: "pt_LU",
  it: "it_LU",
  es: "es_LU",
} as const;

function setMetaContent(selector: string, attribute: string, key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

export function LocalizedPageMetadata({ title, description }: LocalizedPageMetadataProps) {
  const { locale } = useI18n();

  useEffect(() => {
    const brandedTitle = `${title} | +352 Flights`;
    document.title = brandedTitle;
    setMetaContent('meta[name="description"]', "name", "description", description);
    setMetaContent('meta[property="og:title"]', "property", "og:title", brandedTitle);
    setMetaContent('meta[property="og:description"]', "property", "og:description", description);
    setMetaContent('meta[property="og:locale"]', "property", "og:locale", LOCALE_TAGS[locale]);
    setMetaContent('meta[name="twitter:title"]', "name", "twitter:title", brandedTitle);
    setMetaContent(
      'meta[name="twitter:description"]',
      "name",
      "twitter:description",
      description,
    );
  }, [description, locale, title]);

  return null;
}
