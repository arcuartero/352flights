from __future__ import annotations

import unittest
from datetime import date, datetime, timedelta, timezone

from luxflight_scanner.scanner import service_calendar_is_fresh


class ServiceCalendarFreshnessTests(unittest.TestCase):
    def setUp(self) -> None:
        self.now = datetime(2026, 8, 10, 10, 0, tzinfo=timezone.utc)
        self.required_months = [date(2026, 8, 1), date(2026, 9, 1)]

    def row(self, month_start: date, checked_at: datetime | None) -> dict[str, object]:
        return {
            "month_start": month_start.isoformat(),
            "last_checked_at": checked_at.isoformat() if checked_at else None,
        }

    def test_complete_calendar_checked_within_two_days_is_fresh(self) -> None:
        rows = [
            self.row(month, self.now - timedelta(hours=47))
            for month in self.required_months
        ]

        self.assertTrue(
            service_calendar_is_fresh(
                rows,
                self.required_months,
                fresh_hours=48,
                now=self.now,
            )
        )

    def test_old_calendar_is_not_fresh(self) -> None:
        rows = [
            self.row(month, self.now - timedelta(hours=49))
            for month in self.required_months
        ]

        self.assertFalse(
            service_calendar_is_fresh(
                rows,
                self.required_months,
                fresh_hours=48,
                now=self.now,
            )
        )

    def test_incomplete_calendar_is_not_fresh(self) -> None:
        rows = [self.row(self.required_months[0], self.now)]

        self.assertFalse(
            service_calendar_is_fresh(
                rows,
                self.required_months,
                fresh_hours=48,
                now=self.now,
            )
        )

    def test_calendar_without_check_timestamp_is_not_fresh(self) -> None:
        rows = [self.row(month, None) for month in self.required_months]

        self.assertFalse(
            service_calendar_is_fresh(
                rows,
                self.required_months,
                fresh_hours=48,
                now=self.now,
            )
        )


if __name__ == "__main__":
    unittest.main()
