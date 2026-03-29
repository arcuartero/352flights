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

    @property
    def key(self) -> str:
        return f"{self.origin_airport}:{self.destination_airport}:{self.bucket}"


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

