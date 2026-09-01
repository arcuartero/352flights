import type { Metadata } from "next";

import { HomePageContent } from "@/components/home-page-content";
import { getHomeMetadata } from "@/lib/home-localization";

import "./home.css";

export const revalidate = 3600;

export const metadata: Metadata = getHomeMetadata("en");

export default async function HomePage() {
  return <HomePageContent />;
}
