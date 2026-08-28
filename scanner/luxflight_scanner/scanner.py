from __future__ import annotations

import hashlib
import json
import random
import sys
import time
import uuid
from dataclasses import asdict, replace
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from functools import wraps
from statistics import median
from typing import Any, Iterable
from urllib.parse import urlencode

from luxflight_scanner.config import ScannerConfig
from luxflight_scanner.models import (
    DealCandidate,
    IndicativePriceRecord,
    PatternSelectionResult,
    RouteSeed,
    SearchPattern,
    SnapshotRecord,
)
from luxflight_scanner.run_summary import build_price_scan_run_summary
from luxflight_scanner.storage import LocalStore, SupabaseStore, create_store

try:
    from fli.models import (
        Airport,
        Airline,
        DateSearchFilters,
        FlightSearchFilters,
        FlightSegment,
        MaxStops,
        PassengerInfo,
        SeatType,
        TripType,
    )
    from fli.search import SearchDates, SearchFlights
except ImportError as exc:  # pragma: no cover - only triggers before deps are installed
    raise RuntimeError(
        "Scanner dependencies are missing. Run `uv sync` from the scanner directory first."
    ) from exc

GLOBAL_LOOKAHEAD_START_DAYS = 3
GLOBAL_LOOKAHEAD_END_DAYS = 250


def service_calendar_is_fresh(
    service_months: list[dict[str, Any]],
    required_month_starts: Iterable[date],
    *,
    fresh_hours: int,
    now: datetime | None = None,
) -> bool:
    required_months = {month.isoformat() for month in required_month_starts}
    if not required_months:
        return True

    rows_by_month = {
        str(row.get("month_start")): row
        for row in service_months
        if row.get("month_start")
    }
    if not required_months.issubset(rows_by_month):
        return False

    cutoff = (now or datetime.now(timezone.utc)) - timedelta(hours=max(fresh_hours, 0))
    for month_start in required_months:
        checked_at = rows_by_month[month_start].get("last_checked_at")
        if not isinstance(checked_at, str) or not checked_at.strip():
            return False
        try:
            parsed = datetime.fromisoformat(checked_at.replace("Z", "+00:00"))
        except ValueError:
            return False
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        if parsed <= cutoff:
            return False

    return True


def service_calendar_is_recent_success(
    service_months: list[dict[str, Any]],
    required_month_starts: Iterable[date],
    *,
    fresh_hours: int,
    now: datetime | None = None,
) -> bool:
    if not service_calendar_is_fresh(
        service_months,
        required_month_starts,
        fresh_hours=fresh_hours,
        now=now,
    ):
        return False

    return any(
        isinstance(row.get("departure_dates"), list) and bool(row["departure_dates"])
        for row in service_months
    )


def load_routes(config: ScannerConfig) -> list[RouteSeed]:
    with config.routes_path.open("r", encoding="utf-8") as file:
        payload = json.load(file)

    grouped_routes: dict[tuple[str, str, str], RouteSeed] = {}
    for item in payload:
        route_payload = dict(item)
        raw_patterns = route_payload.get("patterns")
        if isinstance(raw_patterns, list):
            route_payload["patterns"] = tuple(
                SearchPattern(**pattern)
                for pattern in raw_patterns
            )
        raw_buckets = route_payload.get("buckets")
        if isinstance(raw_buckets, list):
            route_payload["buckets"] = tuple(str(bucket) for bucket in raw_buckets)

        route = replace(
            RouteSeed(**route_payload),
            lookahead_start_days=GLOBAL_LOOKAHEAD_START_DAYS,
            lookahead_end_days=GLOBAL_LOOKAHEAD_END_DAYS,
        )
        identity = (route.origin_airport, route.destination_airport, route.max_stops)
        existing = grouped_routes.get(identity)
        if existing is None:
            grouped_routes[identity] = route
            continue

        merged_patterns = existing.patterns
        if route.patterns:
            pattern_map = {
                pattern.key: pattern
                for pattern in (existing.patterns or ())
            }
            for pattern in route.patterns:
                pattern_map.setdefault(pattern.key, pattern)
            merged_patterns = tuple(pattern_map.values())

        grouped_routes[identity] = replace(
            existing,
            trip_nights=min(existing.trip_nights, route.trip_nights),
            min_trip_nights=min(existing.search_min_trip_nights, route.search_min_trip_nights),
            max_trip_nights=max(existing.search_max_trip_nights, route.search_max_trip_nights),
            lookahead_start_days=GLOBAL_LOOKAHEAD_START_DAYS,
            lookahead_end_days=GLOBAL_LOOKAHEAD_END_DAYS,
            patterns=merged_patterns,
            buckets=tuple(dict.fromkeys((*existing.supported_buckets, *route.supported_buckets))),
        )

    return list(grouped_routes.values())


def to_airport(code: str) -> Airport:
    return getattr(Airport, code.upper())


def to_max_stops(name: str) -> MaxStops:
    return getattr(MaxStops, name)


def format_money(price: float, currency: str) -> str:
    symbol = "EUR " if currency == "EUR" else f"{currency} "
    return f"{symbol}{price:,.0f}"


WEEKDAY_CODES = ("MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN")
ROUTING_LABELS = {
    "NON_STOP": "non-stop only",
    "ONE_STOP_OR_FEWER": "up to 1 stop",
    "TWO_OR_FEWER_STOPS": "up to 2 stops",
}
LOG_META_MARKER = " ||meta|| "

BUCKET_PATTERNS: dict[str, tuple[SearchPattern, ...]] = {
    "weekend_europe": (
        SearchPattern(
            key="thu-sat",
            label="Thu -> Sat",
            departure_weekday="THU",
            return_weekday="SAT",
            trip_nights=2,
        ),
        SearchPattern(
            key="thu-sun",
            label="Thu -> Sun",
            departure_weekday="THU",
            return_weekday="SUN",
            trip_nights=3,
        ),
        SearchPattern(
            key="thu-next-mon",
            label="Thu -> next Mon",
            departure_weekday="THU",
            return_weekday="MON",
            trip_nights=4,
        ),
        SearchPattern(
            key="fri-sun",
            label="Fri -> Sun",
            departure_weekday="FRI",
            return_weekday="SUN",
            trip_nights=2,
        ),
        SearchPattern(
            key="fri-next-mon",
            label="Fri -> next Mon",
            departure_weekday="FRI",
            return_weekday="MON",
            trip_nights=3,
        ),
    ),
    "long_haul": (
        SearchPattern(
            key="thu-next-sat",
            label="Thu -> next Sat",
            departure_weekday="THU",
            return_weekday="SAT",
            trip_nights=9,
        ),
        SearchPattern(
            key="thu-next-sun",
            label="Thu -> next Sun",
            departure_weekday="THU",
            return_weekday="SUN",
            trip_nights=10,
        ),
        SearchPattern(
            key="fri-next-sat",
            label="Fri -> next Sat",
            departure_weekday="FRI",
            return_weekday="SAT",
            trip_nights=8,
        ),
        SearchPattern(
            key="fri-next-sun",
            label="Fri -> next Sun",
            departure_weekday="FRI",
            return_weekday="SUN",
            trip_nights=9,
        ),
        SearchPattern(
            key="sat-next-sat",
            label="Sat -> next Sat",
            departure_weekday="SAT",
            return_weekday="SAT",
            trip_nights=7,
        ),
        SearchPattern(
            key="sat-next-sun",
            label="Sat -> next Sun",
            departure_weekday="SAT",
            return_weekday="SUN",
            trip_nights=8,
        ),
        SearchPattern(
            key="sun-next-sat",
            label="Sun -> next Sat",
            departure_weekday="SUN",
            return_weekday="SAT",
            trip_nights=6,
        ),
        SearchPattern(
            key="sun-next-sun",
            label="Sun -> next Sun",
            departure_weekday="SUN",
            return_weekday="SUN",
            trip_nights=7,
        ),
    ),
}

DISCOVERY_NIGHT_RANGES: dict[str, tuple[int, int]] = {
    "weekend_europe": (1, 5),
    "long_haul": (6, 13),
}

DISCOVERY_MAX_PATTERNS = 4
MIN_DESTINATION_STAY_HOURS = 24.0
LOG_META_MARKER = " ||meta|| "
EXTRA_NEXT_WEEKEND_DEPARTURE_WEEKDAYS = {"FRI", "SAT", "SUN"}
EXTRA_NEXT_WEEKEND_RETURN_WEEKDAYS = {"FRI", "SAT", "SUN"}
WEEKEND_MAX_NIGHTS = 4
PUBLIC_EXCEPTIONAL_PRICE_RATIO = 0.85
PUBLIC_BELOW_USUAL_PRICE_RATIO = 0.95
PUBLIC_TYPICAL_PRICE_RATIO = 1.05
PUBLIC_MONTHLY_DISCOUNT_RATIO = 0.88
PUBLIC_NEAR_DEPARTURE_RATIO = 1.05
PUBLIC_NEAR_DEPARTURE_DAYS = 30
PUBLIC_REFERENCE_MIN_POINTS = 8
PUBLIC_FARES_PER_EXACT_DATE_PAIR = 10
SCAN_RUN_CHECKPOINT_INTERVAL_SECONDS = 15


class NetworkOutageCircuitBreakerError(RuntimeError):
    """Raised when repeated network/DNS failures make the run non-actionable."""


class ProviderUnavailableError(RuntimeError):
    """Raised when the flight provider answers without usable flight data."""


class LuxFlightScanner:
    def __init__(self, config: ScannerConfig):
        self.config = config
        self.routes = load_routes(config)
        self.store = create_store(config)
        self.live_sync_store = (
            SupabaseStore(config)
            if (
                (
                    config.sync_snapshots_live
                    or config.sync_deals_live
                    or config.sync_scan_runs_live
                )
                and config.has_supabase_credentials
                and not config.use_supabase
            )
            else None
        )
        self.live_sync_remote_route_ids: dict[str, str] = {}
        self._run_retry_counts: dict[str, int] = {}
        self._provider_query_counts = {"calendar": 0, "exact": 0}
        self._random = random.Random()
        self._next_http_request_at = 0.0
        self._rate_limit_until = 0.0
        self._active_pattern_retry_key: str | None = None
        self._active_pattern_retry_label: str | None = None
        self._pattern_discovery_state: dict[str, Any] | None = None
        self.date_search = SearchDates()
        self.flight_search = SearchFlights()
        self._install_default_timeout(self.date_search.client)
        if self.flight_search.client is not self.date_search.client:
            self._install_default_timeout(self.flight_search.client)

    @staticmethod
    def _log_progress(message: str) -> None:
        timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{timestamp}Z] {message}", file=sys.stderr, flush=True)

    def _save_pattern_discovery_run(self, *, status: str, completed_at: datetime | None = None, error: str | None = None) -> None:
        state = self._pattern_discovery_state
        if state is None:
            return

        finished = completed_at or datetime.now(timezone.utc)
        report = state["report"]
        route_results = []
        destinations: set[str] = set()
        routes_started = state.get("routes_started", set())
        routes_completed = state.get("routes_completed", set())
        for item in report:
            route = item.get("route") if isinstance(item, dict) else None
            if not isinstance(route, dict):
                continue
            route_key = f"{route.get('origin_airport', '?')}:{route.get('destination_airport', '?')}:{route.get('max_stops', '?')}"
            destination = route.get("destination_city")
            if destination:
                destinations.add(str(destination))
            service_months = item.get("service_months")
            service_months = service_months if isinstance(service_months, list) else []
            departures = sum(
                len(month.get("departure_dates", []))
                for month in service_months
                if isinstance(month, dict) and isinstance(month.get("departure_dates"), list)
            )
            route_results.append({
                "route_key": route_key,
                "route_label": f"{route.get('origin_airport', '?')} -> {route.get('destination_airport', '?')}",
                "destination_city": destination,
                "status": item.get("status"),
                "service_months": len(service_months),
                "departures_detected": departures,
                "cadence_changes": len(item.get("cadence_changes", [])) if isinstance(item.get("cadence_changes"), list) else 0,
                "error": item.get("error"),
            })

        summary = {
            "run_key": state["run_key"],
            "scanner_source": self.config.scanner_source,
            "status": status,
            "started_at": state["started_at"].isoformat(),
            "completed_at": completed_at.isoformat() if completed_at else None,
            "duration_ms": max(round((finished - state["started_at"]).total_seconds() * 1000), 0),
            "routes_planned": state["routes_planned"],
            "routes_started": len(routes_started),
            "routes_completed": len(routes_completed),
            "destinations_scanned": len(destinations),
            "service_months_scanned": sum(item["service_months"] for item in route_results),
            "departures_detected": sum(item["departures_detected"] for item in route_results),
            "cadence_changes": sum(item["cadence_changes"] for item in route_results),
            "no_dates_found": sum(1 for item in report if item.get("status") == "service_calendar_error" or (item.get("status") == "uses_defaults" and not item.get("service_months"))),
            "skipped_complete": sum(1 for item in report if item.get("status") == "service_calendar_already_complete"),
            "hard_errors": sum(1 for item in report if item.get("status") in {"error", "service_calendar_error"}),
            "routes": route_results,
            "error": error,
        }
        try:
            self.store.save_date_scan_run(summary)
        except Exception as persistence_error:  # pragma: no cover - depends on storage availability
            self._log_progress(f"Date scan summary persistence failed: {persistence_error}")

    def _pattern_discovery_checkpoint(self) -> None:
        self._save_pattern_discovery_run(status="running")

    def _mark_pattern_route_completed(self, route: RouteSeed) -> None:
        if self._pattern_discovery_state is not None:
            self._pattern_discovery_state["routes_completed"].add(route.key)

    def _live_sync_remote_route_id(self, route: RouteSeed) -> str | None:
        if self.live_sync_store is None:
            return None

        if route.key not in self.live_sync_remote_route_ids:
            self.live_sync_remote_route_ids[route.key] = self.live_sync_store.ensure_route(route)

        return self.live_sync_remote_route_ids[route.key]

    @staticmethod
    def _snapshot_for_live_sync(
        local_route_id: str,
        local_snapshot_id: str,
        local_snapshot: dict[str, Any],
        snapshot: SnapshotRecord,
    ) -> SnapshotRecord:
        metadata = {
            **snapshot.metadata,
            "sync_source": "local_state_live",
            "local_route_id": local_route_id,
            "local_snapshot_id": str(local_snapshot_id),
            "local_scanned_at": local_snapshot.get("scanned_at"),
        }

        return SnapshotRecord(
            departure_date=snapshot.departure_date,
            return_date=snapshot.return_date,
            trip_nights=snapshot.trip_nights,
            max_stops=snapshot.max_stops,
            price=snapshot.price,
            currency=snapshot.currency,
            metadata=metadata,
        )

    def _sync_snapshot_live(
        self,
        route: RouteSeed,
        local_route_id: str,
        local_snapshot_id: str,
        snapshot: SnapshotRecord,
        candidate: DealCandidate | None,
        scan_run_key: str,
    ) -> None:
        should_sync_snapshot = self.config.sync_snapshots_live or (
            candidate is not None and self.config.sync_deals_live
        )
        if (
            not should_sync_snapshot
            or self.live_sync_store is None
            or not isinstance(self.store, LocalStore)
        ):
            return

        try:
            local_snapshot = self.store.snapshot_by_id(local_snapshot_id)
            if local_snapshot is None:
                raise RuntimeError(f"Missing local snapshot {local_snapshot_id!r}.")

            remote_route_id = self._live_sync_remote_route_id(route)
            if remote_route_id is None:
                return

            remote_snapshot_id = self.live_sync_store.find_synced_snapshot(
                remote_route_id,
                local_snapshot_id,
                scan_run_key=scan_run_key,
            )
            if remote_snapshot_id is None:
                remote_snapshot_id = self.live_sync_store.save_snapshot(
                    remote_route_id,
                    self._snapshot_for_live_sync(
                        local_route_id,
                        local_snapshot_id,
                        local_snapshot,
                        snapshot,
                    ),
                    scanned_at=local_snapshot.get("scanned_at"),
                    scan_run_key=scan_run_key,
                )

            self.store.mark_snapshot_synced(local_snapshot_id, remote_snapshot_id)

            if candidate is not None and self.config.sync_deals_live:
                remote_deal_id = self.live_sync_store.find_deal_by_snapshot_id(remote_snapshot_id)
                if remote_deal_id is None:
                    self.live_sync_store.save_deal(remote_route_id, remote_snapshot_id, candidate)
                    remote_deal_id = (
                        self.live_sync_store.find_deal_by_snapshot_id(remote_snapshot_id)
                        or "created"
                    )

                self.store.mark_deal_synced(
                    local_snapshot_id,
                    remote_deal_id,
                    remote_snapshot_id,
                )
                sync_label = "Deal"
            else:
                sync_label = "Fare"

            self._log_progress(
                f"{sync_label} live sync: {route.origin_airport} -> "
                f"{route.destination_airport} at {snapshot.currency} {snapshot.price:.0f}"
            )
        except Exception as error:  # pragma: no cover - depends on live Supabase
            self._log_progress(
                f"Fare live sync failed: {route.origin_airport} -> {route.destination_airport} "
                f"at {snapshot.currency} {snapshot.price:.0f} ({error})"
            )

    @staticmethod
    def _log_meta_suffix(payload: dict[str, object] | None) -> str:
        if not payload:
            return ""

        return f"{LOG_META_MARKER}{json.dumps(payload, separators=(',', ':'), default=str)}"

    @staticmethod
    def _request_url(args: tuple[Any, ...], kwargs: dict[str, Any]) -> str:
        value = kwargs.get("url")
        if value is None and args:
            value = args[0]
        return str(value or "")

    @classmethod
    def _raise_for_empty_provider_response(
        cls,
        response: object,
        args: tuple[Any, ...],
        kwargs: dict[str, Any],
    ) -> None:
        """Turn Google Flights' HTTP-200 RPC failures into real scanner errors."""
        request_url = cls._request_url(args, kwargs)
        if "FlightsFrontendService" not in request_url:
            return

        body = getattr(response, "text", None)
        if not isinstance(body, str):
            return
        if not body.strip():
            raise ProviderUnavailableError(
                "Flight provider returned an empty response body."
            )

        try:
            payload = json.loads(body.lstrip(")]}'\n\r "))
        except (TypeError, ValueError):
            return

        if not isinstance(payload, list) or not payload:
            return
        rpc_row = payload[0]
        if not isinstance(rpc_row, list) or not rpc_row or rpc_row[0] != "wrb.fr":
            return

        rpc_result = rpc_row[2] if len(rpc_row) > 2 else None
        rpc_status = rpc_row[5] if len(rpc_row) > 5 else None
        rpc_error_code = (
            rpc_status[0]
            if isinstance(rpc_status, list) and rpc_status
            else None
        )
        if rpc_result not in (None, "") or not isinstance(rpc_error_code, int):
            return
        if rpc_error_code <= 0:
            return

        raise ProviderUnavailableError(
            "Flight provider returned no usable payload "
            f"(Google Flights internal RPC error {rpc_error_code})."
        )

    def _install_default_timeout(self, client: object) -> None:
        if getattr(client, "_luxcheapflights_timeout_patched", False):
            return

        timeout_seconds = self.config.search_request_timeout_seconds

        # fli can make several raw requests inside one round-trip search. Pace the
        # underlying session so those internal requests cannot arrive as a burst.
        raw_client = getattr(client, "_client", None)
        if raw_client is not None and not getattr(
            raw_client,
            "_luxcheapflights_pacing_patched",
            False,
        ):
            for method_name in ("get", "post"):
                original_raw = getattr(raw_client, method_name, None)
                if original_raw is None:
                    continue

                @wraps(original_raw)
                def paced_request(
                    *args: Any,
                    __original: Any = original_raw,
                    **kwargs: Any,
                ) -> Any:
                    self._wait_for_http_request_slot()
                    kwargs.setdefault("timeout", timeout_seconds)
                    return __original(*args, **kwargs)

                setattr(raw_client, method_name, paced_request)

            setattr(raw_client, "_luxcheapflights_pacing_patched", True)

        for method_name in ("get", "post"):
            original = getattr(client, method_name, None)
            if original is None:
                continue

            @wraps(original)
            def with_timeout_and_rate_limit_retry(
                *args: Any,
                __original: Any = original,
                **kwargs: Any,
            ) -> Any:
                kwargs.setdefault("timeout", timeout_seconds)
                rate_limit_attempts = max(1, self.config.search_rate_limit_attempts)
                provider_error_attempts = max(1, self.config.provider_error_attempts)
                attempts = max(rate_limit_attempts, provider_error_attempts)

                for attempt in range(1, attempts + 1):
                    try:
                        response = __original(*args, **kwargs)
                        self._raise_for_empty_provider_response(response, args, kwargs)
                        return response
                    except Exception as error:
                        is_rate_limited = self._is_rate_limit_error(error)
                        is_provider_error = self._is_provider_unavailable_error(error)
                        allowed_attempts = (
                            rate_limit_attempts
                            if is_rate_limited
                            else provider_error_attempts
                            if is_provider_error
                            else 1
                        )
                        if attempt >= allowed_attempts:
                            raise

                        delay = (
                            self._rate_limit_retry_delay(error, attempt)
                            if is_rate_limited
                            else self._provider_error_retry_delay(attempt)
                        )
                        self._rate_limit_until = max(
                            self._rate_limit_until,
                            time.monotonic() + delay,
                        )
                        self._record_rate_limit_retry()
                        context = (
                            f" · {self._active_pattern_retry_label}"
                            if self._active_pattern_retry_label
                            else ""
                        )
                        if is_rate_limited:
                            message = "Search rate limited (HTTP 429)"
                        else:
                            message = "Temporary provider response failure"
                        self._log_progress(
                            f"{message}: pausing {delay:.0f}s before attempt "
                            f"{attempt + 1}/{allowed_attempts}{context}"
                        )

                raise RuntimeError("Unreachable rate-limit retry state.")

            setattr(client, method_name, with_timeout_and_rate_limit_retry)

        setattr(client, "_luxcheapflights_timeout_patched", True)

    def _wait_for_http_request_slot(self) -> None:
        wait_until = max(self._next_http_request_at, self._rate_limit_until)
        delay = wait_until - time.monotonic()
        if delay > 0:
            time.sleep(delay)

        interval = max(0.0, self.config.search_http_min_interval_seconds)
        self._next_http_request_at = time.monotonic() + interval

    @staticmethod
    def _exception_chain(error: BaseException) -> list[BaseException]:
        chain: list[BaseException] = []
        current: BaseException | None = error
        seen: set[int] = set()
        while current is not None and id(current) not in seen:
            seen.add(id(current))
            chain.append(current)
            current = current.__cause__ or current.__context__
        return chain

    @classmethod
    def _is_rate_limit_error(cls, error: BaseException) -> bool:
        markers = (
            "http error 429",
            "status code 429",
            "too many requests",
            "rate limit",
            "ratelimit",
        )
        return any(
            marker in str(item).lower()
            for item in cls._exception_chain(error)
            for marker in markers
        )

    @classmethod
    def _retry_after_seconds(cls, error: BaseException) -> float | None:
        for item in cls._exception_chain(error):
            response = getattr(item, "response", None)
            headers = getattr(response, "headers", None)
            if headers is None:
                continue
            value = headers.get("Retry-After") or headers.get("retry-after")
            if value is None:
                continue
            try:
                return max(0.0, float(value))
            except (TypeError, ValueError):
                try:
                    retry_at = parsedate_to_datetime(str(value))
                    if retry_at.tzinfo is None:
                        retry_at = retry_at.replace(tzinfo=timezone.utc)
                    return max(
                        0.0,
                        (retry_at - datetime.now(timezone.utc)).total_seconds(),
                    )
                except (TypeError, ValueError, OverflowError):
                    continue
        return None

    def _rate_limit_retry_delay(self, error: BaseException, attempt: int) -> float:
        maximum = max(0.0, self.config.search_rate_limit_max_seconds)
        retry_after = self._retry_after_seconds(error)
        if retry_after is not None:
            return retry_after

        base = max(0.0, self.config.search_rate_limit_base_seconds)
        delay = base * (2 ** max(0, attempt - 1))
        if maximum > 0:
            delay = min(delay, maximum)
        jitter_ratio = max(0.0, self.config.search_rate_limit_jitter_ratio)
        if delay > 0 and jitter_ratio > 0:
            delay += self._random.uniform(0.0, delay * jitter_ratio)
        return delay

    def _provider_error_retry_delay(self, attempt: int) -> float:
        base = max(0.0, self.config.provider_error_base_seconds)
        maximum = max(0.0, self.config.provider_error_max_seconds)
        delay = base * (2 ** max(0, attempt - 1))
        if maximum > 0:
            delay = min(delay, maximum)
        jitter_ratio = max(0.0, self.config.search_rate_limit_jitter_ratio)
        if delay > 0 and jitter_ratio > 0:
            delay += self._random.uniform(0.0, delay * jitter_ratio)
        return delay

    def _record_rate_limit_retry(self) -> None:
        if not self._active_pattern_retry_key:
            return
        self._run_retry_counts[self._active_pattern_retry_key] = (
            self._run_retry_counts.get(self._active_pattern_retry_key, 0) + 1
        )

    def _sleep_with_jitter(self, min_seconds: float, max_seconds: float) -> None:
        safe_min = max(0.0, float(min_seconds))
        safe_max = max(0.0, float(max_seconds))
        if safe_max <= 0:
            return
        if safe_max < safe_min:
            safe_min, safe_max = safe_max, safe_min

        delay = safe_max if safe_min == safe_max else self._random.uniform(safe_min, safe_max)
        if delay > 0:
            time.sleep(delay)

    def _pause_between_searches(self) -> None:
        self._sleep_with_jitter(
            self.config.search_pause_min_seconds,
            self.config.search_pause_max_seconds,
        )

    def _pause_between_routes(self) -> None:
        self._sleep_with_jitter(
            self.config.route_pause_min_seconds,
            self.config.route_pause_max_seconds,
        )

    def _run_date_search(self, filters: DateSearchFilters) -> list[object]:
        self._provider_query_counts["calendar"] += 1
        self._pause_between_searches()
        try:
            return self.date_search.search(filters) or []
        except Exception as error:
            if self._is_provider_unavailable_error(error):
                raise ProviderUnavailableError(
                    self._provider_unavailable_message(error)
                ) from error
            raise

    def _run_flight_search(
        self,
        filters: FlightSearchFilters,
        *,
        top_n: int,
    ) -> list[object]:
        self._provider_query_counts["exact"] += 1
        self._pause_between_searches()
        try:
            return self.flight_search.search(filters, top_n=top_n) or []
        except Exception as error:
            if self._is_provider_unavailable_error(error):
                raise ProviderUnavailableError(
                    self._provider_unavailable_message(error)
                ) from error
            raise

    @classmethod
    def _is_provider_unavailable_error(cls, error: BaseException) -> bool:
        markers = (
            "provider returned an empty response",
            "provider returned no usable payload",
            "google flights internal rpc error",
        )
        return any(
            isinstance(item, ProviderUnavailableError)
            or any(marker in str(item).lower() for marker in markers)
            for item in cls._exception_chain(error)
        )

    @classmethod
    def _provider_unavailable_message(cls, error: BaseException) -> str:
        for item in cls._exception_chain(error):
            if isinstance(item, ProviderUnavailableError):
                return str(item)
        return str(error)

    @staticmethod
    def _is_timeout_error(error: Exception) -> bool:
        current: BaseException | None = error
        inspected_messages: list[str] = []

        while current is not None:
            inspected_messages.append(str(current).lower())
            current = current.__cause__ or current.__context__

        timeout_markers = (
            "timed out",
            "timeout",
            "curl: (28)",
            "readtimeout",
            "connecttimeout",
        )
        return any(marker in message for message in inspected_messages for marker in timeout_markers)

    @staticmethod
    def _is_network_outage_error(error: Exception) -> bool:
        current: BaseException | None = error
        inspected_messages: list[str] = []

        while current is not None:
            inspected_messages.append(str(current).lower())
            current = current.__cause__ or current.__context__

        network_markers = (
            "could not resolve host",
            "nodename nor servname provided, or not known",
            "temporary failure in name resolution",
            "name or service not known",
            "resolving timed out",
            "network is unreachable",
            "no route to host",
            "failed to establish a new connection",
            "connection reset by peer",
            "remote end closed connection",
            "dns",
        )
        return any(marker in message for message in inspected_messages for marker in network_markers)

    def _classify_error_type(self, error: Exception) -> str:
        if self._is_provider_unavailable_error(error):
            return "provider_unavailable"
        if self._is_network_outage_error(error):
            return "network_outage"
        if self._is_timeout_error(error):
            return "timeout"
        if self._is_rate_limit_error(error):
            return "rate_limited"
        return "hard_error"

    @staticmethod
    def _error_log_prefix(error_type: str) -> str:
        if error_type == "provider_unavailable":
            return "Provider unavailable"
        if error_type == "timeout":
            return "Pattern timed out"
        if error_type == "network_outage":
            return "Pattern network outage"
        if error_type == "rate_limited":
            return "Pattern rate limited"
        return "Pattern hard error"

    def _trip_network_outage_breaker_if_needed(
        self,
        consecutive_failures: int,
        latest_error: Exception,
    ) -> None:
        threshold = self.config.network_outage_breaker_threshold
        if threshold <= 0 or consecutive_failures < threshold:
            return

        message = (
            "Network/DNS outage circuit breaker opened after "
            f"{consecutive_failures} consecutive failures: {latest_error}"
        )
        self._log_progress(f"Scanner circuit breaker opened: {message}")
        raise NetworkOutageCircuitBreakerError(message) from latest_error

    def _provider_canary_routes(self) -> list[RouteSeed]:
        preferred = [
            value.strip().upper()
            for value in self.config.provider_preflight_destinations.split(",")
            if value.strip()
        ]
        selected: list[RouteSeed] = []
        selected_keys: set[str] = set()
        for destination in preferred:
            route = next(
                (
                    item
                    for item in self.routes
                    if item.destination_airport == destination
                ),
                None,
            )
            if route is not None and route.key not in selected_keys:
                selected.append(route)
                selected_keys.add(route.key)

        if selected:
            return selected

        for route in self.routes:
            if route.key in selected_keys:
                continue
            selected.append(route)
            selected_keys.add(route.key)
            if len(selected) >= 2:
                break
        return selected

    def _assert_provider_available(self, *, context: str) -> None:
        if not self.config.provider_preflight_enabled:
            return

        canary_routes = self._provider_canary_routes()
        if not canary_routes:
            raise ProviderUnavailableError(
                "Flight provider health check has no configured canary routes."
            )

        travel_date = date.today() + timedelta(
            days=max(1, self.config.provider_preflight_days_ahead)
        )
        checked_labels: list[str] = []
        healthy_labels: list[str] = []
        check_errors: list[str] = []
        self._log_progress(
            "Provider preflight start: "
            f"{context} · {len(canary_routes)} canary route(s) for "
            f"{travel_date.isoformat()}"
        )

        for route in canary_routes:
            route_label = f"{route.origin_airport} -> {route.destination_airport}"
            checked_labels.append(route_label)
            try:
                results = self._run_flight_search(
                    self._build_service_calendar_flight_filters(
                        route,
                        travel_date=travel_date,
                        max_stops="ONE_STOP_OR_FEWER",
                    ),
                    top_n=1,
                )
            except ProviderUnavailableError as error:
                check_errors.append(f"{route_label}: {error}")
                continue
            except Exception as error:
                check_errors.append(f"{route_label}: {error}")
                continue

            if results:
                healthy_labels.append(route_label)

        if healthy_labels:
            self._log_progress(
                "Provider preflight passed: "
                f"{', '.join(healthy_labels)} returned usable flight data"
            )
            return

        detail = (
            f" Checked routes: {', '.join(checked_labels)}."
            if checked_labels
            else ""
        )
        if check_errors:
            detail += f" Technical checks: {'; '.join(check_errors)}."
        message = (
            "Flight provider returned no usable fares for every canary route."
            f"{detail}"
        )
        self._log_progress(f"Scanner provider unavailable: {message}")
        raise ProviderUnavailableError(message)

    def _check_empty_result_breaker(self, consecutive_empty_results: int) -> None:
        threshold = self.config.empty_result_breaker_threshold
        if threshold <= 0 or consecutive_empty_results < threshold:
            return

        self._log_progress(
            "Empty-result circuit breaker check: "
            f"{consecutive_empty_results} consecutive empty pattern results"
        )
        self._assert_provider_available(
            context=(
                "recheck after "
                f"{consecutive_empty_results} consecutive empty pattern results"
            )
        )

    def _pick_cheapest_for_pattern_with_retry(
        self,
        route: RouteSeed,
        pattern: SearchPattern,
        date_results_cache: dict[tuple[int, str, str | None, str | None], list[object]],
        service_month_rows: list[dict[str, object]],
        pattern_progress_label: str,
    ) -> PatternSelectionResult:
        attempts = 2
        retry_key = f"{route.key}:{pattern.key}"
        previous_retry_key = self._active_pattern_retry_key
        previous_retry_label = self._active_pattern_retry_label
        self._active_pattern_retry_key = retry_key
        self._active_pattern_retry_label = (
            f"{pattern_progress_label} · {route.origin_airport} -> "
            f"{route.destination_airport} {pattern.label}"
        )

        try:
            for attempt in range(1, attempts + 1):
                try:
                    return self._pick_cheapest_for_pattern(
                        route,
                        pattern,
                        date_results_cache,
                        service_month_rows,
                    )
                except Exception as error:
                    if attempt < attempts and self._is_timeout_error(error):
                        self._run_retry_counts[retry_key] = (
                            self._run_retry_counts.get(retry_key, 0) + 1
                        )
                        self._log_progress(
                            f"Pattern retry: {pattern_progress_label} · "
                            f"{route.origin_airport} -> {route.destination_airport} "
                            f"{pattern.label} after timeout (retrying once)"
                        )
                        continue

                    raise
        finally:
            self._active_pattern_retry_key = previous_retry_key
            self._active_pattern_retry_label = previous_retry_label

    @staticmethod
    def _log_meta_suffix(payload: dict[str, object] | None) -> str:
        if not payload:
            return ""

        return f"{LOG_META_MARKER}{json.dumps(payload, separators=(',', ':'), ensure_ascii=True)}"

    @staticmethod
    def _routing_label(max_stops: str) -> str:
        return ROUTING_LABELS.get(max_stops, max_stops.replace("_", " ").lower())

    @staticmethod
    def _parse_iso_date(value: str | None) -> date | None:
        if not value:
            return None

        return date.fromisoformat(value)

    @staticmethod
    def _month_start(value: date) -> date:
        return value.replace(day=1)

    @staticmethod
    def _month_end(value: date) -> date:
        if value.month == 12:
            return date(value.year + 1, 1, 1) - timedelta(days=1)
        return date(value.year, value.month + 1, 1) - timedelta(days=1)

    @staticmethod
    def _add_months(value: date, months: int) -> date:
        total = (value.year * 12 + value.month - 1) + months
        year = total // 12
        month = total % 12 + 1
        return date(year, month, 1)

    def _search_window_dates(
        self,
        route: RouteSeed,
        pattern: SearchPattern | None = None,
    ) -> tuple[date, date]:
        today = date.today()
        start_date = today + timedelta(days=route.lookahead_start_days)
        end_date = today + timedelta(days=route.lookahead_end_days)
        if pattern is not None:
            valid_from = self._parse_iso_date(pattern.valid_from)
            valid_until = self._parse_iso_date(pattern.valid_until)
            if valid_from is not None:
                start_date = max(start_date, valid_from)
            if valid_until is not None:
                end_date = min(end_date, valid_until)

        return start_date, end_date

    def _search_window_bounds(
        self,
        route: RouteSeed,
        pattern: SearchPattern | None = None,
    ) -> tuple[str, str]:
        start_date, end_date = self._search_window_dates(route, pattern)
        return start_date.isoformat(), end_date.isoformat()

    @staticmethod
    def _positive_price(value: object) -> float | None:
        if not isinstance(value, (int, float)):
            return None

        parsed = float(value)
        return parsed if parsed > 0 else None

    @staticmethod
    def _build_candidate_snapshot_from_result(
        route: RouteSeed,
        pattern: SearchPattern,
        result: object,
        max_stops: str,
        currency_code: str,
    ) -> SnapshotRecord | None:
        outbound_date = result.date[0].date()
        inbound_date = result.date[1].date() if len(result.date) > 1 else outbound_date
        trip_nights = (inbound_date - outbound_date).days

        if trip_nights <= 0:
            return None

        result_price = LuxFlightScanner._positive_price(getattr(result, "price", None))
        if result_price is None:
            return None

        return SnapshotRecord(
            departure_date=outbound_date.isoformat(),
            return_date=inbound_date.isoformat(),
            trip_nights=trip_nights,
            max_stops=max_stops,
            price=result_price,
            currency=currency_code,
            metadata={
                "origin_airport": route.origin_airport,
                "destination_airport": route.destination_airport,
                "destination_city": route.destination_city,
                "bucket": route.bucket,
                "buckets": list(route.supported_buckets),
                "search_min_trip_nights": route.search_min_trip_nights,
                "search_max_trip_nights": route.search_max_trip_nights,
                **LuxFlightScanner._pattern_metadata(pattern),
            },
        )

    @staticmethod
    def _indicative_routing_type(max_stops: str) -> str:
        return "direct" if max_stops == "NON_STOP" else "stops_allowed"

    def _indicative_prices_from_calendar_results(
        self,
        route: RouteSeed,
        pattern: SearchPattern,
        results: list[object],
        *,
        max_stops: str,
        observed_at: datetime | None = None,
    ) -> tuple[IndicativePriceRecord, ...]:
        observed = observed_at or datetime.now(timezone.utc)
        records: list[IndicativePriceRecord] = []
        seen_dates: set[tuple[str, str]] = set()
        for result in results:
            raw_dates = getattr(result, "date", ())
            if not raw_dates:
                continue
            outbound_date = raw_dates[0].date()
            inbound_date = raw_dates[1].date() if len(raw_dates) > 1 else outbound_date
            if not self._matches_pattern(outbound_date, inbound_date, pattern):
                continue
            price = self._positive_price(getattr(result, "price", None))
            if price is None:
                continue
            date_key = (outbound_date.isoformat(), inbound_date.isoformat())
            if date_key in seen_dates:
                continue
            seen_dates.add(date_key)
            records.append(
                IndicativePriceRecord(
                    origin_airport=route.origin_airport,
                    destination_airport=route.destination_airport,
                    rule_key=pattern.key,
                    rule_label=pattern.label,
                    departure_weekday=pattern.departure_weekday,
                    return_weekday=pattern.return_weekday,
                    departure_date=date_key[0],
                    return_date=date_key[1],
                    departure_month=outbound_date.replace(day=1).isoformat(),
                    trip_nights=(inbound_date - outbound_date).days,
                    max_stops=max_stops,
                    routing_type=self._indicative_routing_type(max_stops),
                    price=price,
                    currency=self.config.currency_code,
                    observed_at=observed.isoformat(),
                    days_until_departure=max((outbound_date - observed.date()).days, 0),
                    metadata={
                        "destination_city": route.destination_city,
                        "bucket": route.bucket,
                        "buckets": list(route.supported_buckets),
                        "price_source": "calendar_graph",
                    },
                )
            )
        return tuple(records)

    def _build_candidate_snapshot_from_itinerary(
        self,
        route: RouteSeed,
        pattern: SearchPattern,
        itinerary: object,
        departure_date: str,
        return_date: str,
    ) -> SnapshotRecord | None:
        itinerary_price = self._positive_price(self._itinerary_price(itinerary))
        if itinerary_price is None:
            return None

        airline_names = self._extract_airline_names(itinerary)
        airline_codes = self._extract_airline_codes(itinerary)
        timing_metadata = self._extract_itinerary_timing_metadata(itinerary) or {}

        metadata: dict[str, object] = {
            "origin_airport": route.origin_airport,
            "destination_airport": route.destination_airport,
            "destination_city": route.destination_city,
            "bucket": route.bucket,
            "buckets": list(route.supported_buckets),
            "search_min_trip_nights": route.search_min_trip_nights,
            "search_max_trip_nights": route.search_max_trip_nights,
            "airline_names": airline_names,
            "airline_codes": airline_codes,
            "shopping_price": itinerary_price,
            "price_source": "shopping_results",
            "skyscanner_url": self._build_skyscanner_url(route, departure_date, return_date),
            **self._pattern_metadata(pattern),
            **timing_metadata,
        }
        if airline_names:
            metadata["primary_airline"] = airline_names[0]
        if airline_codes:
            metadata["primary_airline_code"] = airline_codes[0]
        airline_summary = self._format_airline_summary(airline_names)
        if airline_summary:
            metadata["airline_summary"] = airline_summary

        return SnapshotRecord(
            departure_date=departure_date,
            return_date=return_date,
            trip_nights=pattern.trip_nights,
            max_stops=route.max_stops,
            price=itinerary_price,
            currency=self.config.currency_code,
            metadata=metadata,
        )

    def _build_cheapest_valid_snapshot_from_itineraries(
        self,
        route: RouteSeed,
        pattern: SearchPattern,
        itineraries: list[object],
        departure_date: str,
        return_date: str,
    ) -> SnapshotRecord | None:
        for itinerary in sorted(itineraries, key=self._itinerary_price):
            snapshot = self._build_candidate_snapshot_from_itinerary(
                route,
                pattern,
                itinerary,
                departure_date,
                return_date,
            )
            if snapshot is None:
                continue

            stay_hours = snapshot.metadata.get("destination_stay_hours")
            if isinstance(stay_hours, (int, float)) and float(stay_hours) < MIN_DESTINATION_STAY_HOURS:
                continue

            return snapshot

        return None

    def _build_no_result_diagnostic(
        self,
        route: RouteSeed,
        pattern: SearchPattern,
        reason_code: str,
        reason: str,
        snapshot: SnapshotRecord | None = None,
        metadata: dict[str, object] | None = None,
        max_stops_override: str | None = None,
    ) -> dict[str, object]:
        reason_labels = {
            "no_flights_found": "No flights",
            "more_stops_required": "More stops needed",
            "pattern_not_available": "Pattern unavailable",
            "outside_current_window": "Outside current scan window",
            "destination_stay_under_24h": "<24h in destination",
            "validation_rejected": "Validation rejected",
        }
        effective_max_stops = max_stops_override or route.max_stops
        route_variant = replace(route, max_stops=effective_max_stops) if effective_max_stops != route.max_stops else route
        search_window_start, search_window_end = self._search_window_bounds(route, pattern)

        diagnostic: dict[str, object] = {
            "reason_code": reason_code,
            "reason_label": reason_labels.get(reason_code, "Other"),
            "reason": reason,
            "route_label": f"{route.origin_airport} -> {route.destination_airport}",
            "destination_city": route.destination_city,
            "bucket": route.bucket,
            "buckets": list(route.supported_buckets),
            "routing": self._routing_label(effective_max_stops),
            "pattern_label": pattern.label,
            "trip_nights": pattern.trip_nights,
            "search_window_start": search_window_start,
            "search_window_end": search_window_end,
        }

        if snapshot is not None:
            diagnostic["departure_date"] = snapshot.departure_date
            diagnostic["return_date"] = snapshot.return_date
            diagnostic["price"] = snapshot.price
            diagnostic["currency"] = snapshot.currency
            diagnostic["skyscanner_url"] = self._build_skyscanner_url(
                route_variant,
                snapshot.departure_date,
                snapshot.return_date,
            )

        merged_metadata = {**(snapshot.metadata if snapshot else {}), **(metadata or {})}
        if merged_metadata.get("airline_summary"):
            diagnostic["airline_summary"] = merged_metadata["airline_summary"]
        if merged_metadata.get("outbound_departure_at"):
            diagnostic["outbound_departure_at"] = merged_metadata["outbound_departure_at"]
        if merged_metadata.get("outbound_arrival_at"):
            diagnostic["outbound_arrival_at"] = merged_metadata["outbound_arrival_at"]
        if merged_metadata.get("return_departure_at"):
            diagnostic["return_departure_at"] = merged_metadata["return_departure_at"]
        if merged_metadata.get("return_arrival_at"):
            diagnostic["return_arrival_at"] = merged_metadata["return_arrival_at"]
        if merged_metadata.get("destination_stay_hours") is not None:
            diagnostic["destination_stay_hours"] = merged_metadata["destination_stay_hours"]
        if merged_metadata.get("outbound_stop_count") is not None:
            diagnostic["outbound_stop_count"] = merged_metadata["outbound_stop_count"]
        if merged_metadata.get("return_stop_count") is not None:
            diagnostic["return_stop_count"] = merged_metadata["return_stop_count"]
        if merged_metadata.get("total_stop_count") is not None:
            diagnostic["total_stop_count"] = merged_metadata["total_stop_count"]
        if merged_metadata.get("shopping_price") is not None and diagnostic.get("price") is None:
            diagnostic["price"] = merged_metadata["shopping_price"]
            diagnostic["currency"] = self.config.currency_code
        if merged_metadata.get("skyscanner_url") and not diagnostic.get("skyscanner_url"):
            diagnostic["skyscanner_url"] = merged_metadata["skyscanner_url"]

        return diagnostic

    def _with_relaxed_routing_metadata(
        self,
        route: RouteSeed,
        snapshot: SnapshotRecord,
        metadata: dict[str, object] | None = None,
    ) -> SnapshotRecord:
        relaxed_route = replace(route, max_stops=snapshot.max_stops)
        return SnapshotRecord(
            departure_date=snapshot.departure_date,
            return_date=snapshot.return_date,
            trip_nights=snapshot.trip_nights,
            max_stops=snapshot.max_stops,
            price=snapshot.price,
            currency=snapshot.currency,
            metadata={
                **snapshot.metadata,
                "configured_max_stops": route.max_stops,
                "relaxed_from_max_stops": route.max_stops,
                "relaxed_to_max_stops": snapshot.max_stops,
                "routing_relaxed": True,
                "routing_relaxed_reason": (
                    f"No result with {self._routing_label(route.max_stops)}; "
                    f"saved the best {self._routing_label(snapshot.max_stops)} result."
                ),
                "skyscanner_url": self._build_skyscanner_url(
                    relaxed_route,
                    snapshot.departure_date,
                    snapshot.return_date,
                ),
                **(metadata or {}),
            },
        )

    def _exact_date_pairs_for_pattern(
        self,
        route: RouteSeed,
        pattern: SearchPattern,
        service_month_rows: list[dict[str, object]],
    ) -> list[tuple[str, str]]:
        if not service_month_rows:
            return []

        window_start, window_end = self._search_window_dates(route, pattern)
        pairs: list[tuple[str, str]] = []
        seen: set[tuple[str, str]] = set()

        for month in service_month_rows:
            for raw_departure_date in month.get("departure_dates") or []:
                try:
                    departure_date = date.fromisoformat(str(raw_departure_date))
                except ValueError:
                    continue

                if departure_date < window_start or departure_date > window_end:
                    continue

                return_date = departure_date + timedelta(days=pattern.trip_nights)
                if not self._matches_pattern(departure_date, return_date, pattern):
                    continue

                pair = (departure_date.isoformat(), return_date.isoformat())
                if pair in seen:
                    continue

                seen.add(pair)
                pairs.append(pair)

        return sorted(pairs)

    @staticmethod
    def _next_relaxed_max_stops(max_stops: str) -> str | None:
        if max_stops == "NON_STOP":
            return "ONE_STOP_OR_FEWER"
        if max_stops == "ONE_STOP_OR_FEWER":
            return "TWO_OR_FEWER_STOPS"
        return None

    def _build_filters(self, route: RouteSeed, pattern: SearchPattern) -> DateSearchFilters:
        return self._build_filters_for_max_stops(route, pattern, route.max_stops)

    def _build_filters_for_max_stops(
        self,
        route: RouteSeed,
        pattern: SearchPattern,
        max_stops: str,
    ) -> DateSearchFilters:
        start_date, end_date = self._search_window_dates(route, pattern)
        return_date = start_date + timedelta(days=pattern.trip_nights)

        origin = to_airport(route.origin_airport)
        destination = to_airport(route.destination_airport)

        return DateSearchFilters(
            trip_type=TripType.ROUND_TRIP,
            passenger_info=PassengerInfo(adults=1),
            flight_segments=[
                FlightSegment(
                    departure_airport=[[origin, 0]],
                    arrival_airport=[[destination, 0]],
                    travel_date=start_date.strftime("%Y-%m-%d"),
                ),
                FlightSegment(
                    departure_airport=[[destination, 0]],
                    arrival_airport=[[origin, 0]],
                    travel_date=return_date.strftime("%Y-%m-%d"),
                ),
            ],
            stops=to_max_stops(max_stops),
            seat_type=SeatType.ECONOMY,
            from_date=start_date.strftime("%Y-%m-%d"),
            to_date=end_date.strftime("%Y-%m-%d"),
            duration=pattern.trip_nights,
        )

    def _build_flight_filters(
        self,
        route: RouteSeed,
        departure_date: str,
        return_date: str,
        airline_codes: list[str] | None = None,
    ) -> FlightSearchFilters:
        origin = to_airport(route.origin_airport)
        destination = to_airport(route.destination_airport)
        airlines = None
        if airline_codes:
            airlines = [
                getattr(Airline, code)
                for code in airline_codes
                if hasattr(Airline, code)
            ] or None

        return FlightSearchFilters(
            trip_type=TripType.ROUND_TRIP,
            passenger_info=PassengerInfo(adults=1),
            flight_segments=[
                FlightSegment(
                    departure_airport=[[origin, 0]],
                    arrival_airport=[[destination, 0]],
                    travel_date=departure_date,
                ),
                FlightSegment(
                    departure_airport=[[destination, 0]],
                    arrival_airport=[[origin, 0]],
                    travel_date=return_date,
                ),
            ],
            stops=to_max_stops(route.max_stops),
            seat_type=SeatType.ECONOMY,
            airlines=airlines,
        )

    def _build_discovery_filters(
        self,
        route: RouteSeed,
        trip_nights: int,
        *,
        start_date: date,
        end_date: date,
        max_stops: str,
    ) -> DateSearchFilters:
        return_date = start_date + timedelta(days=trip_nights)

        origin = to_airport(route.origin_airport)
        destination = to_airport(route.destination_airport)

        return DateSearchFilters(
            trip_type=TripType.ROUND_TRIP,
            passenger_info=PassengerInfo(adults=1),
            flight_segments=[
                FlightSegment(
                    departure_airport=[[origin, 0]],
                    arrival_airport=[[destination, 0]],
                    travel_date=start_date.strftime("%Y-%m-%d"),
                ),
                FlightSegment(
                    departure_airport=[[destination, 0]],
                    arrival_airport=[[origin, 0]],
                    travel_date=return_date.strftime("%Y-%m-%d"),
                ),
            ],
            stops=to_max_stops(max_stops),
            seat_type=SeatType.ECONOMY,
            from_date=start_date.strftime("%Y-%m-%d"),
            to_date=end_date.strftime("%Y-%m-%d"),
            duration=trip_nights,
        )

    def _build_service_calendar_filters(
        self,
        route: RouteSeed,
        *,
        start_date: date,
        end_date: date,
        max_stops: str,
    ) -> DateSearchFilters:
        origin = to_airport(route.origin_airport)
        destination = to_airport(route.destination_airport)

        return DateSearchFilters(
            trip_type=TripType.ONE_WAY,
            passenger_info=PassengerInfo(adults=1),
            flight_segments=[
                FlightSegment(
                    departure_airport=[[origin, 0]],
                    arrival_airport=[[destination, 0]],
                    travel_date=start_date.strftime("%Y-%m-%d"),
                ),
            ],
            stops=to_max_stops(max_stops),
            seat_type=SeatType.ECONOMY,
            from_date=start_date.strftime("%Y-%m-%d"),
            to_date=end_date.strftime("%Y-%m-%d"),
        )

    def _build_service_calendar_flight_filters(
        self,
        route: RouteSeed,
        *,
        travel_date: date,
        max_stops: str,
    ) -> FlightSearchFilters:
        origin = to_airport(route.origin_airport)
        destination = to_airport(route.destination_airport)

        return FlightSearchFilters(
            trip_type=TripType.ONE_WAY,
            passenger_info=PassengerInfo(adults=1),
            flight_segments=[
                FlightSegment(
                    departure_airport=[[origin, 0]],
                    arrival_airport=[[destination, 0]],
                    travel_date=travel_date.strftime("%Y-%m-%d"),
                )
            ],
            stops=to_max_stops(max_stops),
            seat_type=SeatType.ECONOMY,
            # Deliberately unrestricted: a service date is valid when any
            # airline sells this route, not only the carrier from the latest
            # price snapshot shown in Active Routes.
            airlines=None,
        )

    def _build_service_calendar_return_filters(
        self,
        route: RouteSeed,
        *,
        start_date: date,
        end_date: date,
        max_stops: str,
    ) -> DateSearchFilters:
        origin = to_airport(route.destination_airport)
        destination = to_airport(route.origin_airport)

        return DateSearchFilters(
            trip_type=TripType.ONE_WAY,
            passenger_info=PassengerInfo(adults=1),
            flight_segments=[
                FlightSegment(
                    departure_airport=[[origin, 0]],
                    arrival_airport=[[destination, 0]],
                    travel_date=start_date.strftime("%Y-%m-%d"),
                ),
            ],
            stops=to_max_stops(max_stops),
            seat_type=SeatType.ECONOMY,
            from_date=start_date.strftime("%Y-%m-%d"),
            to_date=end_date.strftime("%Y-%m-%d"),
        )

    def _discover_departure_dates_for_route(
        self,
        route: RouteSeed,
        *,
        start_date: date,
        end_date: date,
        max_stops: str,
    ) -> list[date]:
        departure_dates: list[date] = []
        current_date = start_date

        while current_date <= end_date:
            results = self._run_flight_search(
                self._build_service_calendar_flight_filters(
                    route,
                    travel_date=current_date,
                    max_stops=max_stops,
                ),
                top_n=1,
            )
            if results:
                departure_dates.append(current_date)

            current_date += timedelta(days=1)

        return departure_dates

    def _discover_return_dates_for_route(
        self,
        route: RouteSeed,
        *,
        start_date: date,
        end_date: date,
        max_stops: str,
    ) -> list[date]:
        results = self._run_date_search(
            self._build_service_calendar_return_filters(
                route,
                start_date=start_date,
                end_date=end_date,
                max_stops=max_stops,
            )
        )

        return_dates = {
            item.date[0].date()
            for item in results
            if item.date
        }
        return sorted(return_dates)

    @staticmethod
    def _format_skyscanner_date(value: str) -> str:
        year, month, day = value.split("-")
        return f"{year[2:]}{month}{day}"

    @staticmethod
    def _to_skyscanner_place(code: str) -> str:
        city_overrides = {
            "LHR": "lond",
            "LGW": "lond",
        }
        return city_overrides.get(code.upper(), code.lower())

    @staticmethod
    def _build_skyscanner_stops(route: RouteSeed) -> str | None:
        if route.max_stops == "NON_STOP":
            return "!oneStop,!twoPlusStops"
        if route.max_stops == "ONE_STOP_OR_FEWER":
            return "!twoPlusStops"
        return None

    def _build_skyscanner_url(
        self,
        route: RouteSeed,
        departure_date: str,
        return_date: str,
    ) -> str:
        params = {
            "adultsv2": 1,
            "cabinclass": "economy",
            "childrenv2": "",
            "ref": "home",
            "rtn": 1,
            "outboundaltsenabled": "false",
            "inboundaltsenabled": "false",
            "preferdirects": str(route.max_stops == "NON_STOP").lower(),
        }
        stops = self._build_skyscanner_stops(route)
        if stops is not None:
            params["stops"] = stops

        query = urlencode(params)
        return (
            "https://www.skyscanner.net/transport/vols/"
            f"{self._to_skyscanner_place(route.origin_airport)}/"
            f"{self._to_skyscanner_place(route.destination_airport)}/"
            f"{self._format_skyscanner_date(departure_date)}/"
            f"{self._format_skyscanner_date(return_date)}/?{query}"
        )

    @staticmethod
    def _format_airline_summary(airline_names: list[str]) -> str | None:
        if not airline_names:
            return None

        if len(airline_names) <= 3:
            return ", ".join(airline_names)

        return ", ".join(airline_names[:3]) + f" + {len(airline_names) - 3} more"

    @staticmethod
    def _itinerary_price(itinerary: object) -> float:
        if isinstance(itinerary, tuple):
            return float(itinerary[-1].price)

        return float(itinerary.price)

    @staticmethod
    def _extract_airline_names(itinerary: object) -> list[str]:
        items = itinerary if isinstance(itinerary, tuple) else (itinerary,)
        airline_names: list[str] = []

        for result in items:
            for leg in result.legs:
                airline_name = leg.airline.value.strip()
                if airline_name and airline_name not in airline_names:
                    airline_names.append(airline_name)

        return airline_names

    @staticmethod
    def _extract_airline_codes(itinerary: object) -> list[str]:
        items = itinerary if isinstance(itinerary, tuple) else (itinerary,)
        airline_codes: list[str] = []

        for result in items:
            for leg in result.legs:
                airline_code = leg.airline.name.strip()
                if airline_code and airline_code not in airline_codes:
                    airline_codes.append(airline_code)

        return airline_codes

    @staticmethod
    def _serialize_datetime(value: datetime) -> str:
        return value.isoformat(timespec="minutes")

    @classmethod
    def _extract_itinerary_timing_metadata(cls, itinerary: object) -> dict[str, object] | None:
        if not isinstance(itinerary, tuple) or len(itinerary) < 2:
            return None

        outbound, inbound = itinerary
        if not outbound.legs or not inbound.legs:
            return None

        outbound_departure = outbound.legs[0].departure_datetime
        outbound_arrival = outbound.legs[-1].arrival_datetime
        return_departure = inbound.legs[0].departure_datetime
        return_arrival = inbound.legs[-1].arrival_datetime
        destination_stay_hours = round(
            (return_departure - outbound_arrival).total_seconds() / 3600,
            2,
        )
        outbound_stop_count = max(len(outbound.legs) - 1, 0)
        return_stop_count = max(len(inbound.legs) - 1, 0)

        return {
            "outbound_departure_at": cls._serialize_datetime(outbound_departure),
            "outbound_arrival_at": cls._serialize_datetime(outbound_arrival),
            "return_departure_at": cls._serialize_datetime(return_departure),
            "return_arrival_at": cls._serialize_datetime(return_arrival),
            "destination_stay_hours": destination_stay_hours,
            "outbound_stop_count": outbound_stop_count,
            "return_stop_count": return_stop_count,
            "total_stop_count": outbound_stop_count + return_stop_count,
        }

    def _fetch_airline_metadata(
        self,
        route: RouteSeed,
        departure_date: str,
        return_date: str,
    ) -> dict[str, object]:
        try:
            itineraries = self._run_flight_search(
                self._build_flight_filters(route, departure_date, return_date),
                top_n=3,
            )
        except Exception:
            return {}

        if not itineraries:
            return {}

        rejected_short_stays: list[float] = []
        cheapest_rejected_metadata: dict[str, object] | None = None
        cheapest_itinerary: object | None = None
        timing_metadata: dict[str, object] | None = None

        for itinerary in sorted(itineraries, key=self._itinerary_price):
            extracted_timing = self._extract_itinerary_timing_metadata(itinerary)
            if extracted_timing is None:
                continue

            stay_hours = extracted_timing.get("destination_stay_hours")
            if isinstance(stay_hours, (int, float)) and float(stay_hours) < MIN_DESTINATION_STAY_HOURS:
                rejected_short_stays.append(float(stay_hours))
                if cheapest_rejected_metadata is None:
                    rejected_metadata: dict[str, object] = {
                        "airline_names": self._extract_airline_names(itinerary),
                        "airline_codes": self._extract_airline_codes(itinerary),
                        "shopping_price": float(self._itinerary_price(itinerary)),
                        "price_source": "shopping_results",
                        **extracted_timing,
                    }
                    airline_summary = self._format_airline_summary(
                        [name for name in rejected_metadata["airline_names"] if isinstance(name, str)]
                    )
                    if airline_summary:
                        rejected_metadata["airline_summary"] = airline_summary
                    cheapest_rejected_metadata = rejected_metadata
                continue

            cheapest_itinerary = itinerary
            timing_metadata = extracted_timing
            break

        if cheapest_itinerary is None:
            if rejected_short_stays:
                return {
                    "itinerary_rejected": "destination_stay_under_24h",
                    "destination_stay_hours": min(rejected_short_stays),
                    **(cheapest_rejected_metadata or {}),
                }
            return {}

        airline_names = self._extract_airline_names(cheapest_itinerary)
        airline_codes = self._extract_airline_codes(cheapest_itinerary)
        if not airline_names:
            return {}

        shopping_price = self._positive_price(self._itinerary_price(cheapest_itinerary))
        metadata: dict[str, object] = {
            "airline_names": airline_names,
            "airline_codes": airline_codes,
            "primary_airline": airline_names[0],
            "primary_airline_code": airline_codes[0] if airline_codes else None,
            "price_source": "shopping_results",
            **(timing_metadata or {}),
        }
        if shopping_price is not None:
            metadata["shopping_price"] = shopping_price
        airline_summary = self._format_airline_summary(airline_names)
        if airline_summary:
            metadata["airline_summary"] = airline_summary
        metadata["skyscanner_url"] = self._build_skyscanner_url(route, departure_date, return_date)

        return metadata

    @staticmethod
    def _weekday_code(value: date) -> str:
        return WEEKDAY_CODES[value.weekday()]

    @staticmethod
    def _matches_pattern(
        departure_date: date,
        return_date: date,
        pattern: SearchPattern,
    ) -> bool:
        valid_from = LuxFlightScanner._parse_iso_date(pattern.valid_from)
        valid_until = LuxFlightScanner._parse_iso_date(pattern.valid_until)
        if valid_from is not None and departure_date < valid_from:
            return False
        if valid_until is not None and departure_date > valid_until:
            return False

        if LuxFlightScanner._weekday_code(departure_date) != pattern.departure_weekday:
            return False

        if LuxFlightScanner._weekday_code(return_date) != pattern.return_weekday:
            return False

        return (return_date - departure_date).days == pattern.trip_nights

    @staticmethod
    def _pattern_metadata(pattern: SearchPattern) -> dict[str, object]:
        metadata: dict[str, object] = {
            "pattern_key": pattern.key,
            "pattern_label": pattern.label,
            "pattern_departure_weekday": pattern.departure_weekday,
            "pattern_return_weekday": pattern.return_weekday,
        }
        if pattern.month_start is not None:
            metadata["pattern_month_start"] = pattern.month_start
        if pattern.valid_from is not None:
            metadata["pattern_valid_from"] = pattern.valid_from
        if pattern.valid_until is not None:
            metadata["pattern_valid_until"] = pattern.valid_until
        return metadata

    def _default_patterns_for_bucket(self, bucket: str) -> tuple[SearchPattern, ...]:
        patterns = BUCKET_PATTERNS.get(bucket)
        if patterns is None:
            raise ValueError(f"No search patterns configured for bucket {bucket!r}.")

        return patterns

    @staticmethod
    def _supports_weekend_stays(route: RouteSeed) -> bool:
        return route.search_min_trip_nights <= WEEKEND_MAX_NIGHTS

    @staticmethod
    def _supports_long_stays(route: RouteSeed) -> bool:
        return route.search_max_trip_nights > WEEKEND_MAX_NIGHTS

    def _default_patterns_for_route_seed(self, route: RouteSeed) -> tuple[SearchPattern, ...]:
        patterns: list[SearchPattern] = []

        if self._supports_weekend_stays(route):
            patterns.extend(BUCKET_PATTERNS["weekend_europe"])

        if self._supports_long_stays(route):
            patterns.extend(BUCKET_PATTERNS["long_haul"])

        filtered_patterns = [
            pattern
            for pattern in patterns
            if route.search_min_trip_nights <= pattern.trip_nights <= route.search_max_trip_nights
        ]

        if filtered_patterns:
            return tuple(filtered_patterns)

        return self._default_patterns_for_bucket(route.bucket)

    def _patterns_for_route(
        self,
        route: RouteSeed,
        route_id: str | None = None,
    ) -> tuple[SearchPattern, ...]:
        if route_id:
            window_start, window_end = self._search_window_dates(route)
            month_start_from = self._month_start(window_start).isoformat()
            month_start_to = self._month_start(window_end).isoformat()
            monthly_rule_rows = self.store.route_search_rules(
                route_id,
                month_start_from=month_start_from,
                month_start_to=month_start_to,
            )
            if monthly_rule_rows:
                monthly_patterns: list[SearchPattern] = []
                for row in monthly_rule_rows:
                    month_start = date.fromisoformat(str(row["month_start"]))
                    valid_from = max(window_start, month_start)
                    valid_until = min(window_end, self._month_end(month_start))
                    if valid_until < valid_from:
                        continue

                    monthly_patterns.append(
                        SearchPattern(
                            key=str(row["pattern_key"]),
                            label=str(row["pattern_label"]),
                            departure_weekday=str(row["departure_weekday"]),
                            return_weekday=str(row["return_weekday"]),
                            trip_nights=int(row["trip_nights"]),
                            valid_from=valid_from.isoformat(),
                            valid_until=valid_until.isoformat(),
                            month_start=month_start.isoformat(),
                        )
                    )

                if monthly_patterns:
                    return tuple(monthly_patterns)

        if route.patterns:
            return route.patterns

        return self._default_patterns_for_route_seed(route)

    def _pattern_discovery_end_days(self, route: RouteSeed) -> int:
        if self._supports_long_stays(route):
            return max(route.lookahead_end_days, self.config.long_haul_pattern_discovery_end_days)

        return max(route.lookahead_end_days, self.config.weekend_pattern_discovery_end_days)

    @staticmethod
    def _pattern_for_dates(outbound_date: date, inbound_date: date) -> SearchPattern:
        departure_weekday = LuxFlightScanner._weekday_code(outbound_date)
        return_weekday = LuxFlightScanner._weekday_code(inbound_date)
        trip_nights = (inbound_date - outbound_date).days
        spans_next_week = outbound_date.isocalendar()[:2] != inbound_date.isocalendar()[:2]
        departure_label = departure_weekday.title()
        return_label = return_weekday.title()
        label = (
            f"{departure_label} -> next {return_label}"
            if spans_next_week
            else f"{departure_label} -> {return_label}"
        )
        key = (
            f"{departure_weekday.lower()}-next-{return_weekday.lower()}"
            if spans_next_week
            else f"{departure_weekday.lower()}-{return_weekday.lower()}"
        )

        return SearchPattern(
            key=key,
            label=label,
            departure_weekday=departure_weekday,
            return_weekday=return_weekday,
            trip_nights=trip_nights,
        )

    def _discovery_night_range(self, route: RouteSeed) -> range:
        return range(route.search_min_trip_nights, route.search_max_trip_nights + 1)

    def _discovery_trip_nights(self, route: RouteSeed) -> tuple[int, ...]:
        trip_nights = set(self._discovery_night_range(route))

        if self._supports_weekend_stays(route):
            trip_nights.update((6, 7, 8, 9))

        return tuple(sorted(trip_nights))

    def _include_discovery_pattern(
        self,
        route: RouteSeed,
        outbound_date: date,
        inbound_date: date,
    ) -> bool:
        trip_nights = (inbound_date - outbound_date).days
        if trip_nights in self._discovery_night_range(route):
            return True

        if not self._supports_weekend_stays(route):
            return False

        departure_weekday = self._weekday_code(outbound_date)
        return_weekday = self._weekday_code(inbound_date)
        spans_next_week = outbound_date.isocalendar()[:2] != inbound_date.isocalendar()[:2]

        return (
            spans_next_week
            and departure_weekday in EXTRA_NEXT_WEEKEND_DEPARTURE_WEEKDAYS
            and return_weekday in EXTRA_NEXT_WEEKEND_RETURN_WEEKDAYS
        )

    def _discover_patterns_for_route(self, route: RouteSeed) -> tuple[list[SearchPattern], str]:
        observed: dict[str, dict[str, object]] = {}

        for trip_nights in self._discovery_trip_nights(route):
            today = date.today()
            discovery_end = today + timedelta(days=self._pattern_discovery_end_days(route))
            results = self._run_date_search(
                self._build_discovery_filters(
                    route,
                    trip_nights,
                    start_date=today,
                    end_date=discovery_end,
                    max_stops=route.max_stops,
                )
            )
            for result in results:
                outbound_date = result.date[0].date()
                inbound_date = result.date[1].date() if len(result.date) > 1 else outbound_date
                if (inbound_date - outbound_date).days != trip_nights:
                    continue
                if not self._include_discovery_pattern(route, outbound_date, inbound_date):
                    continue

                pattern = self._pattern_for_dates(outbound_date, inbound_date)
                bucket = observed.get(pattern.key)
                if bucket is None:
                    observed[pattern.key] = {
                        "pattern": pattern,
                        "count": 1,
                        "best_price": float(result.price),
                    }
                    continue

                bucket["count"] = int(bucket["count"]) + 1
                bucket["best_price"] = min(float(bucket["best_price"]), float(result.price))

        defaults = {pattern.key for pattern in self._default_patterns_for_route_seed(route)}
        if any(pattern_key in defaults for pattern_key in observed):
            return [], "uses_defaults"

        if not observed:
            return [], "no_supported_patterns"

        ranked = sorted(
            observed.values(),
            key=lambda item: (
                -int(item["count"]),
                float(item["best_price"]),
                str(item["pattern"].label),
            ),
        )

        return [item["pattern"] for item in ranked[:DISCOVERY_MAX_PATTERNS]], "override_saved"

    def _service_calendar_months(self) -> list[date]:
        first_month = self._month_start(date.today())
        return [
            self._add_months(first_month, month_index)
            for month_index in range(max(self.config.service_calendar_month_horizon, 1))
        ]

    def _sort_weekday_codes(self, values: set[str]) -> list[str]:
        return sorted(values, key=lambda item: WEEKDAY_CODES.index(item))

    def _service_calendar_routing_for_route(self, route: RouteSeed) -> str:
        return route.max_stops

    @staticmethod
    def _route_matches_filter(
        route: RouteSeed,
        route_filter: dict[str, str | None] | None,
    ) -> bool:
        if not route_filter:
            return True

        origin_airport = route_filter.get("origin_airport")
        destination_airport = route_filter.get("destination_airport")
        max_stops = route_filter.get("max_stops")

        if origin_airport and route.origin_airport != origin_airport:
            return False
        if destination_airport and route.destination_airport != destination_airport:
            return False
        if max_stops and route.max_stops != max_stops:
            return False

        return True

    def _discover_service_months_for_route(self, route: RouteSeed) -> list[dict[str, Any]]:
        month_starts = self._service_calendar_months()
        if not month_starts:
            return []

        routing = self._service_calendar_routing_for_route(route)
        observed_by_month: dict[str, dict[str, Any]] = {
            month_start.isoformat(): {
                "month_start": month_start.isoformat(),
                "departure_dates": set(),
                "departure_weekdays": set(),
            }
            for month_start in month_starts
        }

        for month_start in month_starts:
            month_key = month_start.isoformat()
            month_bucket = observed_by_month[month_key]
            month_window_start = max(date.today(), month_start)
            month_window_end = self._month_end(month_start)
            if month_window_end < month_window_start:
                continue

            direct_departure_dates = self._discover_departure_dates_for_route(
                route,
                start_date=month_window_start,
                end_date=month_window_end,
                max_stops=routing,
            )
            for outbound_date in direct_departure_dates:
                month_bucket["departure_dates"].add(outbound_date.isoformat())
                month_bucket["departure_weekdays"].add(self._weekday_code(outbound_date))

        discovered_months: list[dict[str, Any]] = []
        for month_start in month_starts:
            month_key = month_start.isoformat()
            month_bucket = observed_by_month[month_key]
            discovered_months.append(
                {
                    "month_start": month_key,
                    "departure_dates": sorted(month_bucket["departure_dates"]),
                    "departure_weekdays": self._sort_weekday_codes(month_bucket["departure_weekdays"]),
                    "observed_patterns": [],
                    "sample_size": 0,
                    "detection_source": "auto_monthly_discovery_all_airlines",
                }
            )

        return discovered_months

    def _reset_route_search_rules_from_service_months(
        self,
        route: RouteSeed,
        route_id: str,
        service_months: list[dict[str, Any]],
    ) -> int:
        """Make Active Routes follow the departures just detected for this route."""
        patterns = route.patterns or self._default_patterns_for_route_seed(route)
        rules: list[dict[str, Any]] = []
        for month in service_months:
            departure_weekdays = set(str(value) for value in (month.get("departure_weekdays") or []))
            if not departure_weekdays:
                continue

            for pattern in patterns:
                if pattern.departure_weekday not in departure_weekdays:
                    continue
                rules.append({
                    "route_id": route_id,
                    "month_start": month["month_start"],
                    "pattern_key": pattern.key,
                    "pattern_label": pattern.label,
                    "departure_weekday": pattern.departure_weekday,
                    "return_weekday": pattern.return_weekday,
                    "trip_nights": pattern.trip_nights,
                    "max_stops": route.max_stops,
                })

        self.store.replace_route_search_rules(route_id, rules)
        return len(rules)

    def _service_months_log_summary(
        self,
        route: RouteSeed,
        service_months: list[dict[str, Any]],
    ) -> str:
        visible_months: list[str] = []
        empty_months: list[str] = []

        for month in service_months:
            month_label = datetime.strptime(str(month["month_start"]), "%Y-%m-%d").strftime("%b")
            weekdays = [str(value) for value in (month.get("departure_weekdays") or [])]
            departure_dates = [str(value) for value in (month.get("departure_dates") or [])]
            if weekdays:
                visible_months.append(
                    f"{month_label} {'/'.join(weekdays)} ({len(departure_dates)} date"
                    f"{'' if len(departure_dates) == 1 else 's'})"
                )
            else:
                empty_months.append(month_label)

        if not visible_months:
            return (
                f"Service calendar result: {route.origin_airport} -> {route.destination_airport} "
                "no outbound departure dates found across all airlines in the scanned months"
            )

        summary = (
            f"Service calendar result: {route.origin_airport} -> {route.destination_airport} "
            f"{'; '.join(visible_months)} · all airlines"
        )
        if empty_months:
            summary += f" · empty: {', '.join(empty_months)}"

        return summary

    @staticmethod
    def _build_service_change_summary(
        month_start: str,
        previous_weekdays: list[str],
        next_weekdays: list[str],
        previous_pattern_keys: list[str],
        next_pattern_keys: list[str],
    ) -> str:
        month_label = datetime.strptime(month_start, "%Y-%m-%d").strftime("%b %Y")
        before = ", ".join(previous_weekdays) if previous_weekdays else "no departures"
        after = ", ".join(next_weekdays) if next_weekdays else "no departures"
        return f"{month_label}: departure days changed from {before} to {after}."

    def _build_service_change_events(
        self,
        existing_months: list[dict[str, Any]],
        next_months: list[dict[str, Any]],
        routing: str,
    ) -> list[dict[str, Any]]:
        existing_by_month = {
            str(item["month_start"]): item
            for item in existing_months
        }
        events: list[dict[str, Any]] = []

        for month in next_months:
            month_start = str(month["month_start"])
            previous = existing_by_month.get(month_start)
            if previous is None:
                continue

            previous_departure_dates = sorted(previous.get("departure_dates") or [])
            next_departure_dates = sorted(month.get("departure_dates") or [])
            previous_departure_weekdays = sorted(previous.get("departure_weekdays") or [])
            next_departure_weekdays = sorted(month.get("departure_weekdays") or [])
            previous_pattern_keys: list[str] = []
            next_pattern_keys: list[str] = []

            if (
                previous_departure_dates == next_departure_dates
                and previous_departure_weekdays == next_departure_weekdays
            ):
                continue

            events.append(
                {
                    "month_start": month_start,
                    "routing": routing,
                    "previous_departure_dates": previous_departure_dates,
                    "next_departure_dates": next_departure_dates,
                    "previous_departure_weekdays": previous_departure_weekdays,
                    "next_departure_weekdays": next_departure_weekdays,
                    "previous_pattern_keys": previous_pattern_keys,
                    "next_pattern_keys": next_pattern_keys,
                    "summary": self._build_service_change_summary(
                        month_start,
                        previous_departure_weekdays,
                        next_departure_weekdays,
                        previous_pattern_keys,
                        next_pattern_keys,
                    ),
                }
            )

        return events

    def _pick_cheapest_for_pattern(
        self,
        route: RouteSeed,
        pattern: SearchPattern,
        date_results_cache: dict[tuple[int, str, str | None, str | None], list[object]],
        service_month_rows: list[dict[str, object]],
    ) -> PatternSelectionResult:
        exact_pairs = self._exact_date_pairs_for_pattern(route, pattern, service_month_rows)
        if service_month_rows:
            if not exact_pairs:
                reason = (
                    f"No detected outbound dates matched the exact {pattern.label} rule inside the "
                    "current scan window."
                )
                return PatternSelectionResult(
                    snapshot=None,
                    no_result_reason=reason,
                    no_result_reason_code="outside_current_window",
                    no_result_diagnostic=self._build_no_result_diagnostic(
                        route,
                        pattern,
                        "outside_current_window",
                        reason,
                    ),
                )

            valid_snapshots: list[SnapshotRecord] = []
            seen_itineraries: set[tuple[object, ...]] = set()
            fallback_snapshot: SnapshotRecord | None = None
            relaxed_snapshot: SnapshotRecord | None = None
            rejected_short_stays: list[float] = []
            rejected_snapshot: SnapshotRecord | None = None

            for departure_date, return_date in exact_pairs:
                itineraries = self._run_flight_search(
                    self._build_flight_filters(route, departure_date, return_date),
                    top_n=PUBLIC_FARES_PER_EXACT_DATE_PAIR,
                )

                if not itineraries:
                    relaxed_max_stops = self._next_relaxed_max_stops(route.max_stops)
                    if relaxed_max_stops is not None:
                        relaxed_route = replace(route, max_stops=relaxed_max_stops)
                        relaxed_itineraries = self._run_flight_search(
                            self._build_flight_filters(
                                relaxed_route,
                                departure_date,
                                return_date,
                            ),
                            top_n=3,
                        )
                        if relaxed_itineraries and relaxed_snapshot is None:
                            relaxed_snapshot = self._build_cheapest_valid_snapshot_from_itineraries(
                                relaxed_route,
                                pattern,
                                relaxed_itineraries,
                                departure_date,
                                return_date,
                            )
                    continue

                for itinerary in sorted(itineraries, key=self._itinerary_price):
                    candidate_snapshot = self._build_candidate_snapshot_from_itinerary(
                        route,
                        pattern,
                        itinerary,
                        departure_date,
                        return_date,
                    )
                    if candidate_snapshot is None:
                        continue
                    timing_metadata = self._extract_itinerary_timing_metadata(itinerary) or {}
                    stay_hours = timing_metadata.get("destination_stay_hours")

                    if isinstance(stay_hours, (int, float)) and float(stay_hours) < MIN_DESTINATION_STAY_HOURS:
                        rejected_short_stays.append(float(stay_hours))
                        if rejected_snapshot is None:
                            rejected_snapshot = candidate_snapshot
                        continue

                    itinerary_key = (
                        candidate_snapshot.departure_date,
                        candidate_snapshot.return_date,
                        candidate_snapshot.metadata.get("outbound_departure_at"),
                        candidate_snapshot.metadata.get("outbound_arrival_at"),
                        candidate_snapshot.metadata.get("return_departure_at"),
                        candidate_snapshot.metadata.get("return_arrival_at"),
                        candidate_snapshot.metadata.get("primary_airline_code"),
                        candidate_snapshot.price,
                    )
                    if itinerary_key in seen_itineraries:
                        continue
                    seen_itineraries.add(itinerary_key)
                    valid_snapshots.append(candidate_snapshot)

                if fallback_snapshot is None:
                    fallback_snapshot = self._build_candidate_snapshot_from_itinerary(
                        route,
                        pattern,
                        min(itineraries, key=self._itinerary_price),
                        departure_date,
                        return_date,
                    )

            if valid_snapshots:
                ordered_snapshots = sorted(
                    valid_snapshots,
                    key=lambda item: (item.departure_date, item.price),
                )
                return PatternSelectionResult(
                    snapshot=ordered_snapshots[0],
                    additional_snapshots=tuple(ordered_snapshots[1:]),
                )

            if relaxed_snapshot is not None:
                self._log_progress(
                    f"Pattern fallback: {route.origin_airport} -> {route.destination_airport} "
                    f"{pattern.label} saved with {self._routing_label(relaxed_snapshot.max_stops)} "
                    f"after no {self._routing_label(route.max_stops)} result"
                )
                return PatternSelectionResult(
                    snapshot=self._with_relaxed_routing_metadata(route, relaxed_snapshot),
                )

            if rejected_short_stays:
                best_stay = min(rejected_short_stays)
                reason = (
                    "Flights were found, but every valid itinerary was rejected because the time "
                    f"in destination was under 24h (best was {best_stay:.1f}h)."
                )
                return PatternSelectionResult(
                    snapshot=None,
                    no_result_reason=reason,
                    no_result_reason_code="destination_stay_under_24h",
                    no_result_diagnostic=self._build_no_result_diagnostic(
                        route,
                        pattern,
                        "destination_stay_under_24h",
                        reason,
                        snapshot=rejected_snapshot,
                    ),
                )

            if fallback_snapshot is not None:
                reason = (
                    "Exact outbound dates exist for this rule, but no valid round-trip result was "
                    f"returned for any exact {pattern.label} pair in the active window."
                )
                return PatternSelectionResult(
                    snapshot=None,
                    no_result_reason=reason,
                    no_result_reason_code="pattern_not_available",
                    no_result_diagnostic=self._build_no_result_diagnostic(
                        route,
                        pattern,
                        "pattern_not_available",
                        reason,
                        snapshot=fallback_snapshot,
                    ),
                )

        return self._pick_cheapest_for_pattern_from_calendar_graph(
            route,
            pattern,
            date_results_cache,
        )

    def _pick_cheapest_for_pattern_from_calendar_graph(
        self,
        route: RouteSeed,
        pattern: SearchPattern,
        date_results_cache: dict[tuple[int, str, str | None, str | None], list[object]],
    ) -> PatternSelectionResult:
        cache_key = (pattern.trip_nights, route.max_stops, pattern.valid_from, pattern.valid_until)
        if cache_key not in date_results_cache:
            self._log_progress(
                f"Calendar search: {route.origin_airport} -> {route.destination_airport} "
                f"{pattern.label} ({pattern.trip_nights} nights)"
            )
            date_results_cache[cache_key] = self._run_date_search(
                self._build_filters(route, pattern)
            )

        results = date_results_cache[cache_key]
        indicative_prices = self._indicative_prices_from_calendar_results(
            route,
            pattern,
            results,
            max_stops=route.max_stops,
        )
        if not results:
            relaxed_max_stops = self._next_relaxed_max_stops(route.max_stops)
            if relaxed_max_stops is not None:
                relaxed_cache_key = (
                    pattern.trip_nights,
                    relaxed_max_stops,
                    pattern.valid_from,
                    pattern.valid_until,
                )
                if relaxed_cache_key not in date_results_cache:
                    date_results_cache[relaxed_cache_key] = self._run_date_search(
                        self._build_filters_for_max_stops(route, pattern, relaxed_max_stops)
                    )

                relaxed_results = date_results_cache[relaxed_cache_key]
                if relaxed_results:
                    relaxed_indicative_prices = self._indicative_prices_from_calendar_results(
                        route,
                        pattern,
                        relaxed_results,
                        max_stops=relaxed_max_stops,
                    )
                    for result in relaxed_results:
                        outbound_date = result.date[0].date()
                        inbound_date = result.date[1].date() if len(result.date) > 1 else outbound_date
                        if self._matches_pattern(outbound_date, inbound_date, pattern):
                            relaxed_snapshot = self._build_candidate_snapshot_from_result(
                                route,
                                pattern,
                                result,
                                relaxed_max_stops,
                                self.config.currency_code,
                            )
                            if relaxed_snapshot is None:
                                continue
                            relaxed_route = replace(route, max_stops=relaxed_max_stops)
                            relaxed_metadata = (
                                self._fetch_airline_metadata(
                                    relaxed_route,
                                    relaxed_snapshot.departure_date,
                                    relaxed_snapshot.return_date,
                                )
                                if relaxed_snapshot is not None
                                else {}
                            )
                            if not relaxed_metadata:
                                continue
                            if relaxed_metadata.get("itinerary_rejected") == "destination_stay_under_24h":
                                continue
                            return PatternSelectionResult(
                                snapshot=self._with_relaxed_routing_metadata(
                                    route,
                                    relaxed_snapshot,
                                    relaxed_metadata,
                                ),
                                indicative_prices=relaxed_indicative_prices,
                                calendar_results_received=len(relaxed_results),
                            )

            reason = "No flights were returned for this route and trip length."
            return PatternSelectionResult(
                snapshot=None,
                indicative_prices=indicative_prices,
                calendar_results_received=len(results),
                no_result_reason=reason,
                no_result_reason_code="no_flights_found",
                no_result_diagnostic=self._build_no_result_diagnostic(
                    route,
                    pattern,
                    "no_flights_found",
                    reason,
                ),
            )

        matches: list[SnapshotRecord] = []
        for result in results:
            outbound_date = result.date[0].date()
            inbound_date = result.date[1].date() if len(result.date) > 1 else outbound_date
            if not self._matches_pattern(outbound_date, inbound_date, pattern):
                continue

            result_price = self._positive_price(getattr(result, "price", None))
            if result_price is None:
                continue

            matches.append(
                SnapshotRecord(
                    departure_date=outbound_date.isoformat(),
                    return_date=inbound_date.isoformat(),
                    trip_nights=pattern.trip_nights,
                    max_stops=route.max_stops,
                    price=result_price,
                    currency=self.config.currency_code,
                    metadata={
                        "origin_airport": route.origin_airport,
                        "destination_airport": route.destination_airport,
                        "destination_city": route.destination_city,
                        "bucket": route.bucket,
                        "buckets": list(route.supported_buckets),
                        "search_min_trip_nights": route.search_min_trip_nights,
                        "search_max_trip_nights": route.search_max_trip_nights,
                        **self._pattern_metadata(pattern),
                    },
                )
            )

        if not matches:
            relaxed_max_stops = self._next_relaxed_max_stops(route.max_stops)
            if relaxed_max_stops is not None:
                relaxed_cache_key = (
                    pattern.trip_nights,
                    relaxed_max_stops,
                    pattern.valid_from,
                    pattern.valid_until,
                )
                if relaxed_cache_key not in date_results_cache:
                    date_results_cache[relaxed_cache_key] = self._run_date_search(
                        self._build_filters_for_max_stops(route, pattern, relaxed_max_stops)
                    )

                relaxed_results = date_results_cache[relaxed_cache_key]
                relaxed_indicative_prices = self._indicative_prices_from_calendar_results(
                    route,
                    pattern,
                    relaxed_results,
                    max_stops=relaxed_max_stops,
                )
                for result in relaxed_results:
                    outbound_date = result.date[0].date()
                    inbound_date = result.date[1].date() if len(result.date) > 1 else outbound_date
                    if self._matches_pattern(outbound_date, inbound_date, pattern):
                        relaxed_snapshot = self._build_candidate_snapshot_from_result(
                            route,
                            pattern,
                            result,
                            relaxed_max_stops,
                            self.config.currency_code,
                        )
                        if relaxed_snapshot is None:
                            continue
                        relaxed_route = replace(route, max_stops=relaxed_max_stops)
                        relaxed_metadata = (
                            self._fetch_airline_metadata(
                                relaxed_route,
                                relaxed_snapshot.departure_date,
                                relaxed_snapshot.return_date,
                            )
                            if relaxed_snapshot is not None
                            else {}
                        )
                        if not relaxed_metadata:
                            continue
                        if relaxed_metadata.get("itinerary_rejected") == "destination_stay_under_24h":
                            continue
                        return PatternSelectionResult(
                            snapshot=self._with_relaxed_routing_metadata(
                                route,
                                relaxed_snapshot,
                                relaxed_metadata,
                            ),
                            indicative_prices=relaxed_indicative_prices,
                            calendar_results_received=len(relaxed_results),
                        )

            cheapest_result = min(results, key=lambda item: float(item.price))
            alternative_snapshot = self._build_candidate_snapshot_from_result(
                route,
                pattern,
                cheapest_result,
                route.max_stops,
                self.config.currency_code,
            )
            alternative_metadata = (
                self._fetch_airline_metadata(
                    route,
                    alternative_snapshot.departure_date,
                    alternative_snapshot.return_date,
                )
                if alternative_snapshot is not None
                else {}
            )
            reason = (
                "Flights were found for this trip length, but none matched the exact "
                f"{pattern.label} pattern."
            )
            return PatternSelectionResult(
                snapshot=None,
                indicative_prices=indicative_prices,
                calendar_results_received=len(results),
                no_result_reason=reason,
                no_result_reason_code="pattern_not_available",
                no_result_diagnostic=self._build_no_result_diagnostic(
                    route,
                    pattern,
                    "pattern_not_available",
                    reason,
                    snapshot=alternative_snapshot,
                    metadata=alternative_metadata,
                ),
            )

        fallback_snapshot: SnapshotRecord | None = None
        rejected_short_stays: list[float] = []
        rejected_snapshot: SnapshotRecord | None = None
        rejected_metadata: dict[str, object] | None = None

        for candidate_snapshot in sorted(matches, key=lambda snapshot: snapshot.price):
            fallback_skyscanner_url = self._build_skyscanner_url(
                route,
                candidate_snapshot.departure_date,
                candidate_snapshot.return_date,
            )
            airline_metadata = self._fetch_airline_metadata(
                route,
                candidate_snapshot.departure_date,
                candidate_snapshot.return_date,
            )

            if airline_metadata.get("itinerary_rejected") == "destination_stay_under_24h":
                stay_hours = airline_metadata.get("destination_stay_hours")
                if isinstance(stay_hours, (int, float)):
                    rejected_short_stays.append(float(stay_hours))
                if rejected_snapshot is None:
                    rejected_snapshot = SnapshotRecord(
                        departure_date=candidate_snapshot.departure_date,
                        return_date=candidate_snapshot.return_date,
                        trip_nights=candidate_snapshot.trip_nights,
                        max_stops=candidate_snapshot.max_stops,
                        price=candidate_snapshot.price,
                        currency=candidate_snapshot.currency,
                        metadata={
                            **candidate_snapshot.metadata,
                            "calendar_price": candidate_snapshot.price,
                            "skyscanner_url": fallback_skyscanner_url,
                            **airline_metadata,
                        },
                    )
                    rejected_metadata = airline_metadata
                continue

            if not airline_metadata:
                if fallback_snapshot is None:
                    fallback_snapshot = SnapshotRecord(
                        departure_date=candidate_snapshot.departure_date,
                        return_date=candidate_snapshot.return_date,
                        trip_nights=candidate_snapshot.trip_nights,
                        max_stops=candidate_snapshot.max_stops,
                        price=candidate_snapshot.price,
                        currency=candidate_snapshot.currency,
                        metadata={
                            **candidate_snapshot.metadata,
                            "calendar_price": candidate_snapshot.price,
                            "price_source": "calendar_graph",
                            "skyscanner_url": fallback_skyscanner_url,
                        },
                    )
                continue

            shopping_price = airline_metadata.get("shopping_price")
            verified_price = (
                float(shopping_price)
                if isinstance(shopping_price, (int, float)) and float(shopping_price) > 0
                else candidate_snapshot.price
            )

            return PatternSelectionResult(
                snapshot=SnapshotRecord(
                    departure_date=candidate_snapshot.departure_date,
                    return_date=candidate_snapshot.return_date,
                    trip_nights=candidate_snapshot.trip_nights,
                    max_stops=candidate_snapshot.max_stops,
                    price=verified_price,
                    currency=candidate_snapshot.currency,
                    metadata={
                        **candidate_snapshot.metadata,
                        "calendar_price": candidate_snapshot.price,
                        "skyscanner_url": fallback_skyscanner_url,
                        **airline_metadata,
                    },
                ),
                indicative_prices=indicative_prices,
                calendar_results_received=len(results),
            )

        if fallback_snapshot is not None:
            reason = (
                "Calendar prices were captured, but an exact shopping result could not be "
                "verified for publication."
            )
            return PatternSelectionResult(
                snapshot=None,
                indicative_prices=indicative_prices,
                calendar_results_received=len(results),
                no_result_reason=reason,
                no_result_reason_code="verification_unavailable",
                no_result_diagnostic=self._build_no_result_diagnostic(
                    route,
                    pattern,
                    "verification_unavailable",
                    reason,
                    snapshot=fallback_snapshot,
                ),
            )

        if rejected_short_stays:
            best_stay = min(rejected_short_stays)
            reason = (
                "Flights were found, but every valid itinerary was rejected because the time "
                f"in destination was under 24h (best was {best_stay:.1f}h)."
            )
            return PatternSelectionResult(
                snapshot=None,
                indicative_prices=indicative_prices,
                calendar_results_received=len(results),
                no_result_reason=reason,
                no_result_reason_code="destination_stay_under_24h",
                no_result_diagnostic=self._build_no_result_diagnostic(
                    route,
                    pattern,
                    "destination_stay_under_24h",
                    reason,
                    snapshot=rejected_snapshot,
                    metadata=rejected_metadata,
                ),
            )

        reason = "Flights were found, but none passed validation cleanly."
        return PatternSelectionResult(
            snapshot=None,
            indicative_prices=indicative_prices,
            calendar_results_received=len(results),
            no_result_reason=reason,
            no_result_reason_code="validation_rejected",
            no_result_diagnostic=self._build_no_result_diagnostic(
                route,
                pattern,
                "validation_rejected",
                reason,
                snapshot=matches[0] if matches else None,
            ),
        )

    def _score_deal(
        self,
        route: RouteSeed,
        snapshot: SnapshotRecord,
        history: Iterable[float],
    ) -> tuple[DealCandidate | None, dict[str, object] | None]:
        effective_review_ratio = self.config.review_ratio
        deal_mode = "editorial_discount"

        if snapshot.price <= 0:
            return None, self._build_deal_skip_diagnostic(
                route,
                snapshot,
                [],
                reason_code="invalid_price",
                reason="The scanner found a non-positive price, so it was not eligible as an offer.",
                effective_review_ratio=effective_review_ratio,
                deal_mode=deal_mode,
            )

        history_values = [float(value) for value in history if value is not None]
        if len(history_values) < self.config.min_history_for_deal:
            return None, self._build_deal_skip_diagnostic(
                route,
                snapshot,
                history_values,
                reason_code="insufficient_history",
                reason=(
                    "Not enough previous prices for this exact route and date pattern "
                    f"({len(history_values)}/{self.config.min_history_for_deal})."
                ),
                effective_review_ratio=effective_review_ratio,
                deal_mode=deal_mode,
            )

        baseline = float(median(history_values))
        drop_ratio = snapshot.price / baseline if baseline else 1.0
        if drop_ratio > effective_review_ratio:
            required_price = baseline * effective_review_ratio
            reason = (
                "Price is not low enough versus history. It must be at or below "
                f"{format_money(required_price, snapshot.currency)} to become an editorial offer."
            )
            return None, self._build_deal_skip_diagnostic(
                route,
                snapshot,
                history_values,
                reason_code="not_cheap_enough",
                reason=reason,
                baseline=baseline,
                drop_ratio=drop_ratio,
                effective_review_ratio=effective_review_ratio,
                deal_mode=deal_mode,
            )

        drop_percent = int(round((1 - drop_ratio) * 100))
        score = round(max(drop_percent * 2.2, 50), 2)
        send_type = "flash" if drop_ratio <= self.config.flash_ratio else "digest"
        pattern_label = snapshot.metadata.get("pattern_label")
        pattern_suffix = f" ({pattern_label})" if isinstance(pattern_label, str) else ""
        title = (
            f"Luxembourg to {route.destination_city}{pattern_suffix} from "
            f"{format_money(snapshot.price, snapshot.currency)}"
        )
        airline_summary = snapshot.metadata.get("airline_summary")
        airline_line = f" on {airline_summary}" if isinstance(airline_summary, str) else ""
        pattern_line = f" for the {pattern_label} pattern" if isinstance(pattern_label, str) else ""
        if drop_percent > 0:
            median_line = f"That is about {drop_percent}% below the recent pattern median."
        elif drop_percent < 0:
            median_line = f"That is about {abs(drop_percent)}% above the recent pattern median."
        else:
            median_line = "That is at the recent pattern median."
        summary = (
            f"{snapshot.trip_nights}-night roundtrip from {route.origin_airport} to "
            f"{route.destination_airport} at {format_money(snapshot.price, snapshot.currency)}"
            f"{airline_line}{pattern_line}. "
            f"{median_line}"
        )

        return (
            DealCandidate(
                title=title,
                summary=summary,
                deal_price=snapshot.price,
                baseline_price=baseline,
                drop_ratio=round(drop_ratio, 4),
                score=score,
                send_type=send_type,
            ),
            None,
        )

    def _snapshot_with_price_context(
        self,
        snapshot: SnapshotRecord,
        history: Iterable[float],
        candidate: DealCandidate | None,
        deal_skip_diagnostic: dict[str, object] | None,
    ) -> SnapshotRecord:
        history_values = [float(value) for value in history if value is not None]
        baseline_value = (
            candidate.baseline_price
            if candidate is not None
            else (deal_skip_diagnostic or {}).get("baseline_price")
        )
        drop_ratio_value = (
            candidate.drop_ratio
            if candidate is not None
            else (deal_skip_diagnostic or {}).get("drop_ratio")
        )
        baseline = float(baseline_value) if isinstance(baseline_value, (int, float)) else None
        drop_ratio = (
            float(drop_ratio_value)
            if isinstance(drop_ratio_value, (int, float))
            else None
        )

        if len(history_values) < self.config.min_history_for_deal or drop_ratio is None:
            price_position = "new_price"
        elif drop_ratio <= PUBLIC_EXCEPTIONAL_PRICE_RATIO:
            price_position = "exceptional"
        elif drop_ratio <= PUBLIC_BELOW_USUAL_PRICE_RATIO:
            price_position = "below_usual"
        elif drop_ratio <= PUBLIC_TYPICAL_PRICE_RATIO:
            price_position = "typical"
        else:
            price_position = "above_usual"

        metadata = {
            **snapshot.metadata,
            "historical_baseline_price": baseline,
            "historical_drop_ratio": round(drop_ratio, 4) if drop_ratio is not None else None,
            "historical_history_points": len(history_values),
            "historical_minimum_points": self.config.min_history_for_deal,
            "price_position": price_position,
            "editorial_deal_candidate": candidate is not None,
        }
        return replace(snapshot, metadata=metadata)

    def _snapshot_with_publication_context(
        self,
        snapshot: SnapshotRecord,
        pattern: SearchPattern,
        monthly_history: Iterable[float],
        pattern_history: Iterable[float],
        current_batch_prices: Iterable[float],
    ) -> SnapshotRecord:
        monthly_values = [
            float(value)
            for value in (*monthly_history, *current_batch_prices)
            if value is not None and float(value) > 0
        ]
        pattern_values = [
            float(value)
            for value in pattern_history
            if value is not None and float(value) > 0
        ]

        if len(monthly_values) >= PUBLIC_REFERENCE_MIN_POINTS:
            reference_values = monthly_values
            reference_scope = "pattern_month"
        elif len(pattern_values) >= PUBLIC_REFERENCE_MIN_POINTS:
            reference_values = pattern_values
            reference_scope = "pattern_all_months"
        else:
            reference_values = []
            reference_scope = "insufficient_history"

        baseline = float(median(reference_values)) if reference_values else None
        drop_ratio = snapshot.price / baseline if baseline and baseline > 0 else None
        departure = date.fromisoformat(snapshot.departure_date)
        days_until_departure = (departure - date.today()).days
        lowest_monthly_price = min(monthly_values) if monthly_values else snapshot.price
        reasons: list[str] = []

        if snapshot.price <= lowest_monthly_price:
            reasons.append("lowest_pattern_month_price")
        if (
            0 <= days_until_departure <= PUBLIC_NEAR_DEPARTURE_DAYS
            and drop_ratio is not None
            and drop_ratio <= PUBLIC_NEAR_DEPARTURE_RATIO
        ):
            reasons.append("near_departure_at_fair_price")
        if drop_ratio is not None and drop_ratio <= PUBLIC_MONTHLY_DISCOUNT_RATIO:
            reasons.append("strong_monthly_discount")

        metadata = {
            **snapshot.metadata,
            "public_fare_eligible": bool(reasons),
            "public_fare_reasons": reasons,
            "public_reference_scope": reference_scope,
            "public_reference_price": baseline,
            "public_reference_points": len(reference_values),
            "public_monthly_points": len(monthly_values),
            "public_monthly_lowest_price": lowest_monthly_price,
            "public_monthly_drop_ratio": round(drop_ratio, 4) if drop_ratio is not None else None,
            "public_days_until_departure": days_until_departure,
            "public_pattern_month_start": pattern.month_start,
        }
        return replace(snapshot, metadata=metadata)

    def _build_deal_skip_diagnostic(
        self,
        route: RouteSeed,
        snapshot: SnapshotRecord,
        history_values: list[float],
        *,
        reason_code: str,
        reason: str,
        baseline: float | None = None,
        drop_ratio: float | None = None,
        effective_review_ratio: float | None = None,
        deal_mode: str | None = None,
    ) -> dict[str, object]:
        reason_labels = {
            "invalid_price": "Invalid price",
            "insufficient_history": "Needs more history",
            "not_cheap_enough": "Not cheap enough",
        }
        pattern_label = snapshot.metadata.get("pattern_label")
        skyscanner_url = snapshot.metadata.get("skyscanner_url")
        airline_summary = snapshot.metadata.get("airline_summary")
        required_price = (
            baseline * (effective_review_ratio if effective_review_ratio is not None else self.config.review_ratio)
            if baseline is not None
            else None
        )
        discount_percent = (
            round((1 - drop_ratio) * 100, 1)
            if drop_ratio is not None
            else None
        )

        diagnostic: dict[str, object] = {
            "reason_code": reason_code,
            "reason_label": reason_labels.get(reason_code, "Not an offer"),
            "reason": reason,
            "route_label": f"{route.origin_airport} -> {route.destination_airport}",
            "destination_city": route.destination_city,
            "bucket": route.bucket,
            "buckets": list(route.supported_buckets),
            "routing": self._routing_label(snapshot.max_stops),
            "configured_routing": self._routing_label(route.max_stops),
            "pattern_label": pattern_label if isinstance(pattern_label, str) else "Unknown pattern",
            "trip_nights": snapshot.trip_nights,
            "departure_date": snapshot.departure_date,
            "return_date": snapshot.return_date,
            "price": snapshot.price,
            "currency": snapshot.currency,
            "history_points": len(history_values),
            "minimum_history_points": self.config.min_history_for_deal,
            "review_ratio": self.config.review_ratio,
            "effective_review_ratio": effective_review_ratio
            if effective_review_ratio is not None
            else self.config.review_ratio,
        }
        if deal_mode is not None:
            diagnostic["deal_mode"] = deal_mode
        if baseline is not None:
            diagnostic["baseline_price"] = baseline
        if required_price is not None:
            diagnostic["required_price"] = required_price
        if drop_ratio is not None:
            diagnostic["drop_ratio"] = round(drop_ratio, 4)
        if discount_percent is not None:
            diagnostic["discount_percent"] = discount_percent
        if isinstance(skyscanner_url, str):
            diagnostic["skyscanner_url"] = skyscanner_url
        if isinstance(airline_summary, str):
            diagnostic["airline_summary"] = airline_summary
        if snapshot.metadata.get("routing_relaxed"):
            diagnostic["routing_relaxed"] = True
            relaxed_reason = snapshot.metadata.get("routing_relaxed_reason")
            if isinstance(relaxed_reason, str):
                diagnostic["routing_relaxed_reason"] = relaxed_reason

        return diagnostic

    def _save_scan_run_summary(
        self,
        summary: dict[str, Any],
        *,
        checkpoint: bool = False,
    ) -> None:
        try:
            self.store.save_scan_run(summary)
        except Exception as error:  # pragma: no cover - depends on storage availability
            self._log_progress(f"Scan summary persistence failed: {error}")

        if self.live_sync_store is None or not self.config.sync_scan_runs_live:
            return

        try:
            if checkpoint:
                self.live_sync_store.save_scan_run_checkpoint(summary)
            else:
                self.live_sync_store.save_scan_run(summary)
        except Exception as error:  # pragma: no cover - depends on live network behavior
            self._log_progress(f"Scan summary live sync failed: {error}")

    def scan(
        self,
        limit: int | None = None,
        destination_airports: set[str] | None = None,
    ) -> dict[str, Any]:
        filtered_routes = [
            route
            for route in self.routes
            if not destination_airports or route.destination_airport in destination_airports
        ]
        routes = filtered_routes[:limit] if limit else filtered_routes
        plan_key = hashlib.sha256(
            json.dumps(
                {
                    "scanner_source": self.config.scanner_source,
                    "routes": [route.key for route in routes],
                },
                sort_keys=True,
            ).encode("utf-8")
        ).hexdigest()
        resume_checkpoint = self.store.load_price_scan_checkpoint(plan_key)
        if resume_checkpoint:
            run_key = str(resume_checkpoint["run_key"])
            started_at = datetime.fromisoformat(
                str(resume_checkpoint["started_at"]).replace("Z", "+00:00")
            )
            report = list(resume_checkpoint.get("report") or [])
            started_route_keys = set(resume_checkpoint.get("started_route_keys") or [])
            completed_route_keys = set(resume_checkpoint.get("completed_route_keys") or [])
            completed_rule_keys = set(resume_checkpoint.get("completed_rule_keys") or [])
            planned_route_keys = set(resume_checkpoint.get("planned_route_keys") or [])
            patterns_planned = int(resume_checkpoint.get("patterns_planned") or 0)
            patterns_scanned = int(resume_checkpoint.get("patterns_scanned") or 0)
        else:
            report: list[dict[str, Any]] = []
            run_key = str(uuid.uuid4())
            started_at = datetime.now(timezone.utc)
            started_route_keys: set[str] = set()
            completed_route_keys: set[str] = set()
            completed_rule_keys: set[str] = set()
            planned_route_keys: set[str] = set()
            patterns_planned = 0
            patterns_scanned = 0
        total_routes = len(routes)
        route_windows = [self._search_window_dates(route) for route in routes]
        search_window_start = min((window[0] for window in route_windows), default=None)
        search_window_end = max((window[1] for window in route_windows), default=None)
        consecutive_network_outage_failures = 0
        consecutive_empty_results = 0
        stopped_reason: str | None = None
        stopped_reason_code: str | None = None
        run_status = "running"
        fatal_error: BaseException | None = None
        final_summary: dict[str, Any] | None = None
        last_checkpoint_at: datetime | None = None
        self._run_retry_counts = dict(
            (resume_checkpoint or {}).get("retry_counts") or {}
        )
        self._provider_query_counts = {
            "calendar": int((resume_checkpoint or {}).get("calendar_queries") or 0),
            "exact": int((resume_checkpoint or {}).get("exact_queries") or 0),
        }
        indicative_prices_received = int(
            (resume_checkpoint or {}).get("indicative_prices_received") or 0
        )
        indicative_prices_inserted = int(
            (resume_checkpoint or {}).get("indicative_prices_inserted") or 0
        )
        indicative_price_duplicates = int(
            (resume_checkpoint or {}).get("indicative_price_duplicates") or 0
        )

        def save_running_checkpoint(*, force: bool = False) -> None:
            nonlocal last_checkpoint_at
            checkpoint_at = datetime.now(timezone.utc)
            if (
                not force
                and last_checkpoint_at is not None
                and (checkpoint_at - last_checkpoint_at).total_seconds()
                < SCAN_RUN_CHECKPOINT_INTERVAL_SECONDS
            ):
                return
            checkpoint_summary = build_price_scan_run_summary(
                    run_key=run_key,
                    scanner_source=self.config.scanner_source,
                    routes=routes,
                    report=report,
                    started_at=started_at,
                    completed_at=None,
                    status="running",
                    started_route_keys=started_route_keys,
                    completed_route_keys=completed_route_keys,
                    patterns_planned=patterns_planned,
                    patterns_scanned=patterns_scanned,
                    retry_counts=self._run_retry_counts,
                    search_window_start=search_window_start,
                    search_window_end=search_window_end,
                )
            checkpoint_summary.update(
                {
                    "indicative_prices": indicative_prices_inserted,
                    "calendar_queries": self._provider_query_counts["calendar"],
                    "exact_queries": self._provider_query_counts["exact"],
                }
            )
            self._save_scan_run_summary(checkpoint_summary, checkpoint=True)
            self.store.save_price_scan_checkpoint(
                {
                    "plan_key": plan_key,
                    "run_key": run_key,
                    "started_at": started_at.isoformat(),
                    "report": report,
                    "started_route_keys": sorted(started_route_keys),
                    "completed_route_keys": sorted(completed_route_keys),
                    "completed_rule_keys": sorted(completed_rule_keys),
                    "planned_route_keys": sorted(planned_route_keys),
                    "patterns_planned": patterns_planned,
                    "patterns_scanned": patterns_scanned,
                    "retry_counts": self._run_retry_counts,
                    "calendar_queries": self._provider_query_counts["calendar"],
                    "exact_queries": self._provider_query_counts["exact"],
                    "indicative_prices_received": indicative_prices_received,
                    "indicative_prices_inserted": indicative_prices_inserted,
                    "indicative_price_duplicates": indicative_price_duplicates,
                }
            )
            last_checkpoint_at = checkpoint_at

        save_running_checkpoint(force=True)

        try:
            self._assert_provider_available(context="before starting the full scan")
            for route_index, route in enumerate(routes, start=1):
                if route.key in completed_route_keys:
                    continue
                if route_index > 1:
                    self._pause_between_routes()
                started_route_keys.add(route.key)
                try:
                    route_id = self.store.ensure_route(route)
                    patterns = self._patterns_for_route(route, route_id)
                    if route.key not in planned_route_keys:
                        patterns_planned += len(patterns)
                        planned_route_keys.add(route.key)
                    route_progress_label = f"{route_index}/{total_routes}"
                    self._log_progress(
                        f"Route start: {route_progress_label} · "
                        f"{route.origin_airport} -> {route.destination_airport} "
                        f"({route.bucket}, {len(patterns)} patterns)"
                    )
                    consecutive_network_outage_failures = 0
                    save_running_checkpoint()
                except Exception as error:  # pragma: no cover - depends on live upstream behavior
                    error_type = self._classify_error_type(error)
                    consecutive_network_outage_failures = (
                        consecutive_network_outage_failures + 1
                        if error_type == "network_outage"
                        else 0
                    )
                    self._trip_network_outage_breaker_if_needed(
                        consecutive_network_outage_failures,
                        error,
                    )
                    report.append(
                        {
                            "route": asdict(route),
                            "status": "error",
                            "error": str(error),
                            "error_type": error_type,
                        }
                    )
                    save_running_checkpoint()
                    continue

                date_results_cache: dict[tuple[int, str, str | None, str | None], list[object]] = {}
                service_month_rows = self.store.route_service_months(route_id, route.max_stops)
                total_patterns = len(patterns)
                for pattern_index, pattern in enumerate(patterns, start=1):
                    completed_rule_key = "|".join(
                        (
                            route.key,
                            pattern.key,
                            pattern.valid_from or "",
                            pattern.valid_until or "",
                        )
                    )
                    if completed_rule_key in completed_rule_keys:
                        continue
                    patterns_scanned += 1
                    pattern_progress_label = f"{pattern_index}/{total_patterns}"
                    try:
                        self._log_progress(
                            f"Pattern start: {pattern_progress_label} · "
                            f"{route.origin_airport} -> {route.destination_airport} "
                            f"{pattern.label}"
                        )
                        pattern_history = self.store.latest_prices(
                            route_id,
                            self.config.history_window,
                            pattern_key=pattern.key,
                            max_stops=route.max_stops,
                        )
                        monthly_history = self.store.latest_prices(
                            route_id,
                            self.config.history_window,
                            pattern_key=pattern.key,
                            pattern_month_start=pattern.month_start,
                            max_stops=route.max_stops,
                        )
                        selection = self._pick_cheapest_for_pattern_with_retry(
                            route,
                            pattern,
                            date_results_cache,
                            service_month_rows,
                            pattern_progress_label,
                        )
                        capture_result = self.store.save_indicative_prices(
                            route_id,
                            list(selection.indicative_prices),
                            scan_run_key=run_key,
                        )
                        indicative_prices_received += capture_result["received"]
                        indicative_prices_inserted += capture_result["inserted"]
                        indicative_price_duplicates += capture_result["duplicates"]
                        self._log_progress(
                            f"Calendar combinations saved: {pattern_progress_label} · "
                            f"{route.origin_airport} -> {route.destination_airport} "
                            f"{pattern.label} received {selection.calendar_results_received}, "
                            f"valid {len(selection.indicative_prices)}, "
                            f"inserted {capture_result['inserted']}"
                        )
                    except Exception as error:  # pragma: no cover - depends on live upstream behavior
                        error_type = self._classify_error_type(error)
                        if error_type == "provider_unavailable":
                            try:
                                self._assert_provider_available(
                                    context=(
                                        "confirming a pattern-level provider failure on "
                                        f"{route.origin_airport} -> {route.destination_airport} "
                                        f"{pattern.label}"
                                    )
                                )
                            except ProviderUnavailableError as confirmation_error:
                                raise confirmation_error from error
                            self._log_progress(
                                "Provider canaries are healthy; recording the failed "
                                "pattern and continuing the scan."
                            )
                        consecutive_network_outage_failures = (
                            consecutive_network_outage_failures + 1
                            if error_type == "network_outage"
                            else 0
                        )
                        self._log_progress(
                            f"{self._error_log_prefix(error_type)}: "
                            f"{pattern_progress_label} · "
                            f"{route.origin_airport} -> {route.destination_airport} "
                            f"{pattern.label} ({error})"
                        )
                        report.append(
                            {
                                "route": asdict(route),
                                "pattern": asdict(pattern),
                                "status": "error",
                                "error": str(error),
                                "error_type": error_type,
                            }
                        )
                        completed_rule_keys.add(completed_rule_key)
                        save_running_checkpoint()
                        self._trip_network_outage_breaker_if_needed(
                            consecutive_network_outage_failures,
                            error,
                        )
                        continue

                    if selection.snapshot is None:
                        consecutive_network_outage_failures = 0
                        no_result_reason = (
                            f" ({selection.no_result_reason})"
                            if selection.no_result_reason
                            else ""
                        )
                        meta_suffix = self._log_meta_suffix(selection.no_result_diagnostic)
                        self._log_progress(
                            f"Pattern no results: {pattern_progress_label} · "
                            f"{route.origin_airport} -> {route.destination_airport} "
                            f"{pattern.label}{no_result_reason}{meta_suffix}"
                        )
                        report.append(
                            {
                                "route": asdict(route),
                                "pattern": asdict(pattern),
                                "status": "no_results",
                                "reason": selection.no_result_reason,
                                "reason_code": selection.no_result_reason_code,
                                "diagnostic": selection.no_result_diagnostic,
                                "calendar_results_received": selection.calendar_results_received,
                                "indicative_prices_saved": len(selection.indicative_prices),
                            }
                        )
                        completed_rule_keys.add(completed_rule_key)
                        save_running_checkpoint()
                        if selection.no_result_reason_code in {
                            "no_flights_found",
                            "pattern_not_available",
                        }:
                            consecutive_empty_results += 1
                            self._check_empty_result_breaker(
                                consecutive_empty_results
                            )
                            if (
                                self.config.empty_result_breaker_threshold > 0
                                and consecutive_empty_results
                                >= self.config.empty_result_breaker_threshold
                            ):
                                consecutive_empty_results = 0
                        else:
                            consecutive_empty_results = 0
                        continue

                    snapshots = selection.snapshots
                    consecutive_empty_results = 0
                    batch_prices = [snapshot.price for snapshot in snapshots]
                    scoring_history = (
                        monthly_history
                        if len(monthly_history) >= PUBLIC_REFERENCE_MIN_POINTS
                        else pattern_history
                    )

                    for snapshot in snapshots:
                        candidate, deal_skip_diagnostic = self._score_deal(
                            route,
                            snapshot,
                            scoring_history,
                        )
                        snapshot = self._snapshot_with_price_context(
                            snapshot,
                            scoring_history,
                            candidate,
                            deal_skip_diagnostic,
                        )
                        snapshot = self._snapshot_with_publication_context(
                            snapshot,
                            pattern,
                            monthly_history,
                            pattern_history,
                            batch_prices,
                        )
                        try:
                            snapshot_id = self.store.save_snapshot(
                                route_id,
                                snapshot,
                                scan_run_key=run_key,
                            )
                            self.store.mark_indicative_price_verified(
                                route_id,
                                scan_run_key=run_key,
                                rule_key=pattern.key,
                                departure_date=snapshot.departure_date,
                                return_date=snapshot.return_date,
                                max_stops=snapshot.max_stops,
                            )
                            if candidate is not None:
                                self.store.save_deal(route_id, snapshot_id, candidate)
                            self._sync_snapshot_live(
                                route,
                                route_id,
                                snapshot_id,
                                snapshot,
                                candidate,
                                run_key,
                            )
                        except Exception as error:  # pragma: no cover - depends on live network behavior
                            error_type = self._classify_error_type(error)
                            consecutive_network_outage_failures = (
                                consecutive_network_outage_failures + 1
                                if error_type == "network_outage"
                                else 0
                            )
                            self._log_progress(
                                f"{self._error_log_prefix(error_type)}: {pattern_progress_label} · "
                                f"{route.origin_airport} -> {route.destination_airport} "
                                f"{pattern.label} during persistence ({error})"
                            )
                            report.append(
                                {
                                    "route": asdict(route),
                                    "pattern": asdict(pattern),
                                    "status": "error",
                                    "error": str(error),
                                    "error_type": error_type,
                                }
                            )
                            self._trip_network_outage_breaker_if_needed(
                                consecutive_network_outage_failures,
                                error,
                            )
                            continue

                        consecutive_network_outage_failures = 0
                        if candidate is None and deal_skip_diagnostic is not None:
                            self._log_progress(
                                f"Deal skipped: {pattern_progress_label} · "
                                f"{route.origin_airport} -> {route.destination_airport} "
                                f"{pattern.label} at {snapshot.currency} {snapshot.price:.0f} "
                                f"({deal_skip_diagnostic['reason']})"
                                f"{self._log_meta_suffix(deal_skip_diagnostic)}"
                            )
                        elif candidate is not None:
                            self._log_progress(
                                f"Deal candidate: {pattern_progress_label} · "
                                f"{route.origin_airport} -> {route.destination_airport} "
                                f"{pattern.label} at {snapshot.currency} {snapshot.price:.0f} "
                                f"({candidate.send_type})"
                            )
                        report.append(
                            {
                                "route": asdict(route),
                                "pattern": asdict(pattern),
                                "status": "deal" if candidate else "tracked",
                                "snapshot": asdict(snapshot),
                                "history_points": len(scoring_history),
                                "deal_skip_diagnostic": deal_skip_diagnostic,
                                "candidate": asdict(candidate) if candidate else None,
                                "calendar_results_received": selection.calendar_results_received,
                                "indicative_prices_saved": len(selection.indicative_prices),
                            }
                        )

                    self._log_progress(
                        f"Pattern done: {pattern_progress_label} · "
                        f"{route.origin_airport} -> {route.destination_airport} "
                        f"{pattern.label} captured {len(snapshots)} fare(s)"
                    )
                    completed_rule_keys.add(completed_rule_key)
                    save_running_checkpoint()
                route_rule_keys = {
                    "|".join((route.key, item.key, item.valid_from or "", item.valid_until or ""))
                    for item in patterns
                }
                if route_rule_keys.issubset(completed_rule_keys):
                    completed_route_keys.add(route.key)
                save_running_checkpoint()
        except ProviderUnavailableError as error:
            stopped_reason = str(error)
            stopped_reason_code = "provider_unavailable"
            run_status = (
                "partial"
                if any(item.get("status") in {"tracked", "deal"} for item in report)
                else "failed"
            )
            report.append(
                {
                    "status": "error",
                    "error": str(error),
                    "error_type": "provider_unavailable",
                }
            )
        except NetworkOutageCircuitBreakerError as error:
            stopped_reason = str(error)
            stopped_reason_code = "network_outage"
            run_status = "partial"
        except KeyboardInterrupt as error:
            stopped_reason = "Scanner stopped before completing the run."
            stopped_reason_code = "stopped"
            run_status = "stopped"
            fatal_error = error
        except BaseException as error:  # pragma: no cover - defensive run accounting
            stopped_reason = str(error)
            stopped_reason_code = "fatal_error"
            run_status = "failed"
            fatal_error = error
        finally:
            completed_at = datetime.now(timezone.utc)
            if run_status == "running":
                has_errors = any(item.get("status") == "error" for item in report)
                run_status = "completed_with_errors" if has_errors else "completed"

            final_summary = build_price_scan_run_summary(
                run_key=run_key,
                scanner_source=self.config.scanner_source,
                routes=routes,
                report=report,
                started_at=started_at,
                completed_at=completed_at,
                status=run_status,
                started_route_keys=started_route_keys,
                completed_route_keys=completed_route_keys,
                patterns_planned=patterns_planned,
                patterns_scanned=patterns_scanned,
                retry_counts=self._run_retry_counts,
                search_window_start=search_window_start,
                search_window_end=search_window_end,
                stopped_reason=stopped_reason,
                stopped_reason_code=stopped_reason_code,
            )
            final_summary.update(
                {
                    "indicative_prices": indicative_prices_inserted,
                    "calendar_queries": self._provider_query_counts["calendar"],
                    "exact_queries": self._provider_query_counts["exact"],
                }
            )
            self._save_scan_run_summary(final_summary)
            if run_status in {"completed", "completed_with_errors"}:
                self.store.clear_price_scan_checkpoint(run_key)

        if fatal_error is not None:
            raise fatal_error

        return {
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "run_key": run_key,
            "routes_scanned": len(started_route_keys),
            "patterns_scanned": patterns_scanned,
            "rules_scanned": patterns_scanned + sum(self._run_retry_counts.values()),
            "indicative_prices_received": indicative_prices_received,
            "indicative_prices_inserted": indicative_prices_inserted,
            "indicative_price_duplicates": indicative_price_duplicates,
            "provider_queries": {
                **self._provider_query_counts,
                "total": sum(self._provider_query_counts.values()),
            },
            "report": report,
            "stopped_reason": stopped_reason,
            "stopped_reason_code": stopped_reason_code,
            "run_summary": final_summary,
        }

    def discover_route_patterns(
        self,
        limit: int | None = None,
        route_filter: dict[str, str | None] | None = None,
        only_missing_service_months: bool = False,
    ) -> dict[str, Any]:
        started_at = datetime.now(timezone.utc)
        filtered_routes = [
            route for route in self.routes if self._route_matches_filter(route, route_filter)
        ]
        routes = filtered_routes[:limit] if limit else filtered_routes
        self._pattern_discovery_state = {
            "run_key": str(uuid.uuid4()),
            "started_at": started_at,
            "routes_planned": len(routes),
            "report": [],
            "routes_started": set(),
            "routes_completed": set(),
        }
        self._pattern_discovery_checkpoint()

        try:
            result = self._discover_route_patterns_impl(
                limit=limit,
                route_filter=route_filter,
                only_missing_service_months=only_missing_service_months,
            )
            has_errors = any(
                item.get("status") in {"error", "service_calendar_error"}
                for item in result.get("report", [])
            )
            self._save_pattern_discovery_run(
                status="completed_with_errors" if has_errors else "completed",
                completed_at=datetime.now(timezone.utc),
            )
            return result
        except KeyboardInterrupt:
            self._save_pattern_discovery_run(
                status="stopped",
                completed_at=datetime.now(timezone.utc),
                error="Discovery stopped before all routes were checked.",
            )
            raise
        except BaseException as error:
            self._save_pattern_discovery_run(
                status="failed",
                completed_at=datetime.now(timezone.utc),
                error=str(error),
            )
            raise
        finally:
            self._pattern_discovery_state = None

    def _discover_route_patterns_impl(
        self,
        limit: int | None = None,
        route_filter: dict[str, str | None] | None = None,
        only_missing_service_months: bool = False,
    ) -> dict[str, Any]:
        report: list[dict[str, Any]] = []
        if self._pattern_discovery_state is not None:
            self._pattern_discovery_state["report"] = report
        filtered_routes = [
            route for route in self.routes if self._route_matches_filter(route, route_filter)
        ]
        routes = filtered_routes[:limit] if limit else filtered_routes
        routes_with_service_changes = 0

        for route in routes:
            if self._pattern_discovery_state is not None:
                self._pattern_discovery_state["routes_started"].add(route.key)
            try:
                route_id = self.store.ensure_route(route)
                service_routing = self._service_calendar_routing_for_route(route)
                existing_service_months = self.store.route_service_months(route_id, service_routing)
                if (
                    only_missing_service_months
                    and service_calendar_is_recent_success(
                        existing_service_months,
                        self._service_calendar_months(),
                        fresh_hours=self.config.service_calendar_fresh_hours,
                    )
                ):
                    report.append(
                        {
                            "route": asdict(route),
                            "status": "service_calendar_already_complete",
                            "service_months": existing_service_months,
                        }
                    )
                    self._log_progress(
                        f"Pattern discovery skipped: {route.origin_airport} -> {route.destination_airport} "
                        "already completed successfully within the last "
                        f"{self.config.service_calendar_fresh_hours / 24:g} days"
                    )
                    self._mark_pattern_route_completed(route)
                    self._pattern_discovery_checkpoint()
                    continue
                self._log_progress(
                    f"Pattern discovery start: {route.origin_airport} -> {route.destination_airport} "
                    f"({route.bucket})"
                )
            except Exception as error:  # pragma: no cover - depends on live upstream behavior
                report.append(
                    {
                        "route": asdict(route),
                        "status": "error",
                        "error": str(error),
                    }
                )
                self._mark_pattern_route_completed(route)
                self._pattern_discovery_checkpoint()
                continue

            try:
                detected_service_months = self._discover_service_months_for_route(route)
                change_events = self._build_service_change_events(
                    existing_service_months,
                    detected_service_months,
                    service_routing,
                )
                self.store.replace_route_service_months(
                    route_id,
                    service_routing,
                    detected_service_months,
                )
                rules_reset = self._reset_route_search_rules_from_service_months(
                    route,
                    route_id,
                    detected_service_months,
                )
                self.store.save_route_service_change_events(route_id, change_events)
                self._log_progress(self._service_months_log_summary(route, detected_service_months))
                self._log_progress(
                    f"Active route refresh: {route.origin_airport} -> {route.destination_airport} "
                    f"updated departures and reset {rules_reset} search rules"
                )
            except Exception as error:  # pragma: no cover - depends on live upstream behavior
                report.append(
                    {
                        "route": asdict(route),
                        "status": "service_calendar_error",
                        "error": str(error),
                    }
                )
                self._mark_pattern_route_completed(route)
                self._pattern_discovery_checkpoint()
                continue

            if change_events:
                routes_with_service_changes += 1
                self._log_progress(
                    f"Service cadence change: {route.origin_airport} -> {route.destination_airport} "
                    f"{len(change_events)} month changes detected"
                )

            window_start, window_end = self._search_window_dates(route)
            if route.patterns:
                report.append(
                    {
                        "route": asdict(route),
                        "status": "manual_override",
                        "patterns": [asdict(pattern) for pattern in route.patterns] if route.patterns else [],
                        "service_months": detected_service_months,
                        "cadence_changes": change_events,
                    }
                )
                self._log_progress(
                    f"Pattern discovery skipped: {route.origin_airport} -> {route.destination_airport} "
                    "uses manual override"
                )
                self._mark_pattern_route_completed(route)
                self._pattern_discovery_checkpoint()
                continue

            self._log_progress(
                f"Pattern discovery result: {route.origin_airport} -> {route.destination_airport} "
                "uses_defaults"
            )
            report.append(
                {
                    "route": asdict(route),
                    "status": "uses_defaults",
                    "patterns": [],
                    "service_months": detected_service_months,
                    "cadence_changes": change_events,
                }
            )
            self._mark_pattern_route_completed(route)
            self._pattern_discovery_checkpoint()

        return {
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "routes_checked": len(routes),
            "routes_with_overrides": 0,
            "routes_with_service_changes": routes_with_service_changes,
            "report": report,
        }
