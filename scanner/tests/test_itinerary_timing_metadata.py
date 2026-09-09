from __future__ import annotations

import unittest
from datetime import datetime
from types import SimpleNamespace

from luxflight_scanner.scanner import LuxFlightScanner


class ItineraryTimingMetadataTests(unittest.TestCase):
    @staticmethod
    def result(departure: str, arrival: str, duration: int) -> SimpleNamespace:
        leg = SimpleNamespace(
            departure_datetime=datetime.fromisoformat(departure),
            arrival_datetime=datetime.fromisoformat(arrival),
        )
        return SimpleNamespace(legs=[leg], duration=duration)

    def test_preserves_provider_durations_in_minutes(self) -> None:
        outbound = self.result("2026-11-08T07:10", "2026-11-08T08:45", 95)
        inbound = self.result("2026-11-15T19:30", "2026-11-15T21:05", 95)

        metadata = LuxFlightScanner._extract_itinerary_timing_metadata((outbound, inbound))

        self.assertIsNotNone(metadata)
        self.assertEqual(metadata["outbound_duration_minutes"], 95)
        self.assertEqual(metadata["return_duration_minutes"], 95)

    def test_rejects_non_positive_provider_duration(self) -> None:
        outbound = self.result("2026-11-08T07:10", "2026-11-08T08:45", 0)
        inbound = self.result("2026-11-15T19:30", "2026-11-15T21:05", 95)

        self.assertIsNone(LuxFlightScanner._extract_itinerary_timing_metadata((outbound, inbound)))


if __name__ == "__main__":
    unittest.main()
