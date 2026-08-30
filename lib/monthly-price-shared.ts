export type MonthlyPricePoint = {
  month: string;
  averagePrice: number | null;
  sampleCount: number;
  availability: "priced" | "no_departures" | "no_prices";
};

export type MonthlyPriceAverageData = {
  originAirport: string;
  destinationCity: string;
  directOnly: boolean;
  tripType: string;
  currency: string;
  annualAverage: number | null;
  cheapestMonth: string | null;
  totalSamples: number;
  months: MonthlyPricePoint[];
};
