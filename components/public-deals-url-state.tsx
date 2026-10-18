"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

/** Only this zero-UI boundary reads the URL; the offers and SEO remain server-rendered. */
export function PublicDealsUrlState({ onChange }: { onChange: (query: string) => void }) {
  const params = useSearchParams();
  const query = params.toString();
  useEffect(() => { onChange(query); }, [onChange, query]);
  return null;
}
