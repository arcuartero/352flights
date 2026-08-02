from __future__ import annotations

import unittest
from datetime import date, timedelta

from luxflight_scanner.models import SearchPattern, SnapshotRecord
from luxflight_scanner.scanner import LuxFlightScanner


class PublicFareSelectionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.scanner = LuxFlightScanner.__new__(LuxFlightScanner)
        self.pattern = SearchPattern(
            key="fri-mon-3",
            label="Fri -> Mon",
            departure_weekday="FRI",
            return_weekday="MON",
            trip_nights=3,
            month_start=date.today().replace(day=1).isoformat(),
        )

    def snapshot(self, price: float, days_until_departure: int = 60) -> SnapshotRecord:
        departure = date.today() + timedelta(days=days_until_departure)
        return SnapshotRecord(
            departure_date=departure.isoformat(),
            return_date=(departure + timedelta(days=3)).isoformat(),
            trip_nights=3,
            max_stops="NON_STOP",
            price=price,
            currency="EUR",
            metadata={"pattern_key": self.pattern.key},
        )

    def test_marks_strong_monthly_discount_for_publication(self) -> None:
        result = self.scanner._snapshot_with_publication_context(
            self.snapshot(80),
            self.pattern,
            monthly_history=[100] * 8,
            pattern_history=[110] * 12,
            current_batch_prices=[80, 95],
        )

        self.assertTrue(result.metadata["public_fare_eligible"])
        self.assertIn("strong_monthly_discount", result.metadata["public_fare_reasons"])
        self.assertEqual(result.metadata["public_reference_scope"], "pattern_month")
        self.assertEqual(result.metadata["public_reference_price"], 100)

    def test_marks_near_departure_fare_up_to_five_percent_above_reference(self) -> None:
        result = self.scanner._snapshot_with_publication_context(
            self.snapshot(104, days_until_departure=14),
            self.pattern,
            monthly_history=[100] * 8,
            pattern_history=[],
            current_batch_prices=[95, 104],
        )

        self.assertTrue(result.metadata["public_fare_eligible"])
        self.assertIn("near_departure_at_fair_price", result.metadata["public_fare_reasons"])

    def test_keeps_only_monthly_lowest_when_other_rules_do_not_match(self) -> None:
        lowest = self.scanner._snapshot_with_publication_context(
            self.snapshot(100),
            self.pattern,
            monthly_history=[100, 101, 102, 103, 104, 105, 106, 107],
            pattern_history=[],
            current_batch_prices=[100, 120],
        )
        expensive = self.scanner._snapshot_with_publication_context(
            self.snapshot(120),
            self.pattern,
            monthly_history=[100, 101, 102, 103, 104, 105, 106, 107],
            pattern_history=[],
            current_batch_prices=[100, 120],
        )

        self.assertIn("lowest_pattern_month_price", lowest.metadata["public_fare_reasons"])
        self.assertFalse(expensive.metadata["public_fare_eligible"])

    def test_falls_back_to_exact_pattern_history_when_month_is_sparse(self) -> None:
        result = self.scanner._snapshot_with_publication_context(
            self.snapshot(85),
            self.pattern,
            monthly_history=[90, 95],
            pattern_history=[100] * 8,
            current_batch_prices=[85, 95],
        )

        self.assertEqual(result.metadata["public_reference_scope"], "pattern_all_months")
        self.assertEqual(result.metadata["public_reference_price"], 100)
        self.assertTrue(result.metadata["public_fare_eligible"])


if __name__ == "__main__":
    unittest.main()
