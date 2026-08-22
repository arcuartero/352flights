from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock

from luxflight_scanner.models import SnapshotRecord
from luxflight_scanner.storage import LocalStore, SupabaseStore


class ScanRunSnapshotLinkTests(unittest.TestCase):
    def test_local_snapshot_keeps_its_scan_run_key(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            store = LocalStore(Path(temporary_directory) / "state.json")
            run_key = "run-123"
            store.save_scan_run({"run_key": run_key, "status": "running"})

            snapshot_id = store.save_snapshot(
                "LUX:MXP:NON_STOP",
                SnapshotRecord(
                    departure_date="2026-09-04",
                    return_date="2026-09-07",
                    trip_nights=3,
                    max_stops="NON_STOP",
                    price=49,
                    currency="EUR",
                    metadata={"pattern_key": "fri-mon-3"},
                ),
                scan_run_key=run_key,
            )

            snapshot = store.snapshot_by_id(snapshot_id)
            self.assertIsNotNone(snapshot)
            self.assertEqual(snapshot["scan_run_key"], run_key)

    def test_remote_snapshot_lookup_is_scoped_to_its_scan_run(self) -> None:
        store = object.__new__(SupabaseStore)
        store.price_scan_run_ids = {"run-new": "run-uuid-new"}
        store.client = MagicMock()
        response = MagicMock()
        response.json.return_value = []
        store.client.get.return_value = response

        result = store.find_synced_snapshot(
            "route-uuid",
            "874",
            scan_run_key="run-new",
        )

        self.assertIsNone(result)
        store.client.get.assert_called_once_with(
            "/rest/v1/price_snapshots",
            params={
                "route_id": "eq.route-uuid",
                "metadata->>local_snapshot_id": "eq.874",
                "select": "id",
                "limit": "1",
                "scan_run_id": "eq.run-uuid-new",
            },
        )
        response.raise_for_status.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
