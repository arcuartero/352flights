import type { Metadata } from "next";

import { HomePageContent } from "@/components/home-page-content";
import { getHomeMetadata } from "@/lib/home-localization";

import "./home.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = getHomeMetadata("en");

export default async function HomePage() {
  return <HomePageContent />;
}
