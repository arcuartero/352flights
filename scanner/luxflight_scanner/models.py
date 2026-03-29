from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class RouteSeed:
    origin_airport: str
    destination_airport: str
    destination_city: str
    bucket: str
    trip_nights: int
    lookahead_start_days: int
    lookahead_end_days: int
    max_stops: str
    teaser: str
    min_trip_nights: int | None = None
    max_trip_nights: int | None = None

    def __post_init__(self) -> None:
        min_trip_nights = self.search_min_trip_nights
        max_trip_nights = self.search_max_trip_nights

        if min_trip_nights <= 0 or max_trip_nights <= 0:
            raise ValueError("Trip-night ranges must be positive.")

        if min_trip_nights > max_trip_nights:
            raise ValueError("min_trip_nights cannot be greater than max_trip_nights.")

    @property
    def key(self) -> str:
        return f"{self.origin_airport}:{self.destination_airport}:{self.bucket}"

    @property
    def search_min_trip_nights(self) -> int:
        return self.min_trip_nights if self.min_trip_nights is not None else self.trip_nights

    @property
    def search_max_trip_nights(self) -> int:
        return self.max_trip_nights if self.max_trip_nights is not None else self.trip_nights


@dataclass(frozen=True)
class SnapshotRecord:
    departure_date: str
    return_date: str
    trip_nights: int
    max_stops: str
    price: float
    currency: str
    metadata: dict[str, object]


@dataclass(frozen=True)
class DealCandidate:
    title: str
    summary: str
    deal_price: float
    baseline_price: float
    drop_ratio: float
    score: float
    send_type: str
