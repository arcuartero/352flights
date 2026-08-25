from __future__ import annotations

import unittest
from datetime import date

from luxflight_scanner.main import build_parser
from luxflight_scanner.models import RouteSeed
from luxflight_scanner.scanner import LuxFlightScanner


def route(destination: str = "MAD") -> RouteSeed:
    return RouteSeed(
        origin_airport="LUX",
        destination_airport=destination,
        destination_city="Madrid",
        bucket="weekend_europe",
        trip_nights=3,
        lookahead_start_days=3,
        lookahead_end_days=250,
        max_stops="NON_STOP",
        teaser="Madrid",
    )


class RouteDiscoveryScopeTests(unittest.TestCase):
    def test_route_filter_selects_only_the_requested_physical_route(self) -> None:
        requested = route("MAD")
        other = route("CDG")
        route_filter = {
            "origin_airport": "LUX",
            "destination_airport": "MAD",
            "max_stops": "NON_STOP",
        }

        self.assertTrue(LuxFlightScanner._route_matches_filter(requested, route_filter))
        self.assertFalse(LuxFlightScanner._route_matches_filter(other, route_filter))

    def test_service_calendar_search_is_not_limited_to_an_airline(self) -> None:
        scanner = LuxFlightScanner.__new__(LuxFlightScanner)

        filters = scanner._build_service_calendar_flight_filters(
            route(),
            travel_date=date(2026, 9, 1),
            max_stops="NON_STOP",
        )

        self.assertIsNone(filters.airlines)

    def test_manual_refresh_flag_can_override_resume_mode(self) -> None:
        args = build_parser().parse_args(
            [
                "--discover-patterns",
                "--only-missing-service-months",
                "--refresh-service-months",
                "--destination-airport",
                "MAD",
            ]
        )

        self.assertTrue(args.discover_patterns)
        self.assertTrue(args.only_missing_service_months)
        self.assertTrue(args.refresh_service_months)
        self.assertEqual(args.destination_airport, "MAD")


if __name__ == "__main__":
    unittest.main()
