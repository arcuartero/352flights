from __future__ import annotations

import random
from types import SimpleNamespace
from unittest import TestCase

from luxflight_scanner.config import ScannerConfig
from luxflight_scanner.models import RouteSeed
from luxflight_scanner.scanner import LuxFlightScanner, ProviderUnavailableError


ERROR_13_BODY = (
    ")]}'\n\n"
    '[["wrb.fr",null,null,null,null,[13]],'
    '["di",32],["af.httprm",31,"test",5]]'
)


class StaticResponseClient:
    def __init__(self, body: str):
        self.response = SimpleNamespace(text=body, status_code=200)
        self.calls = 0

    def post(self, *_args, **_kwargs):
        self.calls += 1
        return self.response


class SequenceResponseClient:
    def __init__(self, bodies: list[str]):
        self.responses = iter(
            SimpleNamespace(text=body, status_code=200) for body in bodies
        )
        self.calls = 0

    def post(self, *_args, **_kwargs):
        self.calls += 1
        return next(self.responses)


def route(destination: str, city: str) -> RouteSeed:
    return RouteSeed(
        origin_airport="LUX",
        destination_airport=destination,
        destination_city=city,
        bucket="weekend_europe",
        trip_nights=3,
        lookahead_start_days=3,
        lookahead_end_days=250,
        max_stops="NON_STOP",
        teaser=city,
    )


def scanner_for_test(**config_overrides) -> LuxFlightScanner:
    scanner = LuxFlightScanner.__new__(LuxFlightScanner)
    scanner.config = ScannerConfig(
        search_http_min_interval_seconds=0,
        search_rate_limit_attempts=1,
        search_rate_limit_base_seconds=0,
        search_rate_limit_max_seconds=0,
        search_rate_limit_jitter_ratio=0,
        provider_error_attempts=3,
        provider_error_base_seconds=0,
        provider_error_max_seconds=0,
        search_pause_min_seconds=0,
        search_pause_max_seconds=0,
        provider_preflight_days_ahead=14,
        **config_overrides,
    )
    scanner.routes = [route("MAD", "Madrid"), route("CDG", "Paris")]
    scanner._random = random.Random(1)
    scanner._next_http_request_at = 0.0
    scanner._rate_limit_until = 0.0
    scanner._run_retry_counts = {}
    scanner._active_pattern_retry_key = None
    scanner._active_pattern_retry_label = None
    scanner._log_progress = lambda _message: None
    return scanner


class ProviderHealthTests(TestCase):
    def test_turns_google_rpc_error_13_into_provider_error(self) -> None:
        scanner = scanner_for_test()
        client = StaticResponseClient(ERROR_13_BODY)
        scanner._install_default_timeout(client)

        with self.assertRaisesRegex(
            ProviderUnavailableError,
            "internal RPC error 13",
        ):
            client.post(
                url=(
                    "https://www.google.com/_/FlightsFrontendUi/data/"
                    "travel.frontend.flights.FlightsFrontendService/GetShoppingResults"
                )
            )

        self.assertEqual(client.calls, 3)

    def test_retries_temporary_google_rpc_error_13(self) -> None:
        scanner = scanner_for_test()
        client = SequenceResponseClient(
            [ERROR_13_BODY, ")]}'\n\n[[\"wrb.fr\",null,\"[]\"]]"]
        )
        scanner._install_default_timeout(client)

        response = client.post(
            url=(
                "https://www.google.com/_/FlightsFrontendUi/data/"
                "travel.frontend.flights.FlightsFrontendService/GetShoppingResults"
            )
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(client.calls, 2)

    def test_does_not_inspect_unrelated_http_responses(self) -> None:
        scanner = scanner_for_test()
        client = StaticResponseClient("")
        scanner._install_default_timeout(client)

        response = client.post(url="https://example.test/health")

        self.assertEqual(response.status_code, 200)

    def test_preflight_stops_when_all_known_routes_are_empty(self) -> None:
        scanner = scanner_for_test()
        scanner._run_flight_search = lambda _filters, top_n: []

        with self.assertRaisesRegex(
            ProviderUnavailableError,
            "every canary route",
        ):
            scanner._assert_provider_available(context="test")

    def test_preflight_passes_when_one_known_route_has_data(self) -> None:
        scanner = scanner_for_test()
        responses = iter(([], [object()]))
        scanner._run_flight_search = lambda _filters, top_n: next(responses)

        scanner._assert_provider_available(context="test")

    def test_preflight_passes_when_one_canary_errors_and_another_has_data(self) -> None:
        scanner = scanner_for_test()
        responses = iter((ProviderUnavailableError("RPC error 13"), [object()]))

        def run_search(_filters, top_n):
            response = next(responses)
            if isinstance(response, Exception):
                raise response
            return response

        scanner._run_flight_search = run_search

        scanner._assert_provider_available(context="test")

    def test_empty_result_breaker_rechecks_provider_at_threshold(self) -> None:
        scanner = scanner_for_test(empty_result_breaker_threshold=20)
        contexts: list[str] = []
        scanner._assert_provider_available = lambda *, context: contexts.append(context)

        scanner._check_empty_result_breaker(19)
        scanner._check_empty_result_breaker(20)

        self.assertEqual(len(contexts), 1)
        self.assertIn("20 consecutive", contexts[0])
