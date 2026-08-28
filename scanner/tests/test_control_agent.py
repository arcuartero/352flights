from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from luxflight_scanner.control_agent import (
    ControlCommand,
    MacScannerControlAgent,
    read_lock_state,
)


class MacScannerControlAgentTests(unittest.TestCase):
    def test_stale_lock_is_not_reported_as_running(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            lock_dir = Path(directory)
            (lock_dir / "owner").write_text("price_scanner\n", encoding="utf-8")
            (lock_dir / "pid").write_text("999999999\n", encoding="utf-8")
            with patch("luxflight_scanner.control_agent.LOCK_DIR", lock_dir):
                owner, pid, active = read_lock_state()

        self.assertEqual(owner, "price_scanner")
        self.assertEqual(pid, 999999999)
        self.assertFalse(active)

    def test_start_uses_the_installed_launch_agent(self) -> None:
        agent = MacScannerControlAgent.__new__(MacScannerControlAgent)
        agent.gui_domain = "gui/501"
        completed = Mock(returncode=0, stderr="", stdout="")
        with (
            patch("luxflight_scanner.control_agent.read_lock_state", return_value=(None, None, False)),
            patch("luxflight_scanner.control_agent.subprocess.run", return_value=completed) as run,
        ):
            result = agent.start_price_scanner()

        self.assertEqual(result["reason"], "started")
        run.assert_called_once()
        self.assertEqual(
            run.call_args.args[0],
            [
                "launchctl",
                "kickstart",
                "gui/501/com.luxcheapflights.scanner",
            ],
        )

    def test_heartbeat_only_does_not_claim_a_command(self) -> None:
        agent = MacScannerControlAgent.__new__(MacScannerControlAgent)
        agent.heartbeat = Mock()
        agent.claim_command = Mock()

        result = agent.run_once(claim_commands=False)

        self.assertIsNone(result)
        agent.heartbeat.assert_called_once_with()
        agent.claim_command.assert_not_called()

    def test_claimed_command_is_completed_once(self) -> None:
        command = ControlCommand(
            id="command-1",
            scanner_type="price_scanner",
            action="start",
            payload={},
        )
        agent = MacScannerControlAgent.__new__(MacScannerControlAgent)
        agent.heartbeat = Mock()
        agent.claim_command = Mock(return_value=command)
        agent.execute = Mock(return_value={"reason": "started"})
        agent.finish_command = Mock()

        with patch("luxflight_scanner.control_agent.time.sleep"):
            result = agent.run_once()

        self.assertEqual(result, command)
        agent.finish_command.assert_called_once_with(
            command,
            status="completed",
            result={"reason": "started"},
        )
        self.assertEqual(agent.heartbeat.call_count, 2)

    def test_live_progress_prefers_the_compact_file(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            state_path = root / "state.json"
            live_path = root / "live-progress.json"
            state_path.write_text(
                json.dumps({"price_scan_runs": [{"run_key": "run-1", "source": "full"}]}),
                encoding="utf-8",
            )
            live_path.write_text(
                json.dumps({"run_key": "run-1", "source": "compact"}),
                encoding="utf-8",
            )
            agent = MacScannerControlAgent.__new__(MacScannerControlAgent)
            agent.state_path = state_path
            agent.live_progress_path = live_path

            progress = agent._read_local_progress("run-1")

        self.assertEqual(progress and progress["source"], "compact")

    def test_publish_live_progress_backfills_route_details(self) -> None:
        agent = MacScannerControlAgent.__new__(MacScannerControlAgent)
        agent.client = Mock()
        agent._latest_running_mac_scan = Mock(
            return_value={
                "id": "db-run-1",
                "run_key": "run-1",
                "started_at": "2026-08-28T14:00:00+00:00",
                "sync_summary": {"preserved": True},
            }
        )
        agent._read_local_progress = Mock(
            return_value={
                "run_key": "run-1",
                "status": "running",
                "updated_at": "2026-08-28T15:00:00+00:00",
                "routes_started": 2,
                "routes_completed": 1,
                "routes": [{"route_label": "LUX -> MAD"}],
                "destinations": [{"destination_city": "Madrid"}],
                "recent_rules": [{"pattern_label": "Fri -> Sun"}],
            }
        )
        agent._live_log_state = Mock(
            return_value=(
                "LUX -> BCN",
                "Thu -> Sun",
                [{"id": "1", "timestamp": "2026-08-28T15:00:00Z", "label": "Rule", "detail": "Thu -> Sun", "tone": "progress"}],
            )
        )
        response = Mock()
        agent.client.patch.return_value = response

        published = agent.publish_live_progress()

        self.assertTrue(published)
        response.raise_for_status.assert_called_once_with()
        payload = agent.client.patch.call_args.kwargs["json"]
        self.assertTrue(payload["sync_summary"]["preserved"])
        self.assertEqual(payload["sync_summary"]["live_telemetry"]["current_route_label"], "LUX -> BCN")
        self.assertEqual(payload["routes"], [{"route_label": "LUX -> MAD"}])
        self.assertEqual(payload["destinations"], [{"destination_city": "Madrid"}])
        self.assertEqual(payload["patterns"], [{"pattern_label": "Fri -> Sun"}])

    def test_live_log_state_reports_current_route_rule_and_recent_events(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            log_path = Path(directory) / "scanner.log"
            log_path.write_text(
                "\n".join(
                    (
                        "[2026-08-28 15:00:00Z] Route start: 3/121 · LUX -> BCN (weekend_europe, 8 patterns)",
                        "[2026-08-28 15:00:01Z] Pattern start: 2/8 · LUX -> BCN Thu -> Sun",
                        "[2026-08-28 15:00:02Z] Calendar combinations saved: 2/8 · LUX -> BCN Thu -> Sun received 30, valid 12, inserted 12",
                        "[2026-08-28 15:00:03Z] Fare live sync: LUX -> BCN at EUR 49",
                    )
                ),
                encoding="utf-8",
            )
            agent = MacScannerControlAgent.__new__(MacScannerControlAgent)
            agent.log_path = log_path

            route, rule, events = agent._live_log_state(
                started_at="2026-08-28T14:59:00+00:00"
            )

        self.assertEqual(route, "LUX -> BCN")
        self.assertEqual(rule, "Thu -> Sun")
        self.assertEqual([event["label"] for event in events], ["Route", "Rule", "Calendar", "Price"])
        self.assertNotIn("pattern", " ".join(event["detail"].lower() for event in events))


if __name__ == "__main__":
    unittest.main()
