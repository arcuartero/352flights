from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from luxflight_scanner.config import ScannerConfig
from luxflight_scanner.sync import LocalSupabaseSync


class FakeSupabaseStore:
    def __init__(self, _config: ScannerConfig):
        pass

    def ensure_route(self, _route: object) -> str:
        return "remote-route-id"

    def route_pattern_overrides(self, _route_id: str) -> list[dict[str, object]]:
        return [{"pattern_key": "fri-sun", "is_active": True}]

    def route_search_rules(self, _route_id: str) -> list[dict[str, object]]:
        return [
            {
                "month_start": "2027-01-01",
                "pattern_key": "fri-sun",
                "is_active": True,
            }
        ]

    def route_service_months(
        self,
        _route_id: str,
        _routing: str,
    ) -> list[dict[str, object]]:
        return [
            {
                "month_start": "2027-01-01",
                "routing": "NON_STOP",
                "departure_dates": ["2027-01-08"],
            }
        ]


class ConfigurationSyncTests(unittest.TestCase):
    def test_pulls_remote_monthly_configuration_into_local_route_ids(self) -> None:
        route = {
            "origin_airport": "LUX",
            "destination_airport": "STN",
            "destination_city": "London",
            "bucket": "weekend_europe",
            "trip_nights": 3,
            "lookahead_start_days": 3,
            "lookahead_end_days": 250,
            "max_stops": "NON_STOP",
            "teaser": "London",
        }

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            routes_path = root / "routes.json"
            state_path = root / "state.json"
            routes_path.write_text(json.dumps([route]), encoding="utf-8")
            config = ScannerConfig(
                routes_path=routes_path,
                state_path=state_path,
                supabase_url="https://example.supabase.co",
                supabase_service_role_key="test-key",
            )

            with patch("luxflight_scanner.sync.SupabaseStore", FakeSupabaseStore):
                report = LocalSupabaseSync(config).pull_scanner_configuration()

            state = json.loads(state_path.read_text(encoding="utf-8"))

        local_route_id = "LUX:STN:NON_STOP"
        self.assertEqual(report["search_rules_pulled"], 1)
        self.assertEqual(state["route_search_rules"][0]["route_id"], local_route_id)
        self.assertEqual(state["route_service_months"][0]["route_id"], local_route_id)
        self.assertEqual(state["route_pattern_overrides"][0]["route_id"], local_route_id)
        self.assertEqual(state["scanner_configuration"]["source"], "supabase")


if __name__ == "__main__":
    unittest.main()
