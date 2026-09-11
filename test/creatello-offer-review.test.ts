import { test } from "node:test";
import assert from "node:assert/strict";
import { completeDurations, differences, normalized, sameFixedOffer, signAcceptedOffer, verifyAcceptedOffer, type Offer } from "../lib/creatello-offer-comparison";
const offer = { originAirport: "LUX", destinationAirport: "BGY", departureDate: "2027-10-08", returnDate: "2027-10-11", adults: 1, cabin: "economy", currency: "EUR", stops: 0, airlineCode: "FR", outboundDepartureTime: "08:15", outboundArrivalTime: "09:35", returnDepartureTime: "06:05", returnArrivalTime: "07:25", outboundDurationMinutes: 80, returnDurationMinutes: 80, priceMinor: 3000 } as Offer;
test("normalizes codes and time representation without turning absent data into a value", () => {
 assert.equal(normalized("airlineCode", " fr "), "FR"); assert.equal(normalized("outboundDepartureTime", "8:15:00"), "08:15");
 assert.equal(normalized("stops", 0), 0); assert.equal(normalized("stops", null), null);
 assert.equal(differences(offer, { ...offer, airlineCode: " fr " }).length, 0);
 assert.equal(differences(offer, { ...offer, outboundDurationMinutes: undefined })[0].after, null);
});
test("missing durations are filled only from unambiguous same-itinerary evidence", () => {
 const old = { ...offer, outboundDurationMinutes: undefined, returnDurationMinutes: undefined };
 assert.equal(completeDurations(old, [offer]).outboundDurationMinutes, 80);
 assert.equal(old.outboundDurationMinutes, undefined);
 assert.equal(completeDurations(old, [{ ...offer, airlineCode: "LG" }]).outboundDurationMinutes, undefined);
 assert.equal(completeDurations(old, [offer, { ...offer, outboundDurationMinutes: 95 }]).outboundDurationMinutes, undefined);
 assert.equal(completeDurations(old, []).outboundDurationMinutes, undefined);
});
test("alternatives cannot change fixed flight criteria", () => {
 for (const field of ["originAirport", "destinationAirport", "departureDate", "returnDate", "adults", "cabin", "currency"]) assert.equal(sameFixedOffer(offer, { ...offer, [field]: "other" }), false);
 assert.equal(sameFixedOffer(offer, { ...offer, priceMinor: 5000, airlineCode: "LG", stops: 1 }), true);
});
test("acceptance signature binds package, original offer and every confirmed value", () => {
 const signature = signAcceptedOffer("hash", "key", offer, "secret");
 assert.equal(verifyAcceptedOffer("hash", "key", offer, signature, "secret"), true);
 assert.equal(verifyAcceptedOffer("hash", "key", Object.fromEntries(Object.entries(offer).reverse()) as Offer, signature, "secret"), true);
 assert.equal(verifyAcceptedOffer("other", "key", offer, signature, "secret"), false);
 assert.equal(verifyAcceptedOffer("hash", "other", offer, signature, "secret"), false);
 assert.equal(verifyAcceptedOffer("hash", "key", { ...offer, stops: 1 }, signature, "secret"), false);
 assert.equal(verifyAcceptedOffer("hash", "key", offer, "x", "secret"), false);
});
