from __future__ import annotations

import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

from luxflight_scanner.config import ScannerConfig
from luxflight_scanner.models import IndicativePriceRecord, RouteSeed, SearchPattern
from luxflight_scanner.scanner import LuxFlightScanner
from luxflight_scanner.storage import LocalStore


class IndicativePriceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.scanner = LuxFlightScanner.__new__(LuxFlightScanner)
        self.scanner.config = ScannerConfig(
            sync_snapshots_live=False,
            sync_deals_live=False,
            sync_scan_runs_live=False,
        )
        self.route = RouteSeed(
            origin_airport="LUX",
            destination_airport="MAD",
            destination_city="Madrid",
            bucket="weekend_europe",
            trip_nights=3,
            min_trip_nights=1,
            max_trip_nights=7,
            lookahead_start_days=3,
            lookahead_end_days=250,
            max_stops="NON_STOP",
            teaser="Madrid",
        )
        self.rule = SearchPattern(
            key="thu-sun",
            label="Thu -> Sun",
            departure_weekday="THU",
            return_weekday="SUN",
            trip_nights=3,
        )
        self.observed_at = datetime(2026, 8, 28, 8, 0, tzinfo=timezone.utc)

    @staticmethod
    def result(outbound: str, inbound: str, price: float) -> object:
        return SimpleNamespace(
            date=(datetime.fromisoformat(outbound), datetime.fromisoformat(inbound)),
            price=price,
        )

    def test_extracts_every_valid_calendar_combination(self) -> None:
        results = [
            self.result("2026-09-03", "2026-09-06", 110),
            self.result("2026-09-10", "2026-09-13", 95),
            self.result("2026-09-11", "2026-09-14", 80),
            self.result("2026-09-10", "2026-09-13", 95),
        ]

        records = self.scanner._indicative_prices_from_calendar_results(
            self.route,
            self.rule,
            results,
            max_stops="NON_STOP",
            observed_at=self.observed_at,
        )

        self.assertEqual(len(records), 2)
        self.assertEqual([record.price for record in records], [110, 95])
        self.assertEqual(records[0].departure_month, "2026-09-01")
        self.assertEqual(records[0].routing_type, "direct")
        self.assertEqual(records[0].verification_status, "indicative")
        self.assertEqual(records[0].days_until_departure, 6)

    def test_batch_is_idempotent_and_never_creates_deals(self) -> None:
        records = list(
            self.scanner._indicative_prices_from_calendar_results(
                self.route,
                self.rule,
                [
                    self.result("2026-09-03", "2026-09-06", 110),
                    self.result("2026-09-10", "2026-09-13", 95),
                ],
                max_stops="NON_STOP",
                observed_at=self.observed_at,
            )
        )
        with tempfile.TemporaryDirectory() as directory:
            state_path = Path(directory) / "state.json"
            store = LocalStore(state_path)
            first = store.save_indicative_prices(
                self.route.key,
                records,
                scan_run_key="run-1",
            )
            second = store.save_indicative_prices(
                self.route.key,
                records,
                scan_run_key="run-1",
            )
            state = json.loads(state_path.read_text(encoding="utf-8"))

        self.assertEqual(first, {"received": 2, "inserted": 2, "duplicates": 0})
        self.assertEqual(second, {"received": 2, "inserted": 0, "duplicates": 2})
        self.assertEqual(len(state["indicative_prices"]), 2)
        self.assertEqual(state["deals"], [])
        self.assertEqual(state["snapshots"], [])

    def test_verification_marks_only_the_matching_calendar_row(self) -> None:
        record = IndicativePriceRecord(
            origin_airport="LUX",
            destination_airport="MAD",
            rule_key="thu-sun",
            rule_label="Thu -> Sun",
            departure_weekday="THU",
            return_weekday="SUN",
            departure_date="2026-09-03",
            return_date="2026-09-06",
            departure_month="2026-09-01",
            trip_nights=3,
            max_stops="NON_STOP",
            routing_type="direct",
            price=110,
            currency="EUR",
            observed_at=self.observed_at.isoformat(),
            days_until_departure=6,
        )
        with tempfile.TemporaryDirectory() as directory:
            state_path = Path(directory) / "state.json"
            store = LocalStore(state_path)
            store.save_indicative_prices(self.route.key, [record], scan_run_key="run-1")
            store.mark_indicative_price_verified(
                self.route.key,
                scan_run_key="run-1",
                rule_key="thu-sun",
                departure_date="2026-09-03",
                return_date="2026-09-06",
                max_stops="NON_STOP",
            )
            state = json.loads(state_path.read_text(encoding="utf-8"))

        self.assertEqual(state["indicative_prices"][0]["verification_status"], "verified")

    def test_checkpoint_survives_a_new_local_store_instance(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            state_path = Path(directory) / "state.json"
            store = LocalStore(state_path)
            store.save_price_scan_checkpoint(
                {
                    "plan_key": "plan-1",
                    "run_key": "run-1",
                    "started_at": self.observed_at.isoformat(),
                    "completed_rule_keys": ["LUX:MAD:NON_STOP|thu-sun||"],
                }
            )
            restored = LocalStore(state_path).load_price_scan_checkpoint("plan-1")

        self.assertIsNotNone(restored)
        self.assertEqual(restored["run_key"], "run-1")
        self.assertEqual(len(restored["completed_rule_keys"]), 1)


if __name__ == "__main__":
    unittest.main()
