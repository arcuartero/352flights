"""Targeted, leased checks of public fares. Publication decisions live in Postgres."""
from __future__ import annotations

import os
import time
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx

from .cache_revalidation import public_cache_revalidation_secret
from .models import RouteSeed, SearchPattern
from .storage import SupabaseStore


TIMING_FIELDS = (
    "outbound_departure_at", "outbound_arrival_at",
    "return_departure_at", "return_arrival_at",
    "outbound_stop_count", "return_stop_count",
)


def price_minor(price: Any) -> int:
    return int((Decimal(str(price)) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def search_context(snapshot: dict[str, Any]) -> tuple[int | None, str | None]:
    metadata = snapshot["metadata"]
    params = parse_qs(urlparse(str(metadata.get("skyscanner_url", ""))).query)
    adults = metadata.get("search_adults", params.get("adultsv2", [None])[0])
    cabin = metadata.get("search_cabin", params.get("cabinclass", [None])[0])
    try:
        return int(adults), str(cabin).lower() if cabin else None
    except (TypeError, ValueError):
        return None, None


def matches_itinerary(original: dict[str, Any], candidate: Any) -> bool:
    """Missing identity data and different flights cannot renew a quoted fare."""
    old, new = original["metadata"], candidate.metadata
    if any(old.get(field) is None or new.get(field) != old.get(field) for field in TIMING_FIELDS):
        return False
    old_codes = old.get("airline_codes") or [old.get("primary_airline_code")]
    new_codes = new.get("airline_codes") or [new.get("primary_airline_code")]
    return bool(all(old_codes)) and old_codes == new_codes and (
        candidate.departure_date == original["departure_date"]
        and candidate.return_date == original["return_date"]
        and candidate.max_stops == original["max_stops"]
        and candidate.currency.upper() == original["currency"].upper()
    )


class RenewalStore:
    def __init__(self, config: Any):
        self.client = SupabaseStore(config).client
        self.cache_url = os.getenv("PUBLIC_CACHE_REVALIDATION_URL", "").strip()
        self.secret = public_cache_revalidation_secret()

    def rpc(self, name: str, body: dict[str, Any]) -> Any:
        response = self.client.post(f"/rest/v1/rpc/{name}", json=body)
        response.raise_for_status()
        return response.json() if response.content else None

    def claim(self) -> dict[str, Any] | None:
        return self.rpc("claim_public_fare_renewal", {})

    def finish(self, job: dict[str, Any], snapshot: dict[str, Any] | None, reason: str) -> dict[str, Any]:
        return self.rpc("finish_public_fare_renewal", {
            "p_key": job["itinerary_key"], "p_token": job["lease_token"],
            "p_expected_snapshot_id": job["snapshot"]["id"],
            "p_snapshot": snapshot, "p_reason": reason,
        })

    def flush_caches(self) -> str:
        if not self.cache_url or not self.secret:
            return "not_configured"
        response = self.client.get("/rest/v1/public_fare_lifecycle", params={
            "cache_dirty": "eq.true", "select": "itinerary_key,updated_at,scanned_routes(destination_city)",
            "order": "updated_at.asc", "limit": "500",
        })
        response.raise_for_status()
        rows = response.json()
        if not rows:
            return "clean"
        cities = sorted({row["scanned_routes"]["destination_city"] for row in rows})
        response = httpx.post(self.cache_url, json={"cities": cities},
                              headers={"Authorization": f"Bearer {self.secret}"}, timeout=15)
        response.raise_for_status()
        for row in rows:
            self.rpc("ack_public_fare_cache", {
                "p_key": row["itinerary_key"], "p_updated_at": row["updated_at"],
            })
        return "revalidated"


class PublicFareRenewal:
    def __init__(self, scanner: Any, store: Any = None):
        self.scanner = scanner
        self.store = store if store is not None else RenewalStore(scanner.config)

    def check(self, job: dict[str, Any]) -> tuple[dict[str, Any] | None, str]:
        old = job["snapshot"]
        if search_context(old) != (1, "economy") or old["currency"].upper() != self.scanner.config.currency_code.upper():
            return None, "unsupported_search_context"
        row = job["route"]
        route = RouteSeed(
            origin_airport=row["origin_airport"], destination_airport=row["destination_airport"],
            destination_city=row["destination_city"], bucket=row["bucket"], trip_nights=old["trip_nights"],
            lookahead_start_days=0, lookahead_end_days=365, max_stops=old["max_stops"], teaser="",
        )
        departure = datetime.fromisoformat(old["departure_date"])
        inbound = datetime.fromisoformat(old["return_date"])
        pattern = SearchPattern(
            key=old["metadata"].get("pattern_key", ""), label=old["metadata"].get("pattern_label", "Renewal"),
            departure_weekday=departure.strftime("%a").upper(), return_weekday=inbound.strftime("%a").upper(),
            trip_nights=old["trip_nights"], month_start=departure.replace(day=1).date().isoformat(),
        )
        filters = self.scanner._build_flight_filters(route, old["departure_date"], old["return_date"])
        results = self.scanner._run_flight_search(filters, top_n=50)
        matches = []
        for result in results:
            candidate = self.scanner._build_candidate_snapshot_from_itinerary(
                route, pattern, result, old["departure_date"], old["return_date"],
            )
            if candidate is not None and matches_itinerary(old, candidate):
                matches.append(candidate)
        if not matches:
            # top_n and provider completeness are not proof of unavailability.
            return None, "itinerary_not_confirmed"
        candidate = min(matches, key=lambda item: price_minor(item.price))
        metadata = {**old["metadata"], **candidate.metadata}
        # This is a new observation, not another upload of a local scanner row.
        for key in ("local_snapshot_id", "local_route_id", "local_scanned_at", "scan_run_key", "renewal_of_snapshot_id"):
            metadata.pop(key, None)
        return {
            "price": str(Decimal(price_minor(candidate.price)) / 100),
            "scanned_at": datetime.now(timezone.utc).isoformat(), "metadata": metadata,
        }, "checked"

    def run(self, limit: int = 200) -> dict[str, Any]:
        report: dict[str, Any] = {"checked": 0, "renewed": 0, "updated": 0, "retired": 0,
                                  "pending": 0, "superseded": 0, "results": []}
        started = time.monotonic()
        for _ in range(max(0, limit)):
            if time.monotonic() - started > 45 * 60:
                break
            job = self.store.claim()
            if not job:
                break
            try:
                observation, reason = self.check(job)
            except Exception as error:
                observation, reason = None, f"provider_error:{type(error).__name__}"
            # An uncertain write is never retried with a fresh identity. The lease
            # and expected snapshot protect the next run if this request timed out.
            result = self.store.finish(job, observation, reason)
            state = result["state"]
            report["checked"] += 1
            report[state] += 1
            if state == "renewed" and price_minor(observation["price"]) != price_minor(job["snapshot"]["price"]):
                report["updated"] += 1
            report["results"].append({"snapshot_id": job["snapshot"]["id"], **result})
        try:
            report["cache"] = self.store.flush_caches()
        except Exception as error:
            report["cache"] = f"pending:{type(error).__name__}"
        return report
