from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

from luxflight_scanner.config import ScannerConfig
from luxflight_scanner.models import DealCandidate, RouteSeed, SnapshotRecord


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class LocalStore:
    def __init__(self, state_path: Path):
        self.state_path = state_path
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        self._state = self._load_state()

    def _load_state(self) -> dict[str, Any]:
        if not self.state_path.exists():
            return {"snapshots": [], "deals": []}

        with self.state_path.open("r", encoding="utf-8") as file:
            return json.load(file)

    def _persist(self) -> None:
        with self.state_path.open("w", encoding="utf-8") as file:
            json.dump(self._state, file, indent=2)

    def ensure_route(self, route: RouteSeed) -> str:
        return route.key

    def latest_prices(self, route_id: str, limit: int) -> list[float]:
        snapshots = [
            snapshot["price"]
            for snapshot in self._state["snapshots"]
            if snapshot["route_id"] == route_id
        ]
        return list(reversed(snapshots[-limit:]))

    def save_snapshot(self, route_id: str, snapshot: SnapshotRecord) -> str:
        snapshot_id = str(len(self._state["snapshots"]) + 1)
        self._state["snapshots"].append(
            {
                "id": snapshot_id,
                "route_id": route_id,
                "scanned_at": utcnow_iso(),
                "departure_date": snapshot.departure_date,
                "return_date": snapshot.return_date,
                "trip_nights": snapshot.trip_nights,
                "max_stops": snapshot.max_stops,
                "price": snapshot.price,
                "currency": snapshot.currency,
                "metadata": snapshot.metadata,
            }
        )
        self._persist()
        return snapshot_id

    def save_deal(self, route_id: str, snapshot_id: str, deal: DealCandidate) -> None:
        already_saved = any(item["snapshot_id"] == snapshot_id for item in self._state["deals"])
        if already_saved:
            return

        self._state["deals"].append(
            {
                "id": str(len(self._state["deals"]) + 1),
                "route_id": route_id,
                "snapshot_id": snapshot_id,
                "title": deal.title,
                "summary": deal.summary,
                "deal_price": deal.deal_price,
                "baseline_price": deal.baseline_price,
                "drop_ratio": deal.drop_ratio,
                "score": deal.score,
                "send_type": deal.send_type,
                "status": "new",
                "created_at": utcnow_iso(),
            }
        )
        self._persist()


class SupabaseStore:
    def __init__(self, config: ScannerConfig):
        self.client = httpx.Client(
            base_url=config.supabase_url.rstrip("/"),
            headers={
                "apikey": config.supabase_service_role_key,
                "Authorization": f"Bearer {config.supabase_service_role_key}",
                "Content-Type": "application/json",
            },
            timeout=30.0,
        )

    def _route_payload(self, route: RouteSeed) -> dict[str, Any]:
        return {
            "origin_airport": route.origin_airport,
            "destination_airport": route.destination_airport,
            "destination_city": route.destination_city,
            "bucket": route.bucket,
            "teaser": route.teaser,
            "trip_nights": route.trip_nights,
            "min_trip_nights": route.search_min_trip_nights,
            "max_trip_nights": route.search_max_trip_nights,
            "lookahead_start_days": route.lookahead_start_days,
            "lookahead_end_days": route.lookahead_end_days,
            "max_stops": route.max_stops,
        }

    def ensure_route(self, route: RouteSeed) -> str:
        response = self.client.get(
            "/rest/v1/scanned_routes",
            params={
                "origin_airport": f"eq.{route.origin_airport}",
                "destination_airport": f"eq.{route.destination_airport}",
                "bucket": f"eq.{route.bucket}",
                "select": "id",
                "limit": "1",
            },
        )
        response.raise_for_status()
        data = response.json()
        if data:
            route_id = data[0]["id"]
            update_response = self.client.patch(
                "/rest/v1/scanned_routes",
                params={"id": f"eq.{route_id}"},
                headers={"Prefer": "return=minimal"},
                json=self._route_payload(route),
            )
            update_response.raise_for_status()
            return route_id

        insert_response = self.client.post(
            "/rest/v1/scanned_routes",
            headers={"Prefer": "return=representation"},
            json=self._route_payload(route),
        )
        insert_response.raise_for_status()
        created = insert_response.json()
        return created[0]["id"]

    def latest_prices(self, route_id: str, limit: int) -> list[float]:
        response = self.client.get(
            "/rest/v1/price_snapshots",
            params={
                "route_id": f"eq.{route_id}",
                "select": "price",
                "order": "scanned_at.desc",
                "limit": str(limit),
            },
        )
        response.raise_for_status()
        return [float(item["price"]) for item in response.json()]

    def save_snapshot(self, route_id: str, snapshot: SnapshotRecord) -> str:
        response = self.client.post(
            "/rest/v1/price_snapshots",
            headers={"Prefer": "return=representation"},
            json={
                "route_id": route_id,
                "departure_date": snapshot.departure_date,
                "return_date": snapshot.return_date,
                "trip_nights": snapshot.trip_nights,
                "max_stops": snapshot.max_stops,
                "price": snapshot.price,
                "currency": snapshot.currency,
                "metadata": snapshot.metadata,
            },
        )
        response.raise_for_status()
        return str(response.json()[0]["id"])

    def save_deal(self, route_id: str, snapshot_id: str, deal: DealCandidate) -> None:
        response = self.client.post(
            "/rest/v1/deal_candidates",
            headers={"Prefer": "return=minimal,resolution=ignore-duplicates"},
            json={
                "route_id": route_id,
                "snapshot_id": int(snapshot_id),
                "title": deal.title,
                "summary": deal.summary,
                "deal_price": deal.deal_price,
                "baseline_price": deal.baseline_price,
                "drop_ratio": deal.drop_ratio,
                "score": deal.score,
                "send_type": deal.send_type,
            },
        )

        if response.status_code not in (200, 201):
            response.raise_for_status()


def create_store(config: ScannerConfig) -> LocalStore | SupabaseStore:
    if config.use_supabase:
        return SupabaseStore(config)
    return LocalStore(config.state_path)
