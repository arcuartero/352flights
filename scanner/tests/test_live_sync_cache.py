import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock

from luxflight_scanner.sync import LocalSupabaseSync


class LiveSyncCacheTests(unittest.TestCase):
    def make_sync(self, root):
        sync = object.__new__(LocalSupabaseSync)
        sync.state_path = Path(root) / "state.json"
        sync.config = SimpleNamespace(storage_mode="local")
        sync.remote_route_ids = {}
        sync.routes_by_key = {"LUX:MAD:NON_STOP": SimpleNamespace(destination_city="Madrid")}
        sync.routes_by_legacy_key = {}
        sync.supabase = Mock()
        snapshot = {"id": "1", "route_id": "LUX:MAD:NON_STOP",
                    "sync": {"supabase_id": "remote-1", "synced_at": "2026-10-01T20:00:00Z"}}
        indicative = {"route_id": "LUX:MAD:NON_STOP",
                      "sync": {"synced_at": "2026-10-01T20:00:00Z"}}
        deal = {"snapshot_id": "1", "sync": {"supabase_id": "deal-1"}}
        sync.state_path.write_text(json.dumps({"snapshots": [snapshot],
                                              "indicative_prices": [indicative], "deals": [deal]}))
        sync._revalidate_public_destinations = Mock(
            side_effect=lambda cities: {"status": "revalidated" if cities else "skipped"}
        )
        return sync

    def test_live_records_invalidate_once_without_uploading_again(self):
        with tempfile.TemporaryDirectory() as root:
            sync = self.make_sync(root)
            report = sync.sync()
            self.assertEqual(report["snapshots_synced"], 0)
            self.assertEqual(report["snapshots_skipped"], 1)
            sync._revalidate_public_destinations.assert_called_once_with({"Madrid"})
            state = json.loads(sync.state_path.read_text())
            for collection in ("snapshots", "indicative_prices", "deals"):
                self.assertTrue(state[collection][0]["sync"]["cache_revalidated_at"])
            sync.sync()
            sync._revalidate_public_destinations.assert_called_with(set())
            self.assertEqual(sync.supabase.mock_calls, [])

    def test_failed_revalidation_retries_without_losing_pending_records(self):
        with tempfile.TemporaryDirectory() as root:
            sync = self.make_sync(root)
            sync._revalidate_public_destinations.side_effect = [
                {"status": "failed"}, {"status": "revalidated"}
            ]
            sync.sync()
            state = json.loads(sync.state_path.read_text())
            self.assertNotIn("cache_revalidated_at", state["snapshots"][0]["sync"])
            sync.sync()
            self.assertEqual(sync._revalidate_public_destinations.call_args_list[0].args, ({"Madrid"},))
            self.assertEqual(sync._revalidate_public_destinations.call_args_list[1].args, ({"Madrid"},))
            self.assertEqual(sync.supabase.mock_calls, [])
