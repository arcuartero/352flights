import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


@unittest.skipUnless(shutil.which("zsh"), "Mac runner requires zsh")
class MacRunnerTests(unittest.TestCase):
    def run_runner(self, config=0, scan=0, sync=0):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            scripts = root / "scripts"
            scripts.mkdir()
            runner = scripts / "run-mac-scanner-with-sync.sh"
            source = Path(__file__).resolve().parents[2] / "scripts" / runner.name
            shutil.copyfile(source, runner)
            # Keep the test isolated from the real Mac-wide scanner lock.
            (scripts / "local-scanner-lock.zsh").write_text(
                "local_scanner_acquire_lock() { return 0; }\n"
                "local_scanner_release_lock() { return 0; }\n"
            )
            python = root / "scanner" / ".venv" / "bin" / "python"
            python.parent.mkdir(parents=True)
            python.write_text(
                '#!/bin/sh\n'
                'printf "%s\\n" "$*" >> "$TEST_CALLS"\n'
                'case "$*" in\n'
                ' *--pull-supabase-configuration*) exit "$TEST_CONFIG" ;;\n'
                ' *--sync-local-to-supabase*) exit "$TEST_SYNC" ;;\n'
                ' *) exit "$TEST_SCAN" ;;\n'
                'esac\n'
            )
            python.chmod(0o700)
            calls = root / "calls"
            result = subprocess.run(
                ["zsh", str(runner), "--limit", "1"],
                env={**os.environ, "TEST_CALLS": str(calls),
                     "TEST_CONFIG": str(config), "TEST_SCAN": str(scan),
                     "TEST_SYNC": str(sync)},
                capture_output=True, text=True,
            )
            return result.returncode, calls.read_text().splitlines()

    def test_refresh_before_scan_and_sync(self):
        status, calls = self.run_runner()
        self.assertEqual(status, 0)
        self.assertEqual(len(calls), 3)
        self.assertIn("--pull-supabase-configuration", calls[0])
        self.assertIn("--limit 1 --json", calls[1])
        self.assertIn("--sync-local-to-supabase", calls[2])

    def test_configuration_failure_does_not_start_scan(self):
        status, calls = self.run_runner(config=12)
        self.assertEqual(status, 12)
        self.assertEqual(len(calls), 1)

    def test_failed_scan_still_syncs_and_preserves_status(self):
        status, calls = self.run_runner(scan=69)
        self.assertEqual(status, 69)
        self.assertEqual(len(calls), 3)

    def test_sync_failure_is_not_reported_as_success(self):
        status, calls = self.run_runner(sync=7)
        self.assertEqual(status, 7)
        self.assertEqual(len(calls), 3)
