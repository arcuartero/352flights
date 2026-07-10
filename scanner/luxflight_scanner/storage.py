from __future__ import annotations

import json
import os
import random
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

from luxflight_scanner.config import ScannerConfig
from luxflight_scanner.models import DealCandidate, RouteSeed, SnapshotRecord


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def write_json_atomic(target_path: Path, payload: dict[str, Any]) -> None:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = target_path.with_name(f".{target_path.name}.{os.getpid()}.tmp")
    try:
        with temp_path.open("w", encoding="utf-8") as file:
            json.dump(payload, file, indent=2)
            file.write("\n")
            file.flush()
            os.fsync(file.fileno())
        temp_path.replace(target_path)
    finally:
        temp_path.unlink(missing_ok=True)


def destination_stay_hours(metadata: dict[str, Any] | None) -> float | None:
    if not isinstance(metadata, dict):
        return None

    value = metadata.get("destination_stay_hours")
    if isinstance(value, (int, float)):
        return float(value)

    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None

    return None


def has_short_destination_stay(metadata: dict[str, Any] | None, minimum_hours: float = 24.0) -> bool:
    hours = destination_stay_hours(metadata)
    return hours is not None and hours < minimum_hours


def has_non_positive_price(value: object) -> bool:
    return not isinstance(value, (int, float)) or float(value) <= 0


class LocalStore:
    def __init__(self, state_path: Path):
        self.state_path = state_path
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        self._state = self._load_state()

    def _load_state(self) -> dict[str, Any]:
        if not self.state_path.exists():
            return {
                "snapshots": [],
                "deals": [],
                "route_pattern_overrides": [],
                "route_service_months": [],
                "route_search_rules": [],
                "route_service_change_events": [],
            }

        with self.state_path.open("r", encoding="utf-8") as file:
            payload = json.load(file)

        payload.setdefault("snapshots", [])
        payload.setdefault("deals", [])
        payload.setdefault("route_pattern_overrides", [])
        payload.setdefault("route_service_months", [])
        payload.setdefault("route_search_rules", [])
        payload.setdefault("route_service_change_events", [])
        return payload

    def _persist(self) -> None:
        write_json_atomic(self.state_path, self._state)

    def ensure_route(self, route: RouteSeed) -> str:
        return route.key

    def latest_prices(self, route_id: str, limit: int, pattern_key: str | None = None) -> list[float]:
        snapshots = [
            snapshot["price"]
            for snapshot in self._state["snapshots"]
            if snapshot["route_id"] == route_id
            and not has_short_destination_stay(snapshot.get("metadata"))
            and (
                pattern_key is None
                or (
                    isinstance(snapshot.get("metadata"), dict)
                    and snapshot["metadata"].get("pattern_key") == pattern_key
                )
            )
        ]
        return list(reversed(snapshots[-limit:]))

    def save_snapshot(self, route_id: str, snapshot: SnapshotRecord) -> str:
        if has_non_positive_price(snapshot.price):
            raise ValueError(f"Refusing to save non-positive snapshot price for route_id={route_id}.")

        scanned_at = utcnow_iso()
        snapshot_id = str(len(self._state["snapshots"]) + 1)
        self._state["snapshots"].append(
            {
                "id": snapshot_id,
                "route_id": route_id,
                "scanned_at": scanned_at,
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

    def snapshot_by_id(self, snapshot_id: str) -> dict[str, Any] | None:
        for snapshot in self._state["snapshots"]:
            if str(snapshot.get("id")) == str(snapshot_id):
                return snapshot
        return None

    def mark_snapshot_synced(self, snapshot_id: str, remote_snapshot_id: str) -> None:
        snapshot = self.snapshot_by_id(snapshot_id)
        if snapshot is None:
            return

        snapshot["sync"] = {
            "supabase_id": remote_snapshot_id,
            "synced_at": utcnow_iso(),
        }
        self._persist()

    def save_deal(self, route_id: str, snapshot_id: str, deal: DealCandidate) -> None:
        if has_non_positive_price(deal.deal_price):
            raise ValueError(f"Refusing to save non-positive deal price for route_id={route_id}.")

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

    def mark_deal_synced(
        self,
        snapshot_id: str,
        remote_deal_id: str,
        remote_snapshot_id: str,
    ) -> None:
        for deal in self._state["deals"]:
            if str(deal.get("snapshot_id")) != str(snapshot_id):
                continue

            deal["sync"] = {
                "supabase_id": remote_deal_id,
                "supabase_snapshot_id": remote_snapshot_id,
                "synced_at": utcnow_iso(),
            }
            self._persist()
            return

    def route_pattern_overrides(self, route_id: str) -> list[dict[str, Any]]:
        today = datetime.now(timezone.utc).date().isoformat()
        return [
            item
            for item in self._state["route_pattern_overrides"]
            if item["route_id"] == route_id
            and item.get("is_active", True)
            and (item.get("valid_until") is None or item["valid_until"] >= today)
        ]

    def route_search_rules(
        self,
        route_id: str,
        *,
        month_start_from: str | None = None,
        month_start_to: str | None = None,
    ) -> list[dict[str, Any]]:
        items = [
            item
            for item in self._state["route_search_rules"]
            if item["route_id"] == route_id and item.get("is_active", True)
        ]
        if month_start_from is not None:
            items = [item for item in items if item["month_start"] >= month_start_from]
        if month_start_to is not None:
            items = [item for item in items if item["month_start"] <= month_start_to]
        return sorted(items, key=lambda item: (item["month_start"], item.get("sort_order", 0)))

    def route_service_months(self, route_id: str, routing: str) -> list[dict[str, Any]]:
        return sorted(
            [
                item
                for item in self._state["route_service_months"]
                if item["route_id"] == route_id and item["routing"] == routing
            ],
            key=lambda item: item["month_start"],
        )

    def replace_route_service_months(
        self,
        route_id: str,
        routing: str,
        months: list[dict[str, Any]],
    ) -> None:
        self._state["route_service_months"] = [
            item
            for item in self._state["route_service_months"]
            if not (item["route_id"] == route_id and item["routing"] == routing)
        ]

        checked_at = utcnow_iso()
        for month in months:
            self._state["route_service_months"].append(
                {
                    "id": f"{route_id}:{routing}:{month['month_start']}",
                    "route_id": route_id,
                    "month_start": month["month_start"],
                    "routing": routing,
                    "departure_dates": month["departure_dates"],
                    "departure_weekdays": month["departure_weekdays"],
                    "observed_patterns": month["observed_patterns"],
                    "sample_size": month["sample_size"],
                    "detection_source": month.get("detection_source", "auto_monthly_discovery"),
                    "last_checked_at": checked_at,
                }
            )

        self._persist()

    def save_route_service_change_events(
        self,
        route_id: str,
        events: list[dict[str, Any]],
    ) -> None:
        for index, event in enumerate(events, start=1):
            self._state["route_service_change_events"].append(
                {
                    "id": f"{route_id}:change:{len(self._state['route_service_change_events']) + index}",
                    "route_id": route_id,
                    **event,
                    "detected_at": utcnow_iso(),
                    "is_acknowledged": False,
                }
            )

        if events:
            self._persist()

    def replace_route_pattern_overrides(
        self,
        route_id: str,
        patterns: list[dict[str, Any]],
        *,
        source: str,
        valid_until: str,
        discovery_window_start_days: int,
        discovery_window_end_days: int,
    ) -> None:
        self._state["route_pattern_overrides"] = [
            item
            for item in self._state["route_pattern_overrides"]
            if item["route_id"] != route_id
        ]

        for index, pattern in enumerate(patterns):
            self._state["route_pattern_overrides"].append(
                {
                    "id": f"{route_id}:{pattern['key']}",
                    "route_id": route_id,
                    "pattern_key": pattern["key"],
                    "pattern_label": pattern["label"],
                    "departure_weekday": pattern["departure_weekday"],
                    "return_weekday": pattern["return_weekday"],
                    "trip_nights": pattern["trip_nights"],
                    "sort_order": index,
                    "source": source,
                    "is_active": True,
                    "last_checked_at": utcnow_iso(),
                    "valid_until": valid_until,
                    "discovery_window_start_days": discovery_window_start_days,
                    "discovery_window_end_days": discovery_window_end_days,
                }
            )

        self._persist()


class SupabaseStore:
    def __init__(self, config: ScannerConfig):
        self.write_attempts = max(config.storage_write_attempts, 1)
        self.retry_min_seconds = min(
            config.storage_retry_min_seconds,
            config.storage_retry_max_seconds,
        )
        self.retry_max_seconds = max(
            config.storage_retry_min_seconds,
            config.storage_retry_max_seconds,
        )
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

    def _sleep_before_retry(self) -> None:
        delay = random.uniform(self.retry_min_seconds, self.retry_max_seconds)
        if delay > 0:
            time.sleep(delay)

    def _post_with_retry(
        self,
        path: str,
        *,
        operation_label: str,
        headers: dict[str, str],
        json: dict[str, Any] | list[dict[str, Any]],
    ) -> httpx.Response:
        last_error: httpx.RequestError | None = None

        for attempt in range(1, self.write_attempts + 1):
            try:
                return self.client.post(path, headers=headers, json=json)
            except httpx.RequestError as error:
                last_error = error
                if attempt >= self.write_attempts:
                    break
                self._sleep_before_retry()

        raise RuntimeError(
            f"Supabase {operation_label} failed after {self.write_attempts} attempt(s): "
            f"{last_error}"
        ) from last_error

    @staticmethod
    def _is_missing_table_error(response: httpx.Response) -> bool:
        body = response.text.lower()
        return response.status_code in (400, 404) and (
            "route_pattern_overrides" in body
            or "does not exist" in body
            or "schema cache" in body
        )

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

    def latest_prices(self, route_id: str, limit: int, pattern_key: str | None = None) -> list[float]:
        params = {
            "route_id": f"eq.{route_id}",
            "select": "price,metadata",
            "order": "scanned_at.desc",
            "limit": str(max(limit * 4, 40)),
        }
        if pattern_key:
            params["metadata->>pattern_key"] = f"eq.{pattern_key}"

        response = self.client.get(
            "/rest/v1/price_snapshots",
            params=params,
        )
        response.raise_for_status()
        prices = [
            float(item["price"])
            for item in response.json()
            if not has_short_destination_stay(item.get("metadata"))
        ]
        return prices[:limit]

    def find_synced_snapshot(self, route_id: str, local_snapshot_id: str) -> str | None:
        response = self.client.get(
            "/rest/v1/price_snapshots",
            params={
                "route_id": f"eq.{route_id}",
                "metadata->>local_snapshot_id": f"eq.{local_snapshot_id}",
                "select": "id",
                "limit": "1",
            },
        )
        response.raise_for_status()
        data = response.json()
        if not data:
            return None
        return str(data[0]["id"])

    def save_snapshot(
        self,
        route_id: str,
        snapshot: SnapshotRecord,
        *,
        scanned_at: str | None = None,
    ) -> str:
        if has_non_positive_price(snapshot.price):
            raise ValueError(f"Refusing to save non-positive snapshot price for route_id={route_id}.")

        payload: dict[str, Any] = {
            "route_id": route_id,
            "departure_date": snapshot.departure_date,
            "return_date": snapshot.return_date,
            "trip_nights": snapshot.trip_nights,
            "max_stops": snapshot.max_stops,
            "price": snapshot.price,
            "currency": snapshot.currency,
            "metadata": snapshot.metadata,
        }
        if scanned_at:
            payload["scanned_at"] = scanned_at

        response = self._post_with_retry(
            "/rest/v1/price_snapshots",
            operation_label="snapshot insert",
            headers={"Prefer": "return=representation"},
            json=payload,
        )
        response.raise_for_status()
        return str(response.json()[0]["id"])

    def find_deal_by_snapshot_id(self, snapshot_id: str) -> str | None:
        response = self.client.get(
            "/rest/v1/deal_candidates",
            params={
                "snapshot_id": f"eq.{snapshot_id}",
                "select": "id",
                "limit": "1",
            },
        )
        response.raise_for_status()
        data = response.json()
        if not data:
            return None
        return str(data[0]["id"])

    def save_deal(self, route_id: str, snapshot_id: str, deal: DealCandidate) -> None:
        if has_non_positive_price(deal.deal_price):
            raise ValueError(f"Refusing to save non-positive deal price for route_id={route_id}.")

        response = self._post_with_retry(
            "/rest/v1/deal_candidates",
            operation_label="deal insert",
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
                "status": "new",
            },
        )

        if response.status_code not in (200, 201):
            raise RuntimeError(
                "Supabase rejected deal insert "
                f"(status {response.status_code}) for route_id={route_id} "
                f"snapshot_id={snapshot_id} send_type={deal.send_type} "
                f"deal_price={deal.deal_price} baseline_price={deal.baseline_price} "
                f"drop_ratio={deal.drop_ratio} score={deal.score}. "
                f"Response body: {response.text}"
            )

    def route_pattern_overrides(self, route_id: str) -> list[dict[str, Any]]:
        today = datetime.now(timezone.utc).date().isoformat()
        response = self.client.get(
            "/rest/v1/route_pattern_overrides",
            params={
                "route_id": f"eq.{route_id}",
                "is_active": "eq.true",
                "or": f"(valid_until.is.null,valid_until.gte.{today})",
                "select": "pattern_key,pattern_label,departure_weekday,return_weekday,trip_nights,sort_order",
                "order": "sort_order.asc,pattern_key.asc",
            },
        )
        if self._is_missing_table_error(response):
            return []

        response.raise_for_status()
        return response.json()

    def route_search_rules(
        self,
        route_id: str,
        *,
        month_start_from: str | None = None,
        month_start_to: str | None = None,
    ) -> list[dict[str, Any]]:
        response = self.client.get(
            "/rest/v1/route_search_rules",
            params={
                "route_id": f"eq.{route_id}",
                "is_active": "eq.true",
                "select": (
                    "month_start,pattern_key,pattern_label,departure_weekday,"
                    "return_weekday,trip_nights,max_stops,sort_order"
                ),
                "order": "month_start.asc,sort_order.asc,pattern_key.asc",
            },
        )
        if self._is_missing_table_error(response):
            return []

        response.raise_for_status()
        data = response.json()
        if month_start_from is not None:
            data = [item for item in data if item["month_start"] >= month_start_from]
        if month_start_to is not None:
            data = [item for item in data if item["month_start"] <= month_start_to]
        return data

    def route_service_months(self, route_id: str, routing: str) -> list[dict[str, Any]]:
        response = self.client.get(
            "/rest/v1/route_service_months",
            params={
                "route_id": f"eq.{route_id}",
                "routing": f"eq.{routing}",
                "select": (
                    "month_start,departure_dates,departure_weekdays,observed_patterns,sample_size"
                ),
                "order": "month_start.asc",
            },
        )
        if self._is_missing_table_error(response):
            return []

        response.raise_for_status()
        return response.json()

    def replace_route_service_months(
        self,
        route_id: str,
        routing: str,
        months: list[dict[str, Any]],
    ) -> None:
        delete_response = self.client.delete(
            "/rest/v1/route_service_months",
            params={
                "route_id": f"eq.{route_id}",
                "routing": f"eq.{routing}",
            },
            headers={"Prefer": "return=minimal"},
        )
        if not self._is_missing_table_error(delete_response):
            delete_response.raise_for_status()

        if not months:
            return

        insert_response = self.client.post(
            "/rest/v1/route_service_months",
            headers={"Prefer": "return=minimal"},
            json=[
                {
                    "route_id": route_id,
                    "month_start": month["month_start"],
                    "routing": routing,
                    "departure_dates": month["departure_dates"],
                    "departure_weekdays": month["departure_weekdays"],
                    "observed_patterns": month["observed_patterns"],
                    "sample_size": month["sample_size"],
                    "detection_source": month.get("detection_source", "auto_monthly_discovery"),
                    "last_checked_at": utcnow_iso(),
                }
                for month in months
            ],
        )
        if self._is_missing_table_error(insert_response):
            return

        insert_response.raise_for_status()

    def save_route_service_change_events(
        self,
        route_id: str,
        events: list[dict[str, Any]],
    ) -> None:
        if not events:
            return

        response = self.client.post(
            "/rest/v1/route_service_change_events",
            headers={"Prefer": "return=minimal"},
            json=[
                {
                    "route_id": route_id,
                    **event,
                }
                for event in events
            ],
        )
        if self._is_missing_table_error(response):
            return

        response.raise_for_status()

    def replace_route_pattern_overrides(
        self,
        route_id: str,
        patterns: list[dict[str, Any]],
        *,
        source: str,
        valid_until: str,
        discovery_window_start_days: int,
        discovery_window_end_days: int,
    ) -> None:
        delete_response = self.client.delete(
            "/rest/v1/route_pattern_overrides",
            params={"route_id": f"eq.{route_id}"},
            headers={"Prefer": "return=minimal"},
        )
        delete_response.raise_for_status()

        if not patterns:
            return

        insert_response = self.client.post(
            "/rest/v1/route_pattern_overrides",
            headers={"Prefer": "return=minimal"},
            json=[
                {
                    "route_id": route_id,
                    "pattern_key": pattern["key"],
                    "pattern_label": pattern["label"],
                    "departure_weekday": pattern["departure_weekday"],
                    "return_weekday": pattern["return_weekday"],
                    "trip_nights": pattern["trip_nights"],
                    "sort_order": index,
                    "source": source,
                    "is_active": True,
                    "last_checked_at": utcnow_iso(),
                    "valid_until": valid_until,
                    "discovery_window_start_days": discovery_window_start_days,
                    "discovery_window_end_days": discovery_window_end_days,
                }
                for index, pattern in enumerate(patterns)
            ],
        )
        insert_response.raise_for_status()


def create_store(config: ScannerConfig) -> LocalStore | SupabaseStore:
    if config.use_supabase:
        return SupabaseStore(config)
    return LocalStore(config.state_path)
