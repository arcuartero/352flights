from __future__ import annotations

import json
from urllib.parse import urlencode
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
        self.date_search = SearchDates()
        self.flight_search = SearchFlights()

    def _build_filters(self, route: RouteSeed, trip_nights: int) -> DateSearchFilters:
        today = date.today()
        start_date = today + timedelta(days=route.lookahead_start_days)
        end_date = today + timedelta(days=route.lookahead_end_days)
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
            stops=to_max_stops(route.max_stops),
            seat_type=SeatType.ECONOMY,
            from_date=start_date.strftime("%Y-%m-%d"),
            to_date=end_date.strftime("%Y-%m-%d"),
            duration=trip_nights,
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

    def _fetch_airline_metadata(
        self,
        route: RouteSeed,
        departure_date: str,
        return_date: str,
    ) -> dict[str, object]:
        try:
            itineraries = self.flight_search.search(
                self._build_flight_filters(route, departure_date, return_date),
                top_n=3,
            ) or []
        except Exception:
            return {}

        if not itineraries:
            return {}

        cheapest_itinerary = min(itineraries, key=self._itinerary_price)
        airline_names = self._extract_airline_names(cheapest_itinerary)
        airline_codes = self._extract_airline_codes(cheapest_itinerary)
        if not airline_names:
            return {}

        metadata: dict[str, object] = {
            "airline_names": airline_names,
            "airline_codes": airline_codes,
            "primary_airline": airline_names[0],
            "primary_airline_code": airline_codes[0] if airline_codes else None,
            "shopping_price": float(self._itinerary_price(cheapest_itinerary)),
            "price_source": "shopping_results",
        }
        airline_summary = self._format_airline_summary(airline_names)
        if airline_summary:
            metadata["airline_summary"] = airline_summary
        metadata["skyscanner_url"] = self._build_skyscanner_url(route, departure_date, return_date)

        return metadata

    def _pick_cheapest(self, route: RouteSeed) -> SnapshotRecord | None:
        best_snapshot: SnapshotRecord | None = None

        for trip_nights in range(route.search_min_trip_nights, route.search_max_trip_nights + 1):
            results = self.date_search.search(self._build_filters(route, trip_nights)) or []
            if not results:
                continue

            cheapest = min(results, key=lambda item: item.price)
            outbound = cheapest.date[0].date().isoformat()
            inbound = cheapest.date[1].date().isoformat() if len(cheapest.date) > 1 else outbound

            candidate = SnapshotRecord(
                departure_date=outbound,
                return_date=inbound,
                trip_nights=trip_nights,
                max_stops=route.max_stops,
                price=float(cheapest.price),
                currency=self.config.currency_code,
                metadata={
                    "origin_airport": route.origin_airport,
                    "destination_airport": route.destination_airport,
                    "destination_city": route.destination_city,
                    "bucket": route.bucket,
                    "search_min_trip_nights": route.search_min_trip_nights,
                    "search_max_trip_nights": route.search_max_trip_nights,
                },
            )

            if best_snapshot is None or candidate.price < best_snapshot.price:
                best_snapshot = candidate

        if best_snapshot is None:
            return None

        fallback_skyscanner_url = self._build_skyscanner_url(route, best_snapshot.departure_date, best_snapshot.return_date)

        airline_metadata = self._fetch_airline_metadata(
            route,
            best_snapshot.departure_date,
            best_snapshot.return_date,
        )
        if not airline_metadata:
            return SnapshotRecord(
                departure_date=best_snapshot.departure_date,
                return_date=best_snapshot.return_date,
                trip_nights=best_snapshot.trip_nights,
                max_stops=best_snapshot.max_stops,
                price=best_snapshot.price,
                currency=best_snapshot.currency,
                metadata={
                    **best_snapshot.metadata,
                    "calendar_price": best_snapshot.price,
                    "price_source": "calendar_graph",
                    "skyscanner_url": fallback_skyscanner_url,
                },
            )

        shopping_price = airline_metadata.get("shopping_price")
        verified_price = (
            float(shopping_price)
            if isinstance(shopping_price, (int, float)) and float(shopping_price) > 0
            else best_snapshot.price
        )

        return SnapshotRecord(
            departure_date=best_snapshot.departure_date,
            return_date=best_snapshot.return_date,
            trip_nights=best_snapshot.trip_nights,
            max_stops=best_snapshot.max_stops,
            price=verified_price,
            currency=best_snapshot.currency,
            metadata={
                **best_snapshot.metadata,
                "calendar_price": best_snapshot.price,
                "skyscanner_url": fallback_skyscanner_url,
                **airline_metadata,
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
        airline_summary = snapshot.metadata.get("airline_summary")
        airline_line = f" on {airline_summary}" if isinstance(airline_summary, str) else ""
        summary = (
            f"{snapshot.trip_nights}-night roundtrip from {route.origin_airport} to "
            f"{route.destination_airport} at {format_money(snapshot.price, snapshot.currency)}"
            f"{airline_line}. "
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
