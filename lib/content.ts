import routes from "@/data/lux-routes.json";

export type SeedRoute = (typeof routes)[number];

export const sampleDeals = [
  {
    destination: "Lisbon",
    airport: "LIS",
    price: "EUR 118",
    baseline: "EUR 176",
    drop: "33%",
    timing: "May, 5 nights",
    bucket: "Sun break",
  },
  {
    destination: "Rome",
    airport: "FCO",
    price: "EUR 96",
    baseline: "EUR 142",
    drop: "32%",
    timing: "April, long weekend",
    bucket: "City break",
  },
  {
    destination: "New York",
    airport: "JFK",
    price: "EUR 389",
    baseline: "EUR 561",
    drop: "31%",
    timing: "September, 7 nights",
    bucket: "Long haul",
  },
];

export const workflowSteps = [
  {
    title: "Scan flexible dates from LUX",
    body: "The Python worker uses fli to search round-trip windows across the next 2 to 8 months per route bucket.",
  },
  {
    title: "Score against recent history",
    body: "Every cheapest fare is stored as a snapshot. When the fresh price lands below the recent median, it becomes a pending deal candidate.",
  },
  {
    title: "Ship one clean email",
    body: "Editors approve the strongest fares and turn them into a daily digest or flash alert for Luxembourg subscribers.",
  },
];

export const routeBuckets = [
  {
    key: "weekend_europe",
    label: "Weekend Europe",
    detail: "2 to 3 nights, quick open-rate wins, mostly nonstop or one stop max.",
  },
  {
    key: "sun_breaks",
    label: "Sun Breaks",
    detail: "4 to 5 nights, Mediterranean and Iberian routes where fare swings are worth emailing.",
  },
  {
    key: "long_haul",
    label: "Long Haul",
    detail: "6 to 8 nights, slower cadence, bigger drops, premium future upsell potential.",
  },
];

export const highlightedRoutes = routes;

