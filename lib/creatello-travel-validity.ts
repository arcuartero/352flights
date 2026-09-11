export const TRAVEL_TIMEZONE = "Europe/Luxembourg";

// Departure dates have no time. Midnight in Luxembourg is the exclusive deadline.
export function departureDeadline(departureDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(departureDate || "")) throw new Error("Invalid departure date");
  const target = Date.parse(departureDate + "T00:00:00.000Z");
  if (!Number.isFinite(target) || new Date(target).toISOString().slice(0, 10) !== departureDate) throw new Error("Invalid departure date");
  let instant = target;
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: TRAVEL_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  for (let i = 0; i < 3; i++) {
    const parts = formatter.formatToParts(new Date(instant));
    const part = (name: string) => Number(parts.find((p) => p.type === name)!.value);
    instant += target - Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
  }
  return new Date(instant).toISOString();
}

export function packageTravelValidity(payload: { offers: Array<{ departureDate: string }> }) {
  if (!Array.isArray(payload?.offers) || !payload.offers.length) throw new Error("Package has no offers");
  const dates = payload.offers.map((offer) => {
    departureDeadline(offer.departureDate);
    return offer.departureDate;
  }).sort();
  const firstDepartureDate = dates[0];
  return {
    firstDepartureDate,
    usableUntil: departureDeadline(firstDepartureDate),
    lastUsableDate: new Date(Date.parse(firstDepartureDate + "T00:00:00Z") - 86400000).toISOString().slice(0, 10),
  };
}

export function assertPackageTravelValidity(payload: { offers: Array<{ departureDate: string }> }, scheduledAt: string | number = Date.now(), now = Date.now()) {
  const validity = packageTravelValidity(payload);
  const proposed = typeof scheduledAt === "number" ? scheduledAt : new Date(scheduledAt).getTime();
  if (!Number.isFinite(proposed) || Math.max(proposed, now) >= Date.parse(validity.usableUntil)) {
    throw Object.assign(new Error(`El paquete solo se puede utilizar hasta el ${validity.lastUsableDate}. Primera salida: ${validity.firstDepartureDate} (Europe/Luxembourg).`), { code: "package_travel_period_ended", statusCode: 409, ...validity });
  }
  return validity;
}
