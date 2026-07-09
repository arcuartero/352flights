from __future__ import annotations

import json
import random
import sys
import time
from dataclasses import asdict, replace
from datetime import date, datetime, timedelta
from functools import wraps
from statistics import median
from typing import Any, Iterable
from urllib.parse import urlencode

from luxflight_scanner.config import ScannerConfig
from luxflight_scanner.models import (
    DealCandidate,
    PatternSelectionResult,
    RouteSeed,
    SearchPattern,
    SnapshotRecord,
)
from luxflight_scanner.storage import create_store

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

GLOBAL_LOOKAHEAD_START_DAYS = 14
GLOBAL_LOOKAHEAD_END_DAYS = 180


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


class NetworkOutageCircuitBreakerError(RuntimeError):
    """Raised when repeated network/DNS failures make the run non-actionable."""


class LuxFlightScanner:
    def __init__(self, config: ScannerConfig):
        self.config = config
        self.routes = load_routes(config)
        self.store = create_store(config)
        self._random = random.Random()
        self.date_search = SearchDates()
        self.flight_search = SearchFlights()
        self._install_default_timeout(self.date_search.client)
        if self.flight_search.client is not self.date_search.client:
            self._install_default_timeout(self.flight_search.client)

    @staticmethod
    def _log_progress(message: str) -> None:
        timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{timestamp}Z] {message}", file=sys.stderr, flush=True)

    @staticmethod
    def _log_meta_suffix(payload: dict[str, object] | None) -> str:
        if not payload:
            return ""

        return f"{LOG_META_MARKER}{json.dumps(payload, separators=(',', ':'), default=str)}"

    def _install_default_timeout(self, client: object) -> None:
        if getattr(client, "_luxcheapflights_timeout_patched", False):
            return

        timeout_seconds = self.config.search_request_timeout_seconds

        for method_name in ("get", "post"):
            original = getattr(client, method_name, None)
            if original is None:
                continue

            @wraps(original)
            def with_timeout(*args: Any, __original: Any = original, **kwargs: Any) -> Any:
                kwargs.setdefault("timeout", timeout_seconds)
                return __original(*args, **kwargs)

            setattr(client, method_name, with_timeout)

        setattr(client, "_luxcheapflights_timeout_patched", True)

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
        self._pause_between_searches()
        return self.date_search.search(filters) or []

    def _run_flight_search(
        self,
        filters: FlightSearchFilters,
        *,
        top_n: int,
    ) -> list[object]:
        self._pause_between_searches()
        return self.flight_search.search(filters, top_n=top_n) or []

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
        if self._is_network_outage_error(error):
            return "network_outage"
        if self._is_timeout_error(error):
            return "timeout"
        return "hard_error"

    @staticmethod
    def _error_log_prefix(error_type: str) -> str:
        if error_type == "timeout":
            return "Pattern timed out"
        if error_type == "network_outage":
            return "Pattern network outage"
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

    def _pick_cheapest_for_pattern_with_retry(
        self,
        route: RouteSeed,
        pattern: SearchPattern,
        date_results_cache: dict[tuple[int, str, str | None, str | None], list[object]],
        service_month_rows: list[dict[str, object]],
        pattern_progress_label: str,
    ) -> PatternSelectionResult:
        attempts = 2

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
                    self._log_progress(
                        f"Pattern retry: {pattern_progress_label} · "
                        f"{route.origin_airport} -> {route.destination_airport} "
                        f"{pattern.label} after timeout (retrying once)"
                    )
                    continue

                raise

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
                "search_min_trip_nights": route.search_min_trip_nights,
                "search_max_trip_nights": route.search_max_trip_nights,
                **LuxFlightScanner._pattern_metadata(pattern),
            },
        )

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

        defaults = {pattern.key for pattern in self._default_patterns_for_bucket(route.bucket)}
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
                    "detection_source": "auto_monthly_discovery",
                }
            )

        return discovered_months

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
                "no outbound departure dates found in the scanned months"
            )

        summary = (
            f"Service calendar result: {route.origin_airport} -> {route.destination_airport} "
            f"{'; '.join(visible_months)}"
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

            fallback_snapshot: SnapshotRecord | None = None
            relaxed_snapshot: SnapshotRecord | None = None
            rejected_short_stays: list[float] = []
            rejected_snapshot: SnapshotRecord | None = None

            for departure_date, return_date in exact_pairs:
                itineraries = self._run_flight_search(
                    self._build_flight_filters(route, departure_date, return_date),
                    top_n=3,
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

                    return PatternSelectionResult(snapshot=candidate_snapshot)

                if fallback_snapshot is None:
                    fallback_snapshot = self._build_candidate_snapshot_from_itinerary(
                        route,
                        pattern,
                        min(itineraries, key=self._itinerary_price),
                        departure_date,
                        return_date,
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
                            if relaxed_metadata.get("itinerary_rejected") == "destination_stay_under_24h":
                                continue
                            return PatternSelectionResult(
                                snapshot=self._with_relaxed_routing_metadata(
                                    route,
                                    relaxed_snapshot,
                                    relaxed_metadata,
                                ),
                            )

            reason = "No flights were returned for this route and trip length."
            return PatternSelectionResult(
                snapshot=None,
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
                        if relaxed_metadata.get("itinerary_rejected") == "destination_stay_under_24h":
                            continue
                        return PatternSelectionResult(
                            snapshot=self._with_relaxed_routing_metadata(
                                route,
                                relaxed_snapshot,
                                relaxed_metadata,
                            ),
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
                )
            )

        if fallback_snapshot is not None:
            return PatternSelectionResult(snapshot=fallback_snapshot)

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
                    metadata=rejected_metadata,
                ),
            )

        reason = "Flights were found, but none passed validation cleanly."
        return PatternSelectionResult(
            snapshot=None,
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
        visible_deals_for_destination: int,
    ) -> tuple[DealCandidate | None, dict[str, object] | None]:
        bootstrap_target = max(self.config.bootstrap_visible_deals_per_destination, 0)
        bootstrap_active = visible_deals_for_destination < bootstrap_target
        effective_review_ratio = (
            self.config.bootstrap_review_ratio
            if bootstrap_active
            else self.config.review_ratio
        )
        deal_mode = "bootstrap_inventory" if bootstrap_active else "historical_discount"

        if snapshot.price <= 0:
            return None, self._build_deal_skip_diagnostic(
                route,
                snapshot,
                [],
                reason_code="invalid_price",
                reason="The scanner found a non-positive price, so it was not eligible as an offer.",
                visible_deals_for_destination=visible_deals_for_destination,
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
                visible_deals_for_destination=visible_deals_for_destination,
                effective_review_ratio=effective_review_ratio,
                deal_mode=deal_mode,
            )

        baseline = float(median(history_values))
        drop_ratio = snapshot.price / baseline if baseline else 1.0
        if drop_ratio > effective_review_ratio:
            required_price = baseline * effective_review_ratio
            reason = (
                "Destination bootstrap is active, but this price is still above the recent "
                "pattern median. It needs to be at the median or lower to fill the public page."
                if bootstrap_active
                else (
                    "Price is not low enough versus history. It must be at or below "
                    f"{format_money(required_price, snapshot.currency)} to become an offer."
                )
            )
            return None, self._build_deal_skip_diagnostic(
                route,
                snapshot,
                history_values,
                reason_code="not_cheap_enough",
                reason=reason,
                baseline=baseline,
                drop_ratio=drop_ratio,
                visible_deals_for_destination=visible_deals_for_destination,
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
        if bootstrap_active:
            summary += (
                " Promoted because this destination still has fewer than "
                f"{bootstrap_target} visible offers."
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
        visible_deals_for_destination: int | None = None,
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
            "bootstrap_review_ratio": self.config.bootstrap_review_ratio,
            "bootstrap_visible_deal_target": self.config.bootstrap_visible_deals_per_destination,
        }
        if visible_deals_for_destination is not None:
            diagnostic["visible_deals_for_destination"] = visible_deals_for_destination
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

    def scan(self, limit: int | None = None) -> dict[str, Any]:
        report: list[dict[str, Any]] = []
        routes = self.routes[:limit] if limit else self.routes
        patterns_scanned = 0
        total_routes = len(routes)
        consecutive_network_outage_failures = 0
        stopped_reason: str | None = None
        stopped_reason_code: str | None = None
        visible_deals_by_destination: dict[str, int] = {}

        try:
            for route_index, route in enumerate(routes, start=1):
                if route_index > 1:
                    self._pause_between_routes()
                try:
                    route_id = self.store.ensure_route(route)
                    patterns = self._patterns_for_route(route, route_id)
                    route_progress_label = f"{route_index}/{total_routes}"
                    self._log_progress(
                        f"Route start: {route_progress_label} · "
                        f"{route.origin_airport} -> {route.destination_airport} "
                        f"({route.bucket}, {len(patterns)} patterns)"
                    )
                    consecutive_network_outage_failures = 0
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
                    continue

                date_results_cache: dict[tuple[int, str, str | None, str | None], list[object]] = {}
                service_month_rows = self.store.route_service_months(route_id, route.max_stops)
                total_patterns = len(patterns)
                destination_key = f"{route.origin_airport}:{route.destination_airport}"
                if destination_key not in visible_deals_by_destination:
                    visible_deals_by_destination[destination_key] = (
                        self.store.visible_deal_count_for_destination(route)
                    )

                for pattern_index, pattern in enumerate(patterns, start=1):
                    patterns_scanned += 1
                    pattern_progress_label = f"{pattern_index}/{total_patterns}"
                    try:
                        self._log_progress(
                            f"Pattern start: {pattern_progress_label} · "
                            f"{route.origin_airport} -> {route.destination_airport} "
                            f"{pattern.label}"
                        )
                        history = self.store.latest_prices(
                            route_id,
                            self.config.history_window,
                            pattern_key=pattern.key,
                        )
                        selection = self._pick_cheapest_for_pattern_with_retry(
                            route,
                            pattern,
                            date_results_cache,
                            service_month_rows,
                            pattern_progress_label,
                        )
                    except Exception as error:  # pragma: no cover - depends on live upstream behavior
                        error_type = self._classify_error_type(error)
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
                            }
                        )
                        continue

                    snapshot = selection.snapshot
                    candidate, deal_skip_diagnostic = self._score_deal(
                        route,
                        snapshot,
                        history,
                        visible_deals_by_destination[destination_key],
                    )
                    try:
                        snapshot_id = self.store.save_snapshot(route_id, snapshot)
                        if candidate is not None:
                            self.store.save_deal(route_id, snapshot_id, candidate)
                            visible_deals_by_destination[destination_key] += 1
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
                    self._log_progress(
                        f"Pattern done: {pattern_progress_label} · "
                        f"{route.origin_airport} -> {route.destination_airport} "
                        f"{pattern.label} at {snapshot.currency} {snapshot.price:.0f}"
                    )
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
                            "history_points": len(history),
                            "deal_skip_diagnostic": deal_skip_diagnostic,
                            "candidate": asdict(candidate) if candidate else None,
                        }
                    )
        except NetworkOutageCircuitBreakerError as error:
            stopped_reason = str(error)
            stopped_reason_code = "network_outage"

        return {
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "routes_scanned": len(routes),
            "patterns_scanned": patterns_scanned,
            "report": report,
            "stopped_reason": stopped_reason,
            "stopped_reason_code": stopped_reason_code,
        }

    def discover_route_patterns(
        self,
        limit: int | None = None,
        route_filter: dict[str, str | None] | None = None,
    ) -> dict[str, Any]:
        report: list[dict[str, Any]] = []
        filtered_routes = [
            route for route in self.routes if self._route_matches_filter(route, route_filter)
        ]
        routes = filtered_routes[:limit] if limit else filtered_routes
        routes_with_service_changes = 0

        for route in routes:
            try:
                route_id = self.store.ensure_route(route)
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
                continue

            try:
                service_routing = self._service_calendar_routing_for_route(route)
                existing_service_months = self.store.route_service_months(route_id, service_routing)
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
                self.store.save_route_service_change_events(route_id, change_events)
                self._log_progress(self._service_months_log_summary(route, detected_service_months))
            except Exception as error:  # pragma: no cover - depends on live upstream behavior
                report.append(
                    {
                        "route": asdict(route),
                        "status": "service_calendar_error",
                        "error": str(error),
                    }
                )
                continue

            if change_events:
                routes_with_service_changes += 1
                self._log_progress(
                    f"Service cadence change: {route.origin_airport} -> {route.destination_airport} "
                    f"{len(change_events)} month changes detected"
                )

            window_start, window_end = self._search_window_dates(route)
            monthly_rule_rows = self.store.route_search_rules(
                route_id,
                month_start_from=self._month_start(window_start).isoformat(),
                month_start_to=self._month_start(window_end).isoformat(),
            )

            if route.patterns or monthly_rule_rows:
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

        return {
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "routes_checked": len(routes),
            "routes_with_overrides": 0,
            "routes_with_service_changes": routes_with_service_changes,
            "report": report,
        }
