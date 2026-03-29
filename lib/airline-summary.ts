export function normalizeAirlineNames(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  const deduped: string[] = [];

  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }

    const trimmed = item.trim();
    if (!trimmed || deduped.includes(trimmed)) {
      continue;
    }

    deduped.push(trimmed);
  }

  return deduped;
}

export function formatAirlineSummary(airlineNames: string[]) {
  if (airlineNames.length === 0) {
    return null;
  }

  if (airlineNames.length <= 3) {
    return airlineNames.join(", ");
  }

  return `${airlineNames.slice(0, 3).join(", ")} + ${airlineNames.length - 3} more`;
}
