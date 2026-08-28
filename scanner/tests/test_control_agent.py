from __future__ import annotations

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


if __name__ == "__main__":
    unittest.main()
