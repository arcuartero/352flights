from __future__ import annotations

import random
from types import SimpleNamespace
from unittest import TestCase

from luxflight_scanner.config import ScannerConfig
from luxflight_scanner.scanner import LuxFlightScanner


class FakeRateLimitError(Exception):
    def __init__(self, retry_after: str | None = None):
        super().__init__("HTTP Error 429: Too Many Requests")
        self.response = SimpleNamespace(
            headers={"Retry-After": retry_after} if retry_after is not None else {}
        )


class EventuallySuccessfulClient:
    def __init__(self, failures: int):
        self.failures = failures
        self.calls = 0

    def post(self, *_args, **_kwargs):
        self.calls += 1
        if self.calls <= self.failures:
            raise FakeRateLimitError("0")
        return "ok"


def scanner_for_test(**config_overrides) -> LuxFlightScanner:
    scanner = LuxFlightScanner.__new__(LuxFlightScanner)
    config = {
        "search_http_min_interval_seconds": 0,
        "search_rate_limit_attempts": 3,
        "search_rate_limit_base_seconds": 0,
        "search_rate_limit_max_seconds": 0,
        "search_rate_limit_jitter_ratio": 0,
        **config_overrides,
    }
    scanner.config = ScannerConfig(**config)
    scanner._random = random.Random(1)
    scanner._next_http_request_at = 0.0
    scanner._rate_limit_until = 0.0
    scanner._run_retry_counts = {}
    scanner._active_pattern_retry_key = "LUX:LHR:weekend:fri-mon"
    scanner._active_pattern_retry_label = "1/1 · LUX -> LHR Fri -> Mon"
    return scanner


class RateLimitRetryTests(TestCase):
    def test_detects_nested_http_429(self) -> None:
        outer = RuntimeError("Search failed")
        outer.__cause__ = FakeRateLimitError()

        self.assertTrue(LuxFlightScanner._is_rate_limit_error(outer))

    def test_uses_retry_after_header(self) -> None:
        scanner = scanner_for_test()

        self.assertEqual(scanner._retry_after_seconds(FakeRateLimitError("45")), 45)

    def test_retries_rate_limit_and_records_each_retry(self) -> None:
        scanner = scanner_for_test()
        client = EventuallySuccessfulClient(failures=2)
        scanner._install_default_timeout(client)

        result = client.post("https://example.test")

        self.assertEqual(result, "ok")
        self.assertEqual(client.calls, 3)
        self.assertEqual(
            scanner._run_retry_counts["LUX:LHR:weekend:fri-mon"],
            2,
        )

    def test_stops_after_configured_attempts(self) -> None:
        scanner = scanner_for_test()
        client = EventuallySuccessfulClient(failures=5)
        scanner._install_default_timeout(client)

        with self.assertRaises(FakeRateLimitError):
            client.post("https://example.test")

        self.assertEqual(client.calls, 3)
        self.assertEqual(
            scanner._run_retry_counts["LUX:LHR:weekend:fri-mon"],
            2,
        )
