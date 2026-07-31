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


if __name__ == "__main__":
    unittest.main()
