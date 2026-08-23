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

    def test_live_checkpoint_does_not_resend_large_detail_arrays(self) -> None:
        store = object.__new__(SupabaseStore)
        store.write_attempts = 1
        store.retry_min_seconds = 0
        store.retry_max_seconds = 0
        store.price_scan_run_ids = {}
        store.client = MagicMock()
        response = MagicMock()
        response.status_code = 201
        response.is_success = True
        response.json.return_value = [{"id": "run-uuid"}]
        store.client.post.return_value = response

        run_id = store.save_scan_run_checkpoint(
            {
                "run_key": "run-123",
                "scanner_source": "vps",
                "status": "running",
                "started_at": "2026-08-23T06:00:00+00:00",
                "heartbeat_at": "2026-08-23T06:01:00+00:00",
                "routes_started": 2,
                "patterns_scanned": 25,
                "patterns": [{"large": "detail"}],
                "routes": [{"large": "detail"}],
                "destinations": [{"large": "detail"}],
            }
        )

        self.assertEqual(run_id, "run-uuid")
        payload = store.client.post.call_args.kwargs["json"]
        self.assertEqual(payload["heartbeat_at"], "2026-08-23T06:01:00+00:00")
        self.assertEqual(payload["patterns_scanned"], 25)
        self.assertNotIn("patterns", payload)
        self.assertNotIn("routes", payload)
        self.assertNotIn("destinations", payload)

    def test_retryable_supabase_response_is_retried(self) -> None:
        store = object.__new__(SupabaseStore)
        store.write_attempts = 2
        store.retry_min_seconds = 0
        store.retry_max_seconds = 0
        store.client = MagicMock()
        first = MagicMock(status_code=500)
        first.headers = {}
        second = MagicMock(status_code=201)
        second.headers = {}
        store.client.post.side_effect = [first, second]

        response = store._post_with_retry(
            "/rest/v1/price_scan_runs",
            operation_label="test",
            headers={},
            json={"run_key": "run-123"},
        )

        self.assertIs(response, second)
        self.assertEqual(store.client.post.call_count, 2)


if __name__ == "__main__":
    unittest.main()
