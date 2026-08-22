from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from statistics import mean, median
from typing import Any

from luxflight_scanner.models import RouteSeed


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _route_key(route: dict[str, Any]) -> str:
    return (
        f"{route.get('origin_airport', 'unknown')}:"
        f"{route.get('destination_airport', 'unknown')}:"
        f"{route.get('max_stops', route.get('bucket', 'unknown'))}"
    )


def _pattern_key(route_key: str, pattern: dict[str, Any] | None) -> str:
    if not pattern:
        return f"{route_key}:route"
    return f"{route_key}:{pattern.get('key', pattern.get('label', 'unknown'))}"


def _outcome_counts(items: list[dict[str, Any]]) -> dict[str, int]:
    counts = {
        "found_prices": 0,
        "deal_candidates": 0,
        "no_results": 0,
        "timed_out": 0,
        "network_outages": 0,
        "hard_errors": 0,
    }
    for item in items:
        status = item.get("status")
        if status in ("tracked", "deal"):
            counts["found_prices"] += 1
        if status == "deal":
            counts["deal_candidates"] += 1
        if status == "no_results":
            counts["no_results"] += 1
        if status != "error":
            continue

        error_type = item.get("error_type")
        if error_type == "timeout":
            counts["timed_out"] += 1
        elif error_type == "network_outage":
            counts["network_outages"] += 1
        else:
            counts["hard_errors"] += 1
    return counts


def _price_summary(report: list[dict[str, Any]]) -> dict[str, Any]:
    prices: list[float] = []
    currencies: Counter[str] = Counter()

    for item in report:
        snapshot = item.get("snapshot")
        if not isinstance(snapshot, dict):
            continue
        raw_price = snapshot.get("price")
        if not isinstance(raw_price, (int, float)):
            continue
        prices.append(float(raw_price))
        currencies.update([str(snapshot.get("currency") or "EUR")])

    if not prices:
        return {
            "currency": None,
            "min_price": None,
            "max_price": None,
            "average_price": None,
            "median_price": None,
        }

    return {
        "currency": currencies.most_common(1)[0][0],
        "min_price": round(min(prices), 2),
        "max_price": round(max(prices), 2),
        "average_price": round(mean(prices), 2),
        "median_price": round(median(prices), 2),
    }


def build_price_scan_run_summary(
    *,
    run_key: str,
    scanner_source: str,
    routes: list[RouteSeed],
    report: list[dict[str, Any]],
    started_at: datetime,
    completed_at: datetime | None,
    status: str,
    started_route_keys: set[str],
    completed_route_keys: set[str],
    patterns_planned: int,
    patterns_scanned: int,
    retry_counts: dict[str, int],
    search_window_start: date | None,
    search_window_end: date | None,
    stopped_reason: str | None = None,
    stopped_reason_code: str | None = None,
) -> dict[str, Any]:
    completed = completed_at or utcnow()
    duration_ms = max(round((completed - started_at).total_seconds() * 1000), 0)
    outcomes = _outcome_counts(report)
    prices = _price_summary(report)
    route_items: dict[str, list[dict[str, Any]]] = defaultdict(list)
    pattern_rows: list[dict[str, Any]] = []
    no_result_counts: Counter[str] = Counter()
    error_counts: Counter[str] = Counter()

    for item in report:
        route = item.get("route")
        if not isinstance(route, dict):
            continue
        route_key = _route_key(route)
        route_items[route_key].append(item)

        pattern = item.get("pattern")
        pattern = pattern if isinstance(pattern, dict) else None
        pattern_key = _pattern_key(route_key, pattern)
        snapshot = item.get("snapshot")
        snapshot = snapshot if isinstance(snapshot, dict) else None
        metadata = snapshot.get("metadata") if snapshot else None
        metadata = metadata if isinstance(metadata, dict) else {}
        diagnostic = item.get("diagnostic")
        diagnostic = diagnostic if isinstance(diagnostic, dict) else None
        retry_count = retry_counts.get(pattern_key, 0)

        if item.get("status") == "no_results":
            no_result_counts.update(
                [str(item.get("reason_code") or "unknown_no_result")]
            )
        if item.get("status") == "error":
            error_counts.update([str(item.get("error_type") or "hard_error")])

        if pattern is not None:
            pattern_rows.append(
                {
                    "route_key": route_key,
                    "route_label": (
                        f"{route.get('origin_airport', '?')} -> "
                        f"{route.get('destination_airport', '?')}"
                    ),
                    "destination_airport": route.get("destination_airport"),
                    "destination_city": route.get("destination_city"),
                    "bucket": route.get("bucket"),
                    "pattern_key": pattern.get("key"),
                    "pattern_label": pattern.get("label"),
                    "departure_weekday": pattern.get("departure_weekday"),
                    "return_weekday": pattern.get("return_weekday"),
                    "trip_nights": pattern.get("trip_nights"),
                    "status": item.get("status"),
                    "price": snapshot.get("price") if snapshot else None,
                    "currency": snapshot.get("currency") if snapshot else None,
                    "departure_date": snapshot.get("departure_date") if snapshot else None,
                    "return_date": snapshot.get("return_date") if snapshot else None,
                    "reason_code": item.get("reason_code"),
                    "reason": item.get("reason"),
                    "error_type": item.get("error_type"),
                    "error": item.get("error"),
                    "retry_count": retry_count,
                    "rules_scanned": 1 + retry_count,
                    "diagnostic": diagnostic,
                    "airline": metadata.get("airline_summary") or metadata.get("primary_airline"),
                    "airline_code": metadata.get("primary_airline_code"),
                    "outbound_departure_at": metadata.get("outbound_departure_at"),
                    "outbound_arrival_at": metadata.get("outbound_arrival_at"),
                    "return_departure_at": metadata.get("return_departure_at"),
                    "return_arrival_at": metadata.get("return_arrival_at"),
                    "outbound_stop_count": metadata.get("outbound_stop_count"),
                    "return_stop_count": metadata.get("return_stop_count"),
                }
            )

    route_rows: list[dict[str, Any]] = []
    destination_items: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for route in routes:
        items = route_items.get(route.key, [])
        route_outcomes = _outcome_counts(items)
        route_retry_count = sum(
            count
            for key, count in retry_counts.items()
            if key.startswith(f"{route.key}:")
        )
        row = {
            "route_key": route.key,
            "route_label": f"{route.origin_airport} -> {route.destination_airport}",
            "origin_airport": route.origin_airport,
            "destination_airport": route.destination_airport,
            "destination_city": route.destination_city,
            "bucket": route.bucket,
            "buckets": list(route.supported_buckets),
            "routing": route.max_stops,
            "started": route.key in started_route_keys,
            "completed": route.key in completed_route_keys,
            "patterns_scanned": sum(1 for item in items if item.get("pattern")),
            "rules_scanned": sum(1 for item in items if item.get("pattern"))
            + route_retry_count,
            "retries": route_retry_count,
            **route_outcomes,
        }
        route_rows.append(row)
        destination_items[route.destination_city].append(row)

    destination_rows: list[dict[str, Any]] = []
    for destination_city, items in destination_items.items():
        destination_rows.append(
            {
                "destination_city": destination_city,
                "destination_airports": sorted(
                    {
                        str(item["destination_airport"])
                        for item in items
                        if item.get("destination_airport")
                    }
                ),
                "routes_planned": len(items),
                "routes_started": sum(1 for item in items if item["started"]),
                "routes_completed": sum(1 for item in items if item["completed"]),
                "patterns_scanned": sum(item["patterns_scanned"] for item in items),
                "rules_scanned": sum(item["rules_scanned"] for item in items),
                "found_prices": sum(item["found_prices"] for item in items),
                "deal_candidates": sum(item["deal_candidates"] for item in items),
                "no_results": sum(item["no_results"] for item in items),
                "timed_out": sum(item["timed_out"] for item in items),
                "network_outages": sum(item["network_outages"] for item in items),
                "hard_errors": sum(item["hard_errors"] for item in items),
                "retries": sum(item["retries"] for item in items),
            }
        )

    destination_rows.sort(
        key=lambda item: (
            -int(item["hard_errors"])
            - int(item["network_outages"])
            - int(item["timed_out"]),
            -int(item["no_results"]),
            str(item["destination_city"]),
        )
    )

    scanned_cities = sorted(
        {
            route.destination_city
            for route in routes
            if route.key in started_route_keys
        }
    )

    return {
        "run_key": run_key,
        "scanner_source": scanner_source,
        "status": status,
        "started_at": started_at.isoformat(),
        "completed_at": completed_at.isoformat() if completed_at else None,
        "duration_ms": duration_ms if completed_at else None,
        "search_window_start": search_window_start.isoformat() if search_window_start else None,
        "search_window_end": search_window_end.isoformat() if search_window_end else None,
        "scanned_cities": scanned_cities,
        "routes_planned": len(routes),
        "routes_started": len(started_route_keys),
        "routes_completed": len(completed_route_keys),
        "destinations_planned": len({route.destination_city for route in routes}),
        "destinations_scanned": len(scanned_cities),
        "patterns_planned": patterns_planned,
        "patterns_scanned": patterns_scanned,
        "rules_scanned": patterns_scanned + sum(retry_counts.values()),
        "retries": sum(retry_counts.values()),
        **outcomes,
        **prices,
        "stopped_reason": stopped_reason,
        "stopped_reason_code": stopped_reason_code,
        "destinations": destination_rows,
        "routes": route_rows,
        "patterns": pattern_rows,
        "no_result_breakdown": dict(no_result_counts),
        "error_breakdown": dict(error_counts),
        "sync_status": "pending",
        "sync_summary": {},
        # This timestamp is produced only by the active scanner process. A
        # later sync retry reuses the saved value instead of manufacturing a
        # new heartbeat, so it cannot make an abandoned run look alive.
        "heartbeat_at": completed.isoformat(),
        "updated_at": completed.isoformat(),
    }
