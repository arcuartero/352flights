from __future__ import annotations

import unittest
from datetime import date, datetime, timedelta, timezone

from luxflight_scanner.models import RouteSeed
from luxflight_scanner.run_summary import build_price_scan_run_summary


class PriceScanRunSummaryTests(unittest.TestCase):
    def test_builds_aggregate_route_and_pattern_metrics(self) -> None:
        route = RouteSeed(
            origin_airport="LUX",
            destination_airport="MXP",
            destination_city="Milan",
            bucket="weekend_europe",
            trip_nights=3,
            lookahead_start_days=3,
            lookahead_end_days=250,
            max_stops="NON_STOP",
            teaser="Milan",
        )
        pattern = {
            "key": "fri-mon-3",
            "label": "Fri to Mon",
            "departure_weekday": "FRI",
            "return_weekday": "MON",
            "trip_nights": 3,
        }
        route_payload = {
            "origin_airport": route.origin_airport,
            "destination_airport": route.destination_airport,
            "destination_city": route.destination_city,
            "bucket": route.bucket,
            "max_stops": route.max_stops,
        }
        report = [
            {
                "route": route_payload,
                "pattern": pattern,
                "status": "deal",
                "snapshot": {
                    "price": 49,
                    "currency": "EUR",
                    "departure_date": "2026-09-04",
                    "return_date": "2026-09-07",
                    "metadata": {
                        "airline_summary": "Luxair",
                        "primary_airline_code": "LG",
                        "outbound_departure_at": "2026-09-04T18:20",
                        "outbound_arrival_at": "2026-09-04T19:30",
                        "return_departure_at": "2026-09-07T07:10",
                        "return_arrival_at": "2026-09-07T08:20",
                        "outbound_stop_count": 0,
                        "return_stop_count": 0,
                    },
                },
            },
            {
                "route": route_payload,
                "pattern": {**pattern, "key": "sat-mon-2", "label": "Sat to Mon"},
                "status": "no_results",
                "reason_code": "no_flights_found",
                "reason": "No flights",
            },
            {
                "route": route_payload,
                "pattern": {**pattern, "key": "sun-sun-7", "label": "Sun to Sun"},
                "status": "error",
                "error_type": "timeout",
                "error": "Timed out",
            },
        ]
        started_at = datetime(2026, 7, 31, 9, 0, tzinfo=timezone.utc)
        summary = build_price_scan_run_summary(
            run_key="run-1",
            scanner_source="test",
            routes=[route],
            report=report,
            started_at=started_at,
            completed_at=started_at + timedelta(minutes=5),
            status="completed_with_errors",
            started_route_keys={route.key},
            completed_route_keys={route.key},
            patterns_planned=3,
            patterns_scanned=3,
            retry_counts={f"{route.key}:sun-sun-7": 1},
            search_window_start=date(2026, 8, 3),
            search_window_end=date(2027, 4, 7),
        )

        self.assertEqual(summary["destinations_scanned"], 1)
        self.assertEqual(summary["routes_started"], 1)
        self.assertEqual(summary["patterns_scanned"], 3)
        self.assertEqual(summary["rules_scanned"], 4)
        self.assertEqual(summary["found_prices"], 1)
        self.assertEqual(summary["deal_candidates"], 1)
        self.assertEqual(summary["no_results"], 1)
        self.assertEqual(summary["timed_out"], 1)
        self.assertEqual(summary["retries"], 1)
        self.assertEqual(summary["median_price"], 49)
        self.assertEqual(summary["no_result_breakdown"], {"no_flights_found": 1})
        self.assertEqual(summary["error_breakdown"], {"timeout": 1})
        self.assertEqual(summary["routes"][0]["rules_scanned"], 4)
        self.assertEqual(summary["destinations"][0]["found_prices"], 1)
        self.assertEqual(summary["scanned_cities"], ["Milan"])
        self.assertEqual(summary["search_window_start"], "2026-08-03")
        self.assertEqual(summary["search_window_end"], "2027-04-07")
        self.assertEqual(summary["patterns"][0]["airline"], "Luxair")
        self.assertEqual(summary["patterns"][0]["airline_code"], "LG")
        self.assertEqual(
            summary["heartbeat_at"],
            (started_at + timedelta(minutes=5)).isoformat(),
        )
        self.assertEqual(
            summary["patterns"][0]["outbound_departure_at"],
            "2026-09-04T18:20",
        )

    def test_keeps_one_representative_result_per_search_pattern(self) -> None:
        route = RouteSeed(
            origin_airport="LUX",
            destination_airport="CPH",
            destination_city="Copenhagen",
            bucket="weekend_europe",
            trip_nights=3,
            lookahead_start_days=3,
            lookahead_end_days=250,
            max_stops="NON_STOP",
            teaser="Copenhagen",
        )
        pattern = {
            "key": "fri-mon-3",
            "label": "Fri to Mon",
            "departure_weekday": "FRI",
            "return_weekday": "MON",
            "trip_nights": 3,
        }
        route_payload = {
            "origin_airport": route.origin_airport,
            "destination_airport": route.destination_airport,
            "destination_city": route.destination_city,
            "bucket": route.bucket,
            "max_stops": route.max_stops,
        }
        report = [
            {
                "route": route_payload,
                "pattern": pattern,
                "status": "tracked",
                "snapshot": {
                    "price": price,
                    "currency": "EUR",
                    "departure_date": departure,
                    "return_date": "2026-09-07",
                    "metadata": {},
                },
            }
            for price, departure in ((99, "2026-09-04"), (49, "2026-09-11"))
        ]
        started_at = datetime(2026, 8, 23, 6, 0, tzinfo=timezone.utc)

        summary = build_price_scan_run_summary(
            run_key="run-compact",
            scanner_source="test",
            routes=[route],
            report=report,
            started_at=started_at,
            completed_at=started_at + timedelta(minutes=5),
            status="completed",
            started_route_keys={route.key},
            completed_route_keys={route.key},
            patterns_planned=1,
            patterns_scanned=1,
            retry_counts={},
            search_window_start=date(2026, 9, 1),
            search_window_end=date(2026, 9, 30),
        )

        self.assertEqual(summary["found_prices"], 2)
        self.assertEqual(len(summary["patterns"]), 1)
        self.assertEqual(summary["patterns"][0]["price"], 49)


if __name__ == "__main__":
    unittest.main()
