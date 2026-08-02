export type MonthlyPricePoint = {
  month: string;
  averagePrice: number | null;
  sampleCount: number;
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
