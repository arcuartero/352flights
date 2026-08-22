from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from luxflight_scanner.config import ScannerConfig
from luxflight_scanner.scanner import load_routes


class ScannerWindowTests(unittest.TestCase):
    def test_global_window_overrides_route_seed_window(self) -> None:
        route = {
            "origin_airport": "LUX",
            "destination_airport": "LHR",
            "destination_city": "London",
            "bucket": "weekend_europe",
            "trip_nights": 3,
            "lookahead_start_days": 14,
            "lookahead_end_days": 90,
            "max_stops": "NON_STOP",
            "teaser": "London",
        }

        with tempfile.TemporaryDirectory() as directory:
            routes_path = Path(directory) / "routes.json"
            routes_path.write_text(json.dumps([route]), encoding="utf-8")
            routes = load_routes(ScannerConfig(routes_path=routes_path))

        self.assertEqual(len(routes), 1)
        self.assertEqual(routes[0].lookahead_start_days, 3)
        self.assertEqual(routes[0].lookahead_end_days, 250)

    def test_duplicate_categories_become_one_physical_route(self) -> None:
        base_route = {
            "origin_airport": "LUX",
            "destination_airport": "RAK",
            "destination_city": "Marrakech",
            "trip_nights": 5,
            "min_trip_nights": 1,
            "max_trip_nights": 7,
            "lookahead_start_days": 30,
            "lookahead_end_days": 160,
            "max_stops": "NON_STOP",
            "teaser": "Marrakech",
        }

        with tempfile.TemporaryDirectory() as directory:
            routes_path = Path(directory) / "routes.json"
            routes_path.write_text(
                json.dumps(
                    [
                        {**base_route, "bucket": "weekend_europe"},
                        {**base_route, "bucket": "long_haul"},
                    ]
                ),
                encoding="utf-8",
            )
            routes = load_routes(ScannerConfig(routes_path=routes_path))

        self.assertEqual(len(routes), 1)
        self.assertEqual(routes[0].key, "LUX:RAK:NON_STOP")
        self.assertEqual(routes[0].supported_buckets, ("weekend_europe", "long_haul"))


if __name__ == "__main__":
    unittest.main()
