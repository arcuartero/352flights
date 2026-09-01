const COUNTRY_AIRPORTS = {
  AE: ["AUH", "DWC", "DXB"],
  AT: ["VIE"],
  BE: ["BRU"],
  BG: ["BOJ", "VAR"],
  CH: ["GVA", "ZRH"],
  CN: ["CGO"],
  CV: ["BVC", "RAI", "SID", "VXE"],
  CZ: ["PRG"],
  DE: ["BER", "FRA", "GWT", "HAM", "HDF", "MUC"],
  DK: ["CPH"],
  EG: ["HRG", "RMF"],
  ES: [
    "ACE",
    "AGP",
    "ALC",
    "BCN",
    "BIO",
    "FUE",
    "GRO",
    "IBZ",
    "LEI",
    "LPA",
    "MAD",
    "MAH",
    "PMI",
    "SPC",
    "SVQ",
    "TFS",
    "VLC",
    "XRY",
  ],
  FI: ["HEL", "RVN"],
  FR: ["AJA", "BIA", "BIQ", "BOD", "CDG", "CLY", "FSC", "MPL", "MRS", "NCE", "ORY", "TLN", "TLS"],
  GB: ["EDI", "LCY", "LGW", "LHR", "MAN", "STN"],
  GR: ["ATH", "CFU", "CHQ", "GPA", "HER", "KGS", "RHO", "SKG", "ZTH"],
  HR: ["BWK", "DBV", "ZAD"],
  HU: ["BUD"],
  IE: ["DUB"],
  IT: [
    "BDS",
    "BGY",
    "BLQ",
    "BRI",
    "BZO",
    "CAG",
    "CIA",
    "CTA",
    "FCO",
    "FLR",
    "LIN",
    "MXP",
    "NAP",
    "OLB",
    "PMO",
    "PSR",
    "QSR",
    "RMI",
    "SUF",
    "VCE",
  ],
  JP: ["NRT"],
  MA: ["AGA", "RAK"],
  ME: ["TIV"],
  MT: ["MLA"],
  NL: ["AMS"],
  NO: ["OSL"],
  PL: ["KRK", "WAW"],
  PT: ["FAO", "FNC", "LIS", "OPO", "PXO"],
  RO: ["OTP"],
  SE: ["ARN"],
  SI: ["LJU"],
  SN: ["DSS"],
  TN: ["DJE", "MIR", "NBE", "TUN"],
  TR: ["ADB", "AYT", "IST"],
  US: ["EWR", "JFK"],
} as const;

const AIRPORT_COUNTRY_CODES = new Map<string, string>(
  Object.entries(COUNTRY_AIRPORTS).flatMap(([countryCode, airports]) =>
    airports.map((airport) => [airport, countryCode] as const),
  ),
);

const LOCAL_FLAG_CODES = new Set(["de", "es", "fr", "gb", "it", "pt"]);

export function getAirportCountryCode(airport: string | null | undefined) {
  if (!airport) return undefined;
  return AIRPORT_COUNTRY_CODES.get(airport.trim().toUpperCase());
}

export function getCountryFlagSrc(countryCode: string | null | undefined) {
  const normalizedCode = countryCode?.trim().toUpperCase();
  if (!normalizedCode || !/^[A-Z]{2}$/.test(normalizedCode)) return undefined;

  const lowerCode = normalizedCode.toLowerCase();
  if (LOCAL_FLAG_CODES.has(lowerCode)) return `/flags/${lowerCode}.svg`;

  const codePoints = [...normalizedCode]
    .map((letter) => (0x1f1e6 + letter.charCodeAt(0) - 65).toString(16))
    .join("-");

  return `https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/${codePoints}.svg`;
}
