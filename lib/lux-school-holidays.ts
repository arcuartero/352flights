export type LuxSchoolHoliday = {
  id: string;
  label: string;
  schoolYear: string;
  startsOn: string;
  endsOn: string;
};

// Source: Luxembourg Ministry of Education school holiday calendar
// https://men.public.lu/en/vacances-scolaires.html
export const luxSchoolHolidays: LuxSchoolHoliday[] = [
  {
    id: "easter-2026",
    label: "Easter holidays",
    schoolYear: "2025/2026",
    startsOn: "2026-03-28",
    endsOn: "2026-04-12",
  },
  {
    id: "pentecost-2026",
    label: "Pentecost holidays",
    schoolYear: "2025/2026",
    startsOn: "2026-05-23",
    endsOn: "2026-05-31",
  },
  {
    id: "summer-2026",
    label: "Summer holidays",
    schoolYear: "2025/2026",
    startsOn: "2026-07-16",
    endsOn: "2026-09-14",
  },
  {
    id: "all-saints-2026",
    label: "All Saints holidays",
    schoolYear: "2026/2027",
    startsOn: "2026-10-31",
    endsOn: "2026-11-08",
  },
  {
    id: "christmas-2026",
    label: "Christmas holidays",
    schoolYear: "2026/2027",
    startsOn: "2026-12-19",
    endsOn: "2027-01-03",
  },
  {
    id: "carnival-2027",
    label: "Carnival holidays",
    schoolYear: "2026/2027",
    startsOn: "2027-02-06",
    endsOn: "2027-02-14",
  },
  {
    id: "easter-2027",
    label: "Easter holidays",
    schoolYear: "2026/2027",
    startsOn: "2027-03-27",
    endsOn: "2027-04-11",
  },
  {
    id: "pentecost-2027",
    label: "Pentecost holidays",
    schoolYear: "2026/2027",
    startsOn: "2027-05-29",
    endsOn: "2027-06-06",
  },
  {
    id: "summer-2027",
    label: "Summer holidays",
    schoolYear: "2026/2027",
    startsOn: "2027-07-16",
    endsOn: "2027-09-14",
  },
  {
    id: "all-saints-2027",
    label: "All Saints holidays",
    schoolYear: "2027/2028",
    startsOn: "2027-10-30",
    endsOn: "2027-11-07",
  },
  {
    id: "christmas-2027",
    label: "Christmas holidays",
    schoolYear: "2027/2028",
    startsOn: "2027-12-18",
    endsOn: "2028-01-02",
  },
  {
    id: "carnival-2028",
    label: "Carnival holidays",
    schoolYear: "2027/2028",
    startsOn: "2028-02-12",
    endsOn: "2028-02-20",
  },
  {
    id: "easter-2028",
    label: "Easter holidays",
    schoolYear: "2027/2028",
    startsOn: "2028-04-01",
    endsOn: "2028-04-16",
  },
  {
    id: "pentecost-2028",
    label: "Pentecost holidays",
    schoolYear: "2027/2028",
    startsOn: "2028-05-27",
    endsOn: "2028-06-04",
  },
  {
    id: "summer-2028",
    label: "Summer holidays",
    schoolYear: "2027/2028",
    startsOn: "2028-07-15",
    endsOn: "2028-09-14",
  },
];

function normalizeDateKey(value: string | null) {
  if (!value) {
    return null;
  }

  return value.slice(0, 10);
}

export function getMatchingLuxSchoolHoliday(
  departureDate: string | null,
  returnDate: string | null,
): LuxSchoolHoliday | null {
  const departureKey = normalizeDateKey(departureDate);
  if (!departureKey) {
    return null;
  }

  const returnKey = normalizeDateKey(returnDate) ?? departureKey;

  return (
    luxSchoolHolidays.find(
      (holiday) => departureKey <= holiday.endsOn && returnKey >= holiday.startsOn,
    ) ?? null
  );
}
