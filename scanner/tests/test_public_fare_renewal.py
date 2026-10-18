from __future__ import annotations

import copy
import json
import sys
import unittest
from datetime import date, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import Mock

from luxflight_scanner.public_fare_renewal import PublicFareRenewal, price_minor, search_context
from luxflight_scanner.scanner import LuxFlightScanner


def fake_provider_scanner(job, price=88):
    """Real filter/snapshot builders with only the provider response replaced."""
    scanner = LuxFlightScanner.__new__(LuxFlightScanner)
    scanner.config = SimpleNamespace(currency_code="EUR")
    m = job["snapshot"]["metadata"]
    airline = SimpleNamespace(name="LG", value="Luxair")
    def leg(departure, arrival):
        return SimpleNamespace(legs=[SimpleNamespace(airline=airline,
            departure_datetime=datetime.fromisoformat(departure),
            arrival_datetime=datetime.fromisoformat(arrival))], duration=120, price=price)
    result = (leg(m["outbound_departure_at"], m["outbound_arrival_at"]),
              leg(m["return_departure_at"], m["return_arrival_at"]))
    scanner._run_flight_search = Mock(return_value=[result])
    return scanner


def fixture_job():
    departure = (date.today() + timedelta(days=60)).isoformat()
    inbound = (date.today() + timedelta(days=63)).isoformat()
    return {"itinerary_key": "key", "lease_token": "lease", "snapshot": {
        "id": 1, "price": 80, "departure_date": departure, "return_date": inbound,
        "trip_nights": 3, "max_stops": "NON_STOP", "currency": "EUR",
        "metadata": {"pattern_key": "fri-mon-3", "airline_codes": ["LG"],
            "skyscanner_url": "https://www.skyscanner.net/?adultsv2=1&cabinclass=economy",
            "outbound_departure_at": f"{departure}T10:00", "outbound_arrival_at": f"{departure}T12:00",
            "return_departure_at": f"{inbound}T10:00", "return_arrival_at": f"{inbound}T12:00",
            "outbound_stop_count": 0, "return_stop_count": 0, "local_snapshot_id": "1"}},
        "route": {"origin_airport": "LUX", "destination_airport": "MAD", "destination_city": "Madrid", "bucket": "weekend_europe"}}


class PublicFareRenewalTests(unittest.TestCase):
    def setUp(self):
        self.job = fixture_job()
        self.scanner = fake_provider_scanner(self.job)
        self.store = Mock()
        self.worker = PublicFareRenewal(self.scanner, self.store)

    def test_actual_provider_builder_confirms_same_itinerary(self):
        observation, reason = self.worker.check(self.job)
        self.assertEqual(reason, "checked")
        self.assertEqual(price_minor(observation["price"]), 8800)
        self.assertNotIn("local_snapshot_id", observation["metadata"])
        filters = self.scanner._run_flight_search.call_args.args[0]
        self.assertEqual(str(filters.flight_segments[0].travel_date), self.job["snapshot"]["departure_date"])

    def test_other_flight_and_empty_results_are_inconclusive(self):
        self.scanner._run_flight_search.return_value[0][0].legs[0].departure_datetime += timedelta(hours=1)
        self.assertEqual(self.worker.check(self.job), (None, "itinerary_not_confirmed"))
        self.scanner._run_flight_search.return_value = []
        self.assertEqual(self.worker.check(self.job), (None, "itinerary_not_confirmed"))

    def test_different_airline_does_not_confirm_original(self):
        self.scanner._run_flight_search.return_value[0][0].legs[0].airline = SimpleNamespace(name="FR", value="Ryanair")
        self.assertEqual(self.worker.check(self.job)[0], None)

    def test_changed_currency_cabin_or_adults_are_not_silently_substituted(self):
        for currency, url in [("USD", "?adultsv2=1&cabinclass=economy"),
                              ("EUR", "?adultsv2=2&cabinclass=economy"),
                              ("EUR", "?adultsv2=1&cabinclass=business"), ("EUR", "")]:
            job = copy.deepcopy(self.job)
            job["snapshot"]["currency"] = currency
            job["snapshot"]["metadata"]["skyscanner_url"] = url
            self.assertEqual(self.worker.check(job), (None, "unsupported_search_context"))
        self.scanner._run_flight_search.assert_not_called()

    def test_network_error_finishes_pending_without_an_observation(self):
        self.store.claim.side_effect = [self.job, None]
        self.store.finish.return_value = {"state": "pending"}
        self.scanner._run_flight_search.side_effect = TimeoutError("provider timeout")
        report = self.worker.run()
        self.assertEqual(report["pending"], 1)
        self.store.finish.assert_called_once_with(self.job, None, "provider_error:TimeoutError")

    def test_changed_price_is_counted_and_cache_failure_remains_pending(self):
        self.store.claim.side_effect = [self.job, None]
        self.store.finish.return_value = {"state": "renewed"}
        self.store.flush_caches.side_effect = ConnectionError()
        report = self.worker.run()
        self.assertEqual(report["updated"], 1)
        self.assertEqual(report["cache"], "pending:ConnectionError")

    def test_ambiguous_database_write_is_not_repeated(self):
        self.store.claim.return_value = self.job
        self.store.finish.side_effect = TimeoutError()
        with self.assertRaises(TimeoutError):
            self.worker.run()
        self.assertEqual(self.store.finish.call_count, 1)

    def test_unknown_context_and_cent_rounding(self):
        self.assertEqual(search_context({"metadata": {}}), (None, None))
        self.assertEqual(price_minor(88.005), 8801)


if __name__ == "__main__":
    if "--fixture" in sys.argv:
        job = json.load(sys.stdin)
        observation, reason = PublicFareRenewal(fake_provider_scanner(job), Mock()).check(job)
        print(json.dumps({"observation": observation, "reason": reason}))
    else:
        unittest.main()
