from __future__ import annotations

import json
from dataclasses import asdict
from datetime import date, datetime, timedelta
from statistics import median
from typing import Any, Iterable

from luxflight_scanner.config import ScannerConfig
from luxflight_scanner.models import DealCandidate, RouteSeed, SnapshotRecord
from luxflight_scanner.storage import create_store

try:
    from fli.models import (
        Airport,
        DateSearchFilters,
        FlightSegment,
        MaxStops,
        PassengerInfo,
        SeatType,
        TripType,
    )
    from fli.search import SearchDates
except ImportError as exc:  # pragma: no cover - only triggers before deps are installed
    raise RuntimeError(
        "Scanner dependencies are missing. Run `uv sync` from the scanner directory first."
    ) from exc


def load_routes(config: ScannerConfig) -> list[RouteSeed]:
    with config.routes_path.open("r", encoding="utf-8") as file:
        payload = json.load(file)
    return [RouteSeed(**item) for item in payload]


def to_airport(code: str) -> Airport:
    return getattr(Airport, code.upper())


def to_max_stops(name: str) -> MaxStops:
    return getattr(MaxStops, name)


def format_money(price: float, currency: str) -> str:
    symbol = "EUR " if currency == "EUR" else f"{currency} "
    return f"{symbol}{price:,.0f}"


class LuxFlightScanner:
    def __init__(self, config: ScannerConfig):
        self.config = config
        self.routes = load_routes(config)
        self.store = create_store(config)
        self.search = SearchDates()

    def _build_filters(self, route: RouteSeed) -> DateSearchFilters:
        today = date.today()
        start_date = today + timedelta(days=route.lookahead_start_days)
        end_date = today + timedelta(days=route.lookahead_end_days)
        return_date = start_date + timedelta(days=route.trip_nights)

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
            stops=to_max_stops(route.max_stops),
            seat_type=SeatType.ECONOMY,
            from_date=start_date.strftime("%Y-%m-%d"),
            to_date=end_date.strftime("%Y-%m-%d"),
            duration=route.trip_nights,
        )

    def _pick_cheapest(self, route: RouteSeed) -> SnapshotRecord | None:
        results = self.search.search(self._build_filters(route)) or []
        if not results:
            return None

        cheapest = min(results, key=lambda item: item.price)
        outbound = cheapest.date[0].date().isoformat()
        inbound = cheapest.date[1].date().isoformat() if len(cheapest.date) > 1 else outbound

        return SnapshotRecord(
            departure_date=outbound,
            return_date=inbound,
            trip_nights=route.trip_nights,
            max_stops=route.max_stops,
            price=float(cheapest.price),
            currency=self.config.currency_code,
            metadata={
                "origin_airport": route.origin_airport,
                "destination_airport": route.destination_airport,
                "destination_city": route.destination_city,
                "bucket": route.bucket,
            },
        )

    def _score_deal(
        self,
        route: RouteSeed,
        snapshot: SnapshotRecord,
        history: Iterable[float],
    ) -> DealCandidate | None:
        history_values = [float(value) for value in history if value is not None]
        if len(history_values) < 5:
            return None

        baseline = float(median(history_values))
        drop_ratio = snapshot.price / baseline if baseline else 1.0
        if drop_ratio > self.config.review_ratio:
            return None

        drop_percent = int(round((1 - drop_ratio) * 100))
        score = round(max(drop_percent * 2.2, 50), 2)
        send_type = "flash" if drop_ratio <= self.config.flash_ratio else "digest"
        title = (
            f"Luxembourg to {route.destination_city} from "
            f"{format_money(snapshot.price, snapshot.currency)}"
        )
        summary = (
            f"{route.trip_nights}-night roundtrip from {route.origin_airport} to "
            f"{route.destination_airport} at {format_money(snapshot.price, snapshot.currency)}. "
            f"That is about {drop_percent}% below the recent route median."
        )

        return DealCandidate(
            title=title,
            summary=summary,
            deal_price=snapshot.price,
            baseline_price=baseline,
            drop_ratio=round(drop_ratio, 4),
            score=score,
            send_type=send_type,
        )

    def scan(self, limit: int | None = None) -> dict[str, Any]:
        report: list[dict[str, Any]] = []
        routes = self.routes[:limit] if limit else self.routes

        for route in routes:
            try:
                route_id = self.store.ensure_route(route)
                history = self.store.latest_prices(route_id, self.config.history_window)
                snapshot = self._pick_cheapest(route)
            except Exception as error:  # pragma: no cover - depends on live upstream behavior
                report.append(
                    {
                        "route": asdict(route),
                        "status": "error",
                        "error": str(error),
                    }
                )
                continue

            if snapshot is None:
                report.append(
                    {
                        "route": asdict(route),
                        "status": "no_results",
                    }
                )
                continue

            snapshot_id = self.store.save_snapshot(route_id, snapshot)
            candidate = self._score_deal(route, snapshot, history)

            if candidate is not None:
                self.store.save_deal(route_id, snapshot_id, candidate)

            report.append(
                {
                    "route": asdict(route),
                    "status": "deal" if candidate else "tracked",
                    "snapshot": asdict(snapshot),
                    "history_points": len(list(history)),
                    "candidate": asdict(candidate) if candidate else None,
                }
            )

        return {
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "routes_scanned": len(routes),
            "report": report,
        }
