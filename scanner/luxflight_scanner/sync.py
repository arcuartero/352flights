from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from luxflight_scanner.config import ScannerConfig
from luxflight_scanner.models import DealCandidate, RouteSeed, SnapshotRecord
from luxflight_scanner.scanner import load_routes
from luxflight_scanner.storage import SupabaseStore, utcnow_iso


def _load_state(state_path: Path) -> dict[str, Any]:
    if not state_path.exists():
        return {
            "snapshots": [],
            "deals": [],
            "route_pattern_overrides": [],
            "route_service_months": [],
            "route_search_rules": [],
            "route_service_change_events": [],
        }

    with state_path.open("r", encoding="utf-8") as file:
        payload = json.load(file)

    payload.setdefault("snapshots", [])
    payload.setdefault("deals", [])
    payload.setdefault("route_pattern_overrides", [])
    payload.setdefault("route_service_months", [])
    payload.setdefault("route_search_rules", [])
    payload.setdefault("route_service_change_events", [])
    return payload


def _persist_state(state_path: Path, state: dict[str, Any]) -> None:
    state_path.parent.mkdir(parents=True, exist_ok=True)
    with state_path.open("w", encoding="utf-8") as file:
        json.dump(state, file, indent=2)


def _is_synced(item: dict[str, Any]) -> bool:
    sync = item.get("sync")
    return isinstance(sync, dict) and bool(sync.get("supabase_id") or sync.get("synced_at"))


class LocalSupabaseSync:
    def __init__(self, config: ScannerConfig):
        if not config.has_supabase_credentials:
            raise RuntimeError(
                "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. "
                "The scanner can still store locally, but sync needs both values."
            )

        self.config = config
        self.state_path = config.state_path
        self.supabase = SupabaseStore(config)
        self.routes_by_key = {
            route.key: route
            for route in load_routes(config)
        }
        self.remote_route_ids: dict[str, str] = {}

    def _route_for_snapshot(self, snapshot: dict[str, Any]) -> RouteSeed:
        route_id = str(snapshot.get("route_id") or "")
        route = self.routes_by_key.get(route_id)
        if route is not None:
            return route

        metadata = snapshot.get("metadata")
        if isinstance(metadata, dict):
            origin = metadata.get("origin_airport")
            destination = metadata.get("destination_airport")
            bucket = metadata.get("bucket")
            if isinstance(origin, str) and isinstance(destination, str) and isinstance(bucket, str):
                route = self.routes_by_key.get(f"{origin}:{destination}:{bucket}")
                if route is not None:
                    return route

        raise RuntimeError(f"Cannot map local route_id={route_id!r} to a configured route.")

    def _remote_route_id(self, route: RouteSeed) -> str:
        local_route_id = route.key
        if local_route_id not in self.remote_route_ids:
            self.remote_route_ids[local_route_id] = self.supabase.ensure_route(route)
        return self.remote_route_ids[local_route_id]

    @staticmethod
    def _snapshot_record(snapshot: dict[str, Any]) -> SnapshotRecord:
        metadata = snapshot.get("metadata")
        if not isinstance(metadata, dict):
            metadata = {}

        enriched_metadata = {
            **metadata,
            "sync_source": "local_state",
            "local_route_id": snapshot.get("route_id"),
            "local_snapshot_id": str(snapshot.get("id")),
            "local_scanned_at": snapshot.get("scanned_at"),
        }

        return SnapshotRecord(
            departure_date=str(snapshot["departure_date"]),
            return_date=str(snapshot["return_date"]),
            trip_nights=int(snapshot["trip_nights"]),
            max_stops=str(snapshot["max_stops"]),
            price=float(snapshot["price"]),
            currency=str(snapshot.get("currency") or "EUR"),
            metadata=enriched_metadata,
        )

    @staticmethod
    def _deal_candidate(deal: dict[str, Any]) -> DealCandidate:
        return DealCandidate(
            title=str(deal["title"]),
            summary=str(deal["summary"]),
            deal_price=float(deal["deal_price"]),
            baseline_price=float(deal["baseline_price"]),
            drop_ratio=float(deal["drop_ratio"]),
            score=float(deal["score"]),
            send_type=str(deal.get("send_type") or "digest"),
        )

    def sync(self, limit: int | None = None) -> dict[str, Any]:
        state = _load_state(self.state_path)
        synced_at = utcnow_iso()
        report: dict[str, Any] = {
            "state_path": str(self.state_path),
            "generated_at": synced_at,
            "snapshots_synced": 0,
            "deals_synced": 0,
            "snapshots_skipped": 0,
            "deals_skipped": 0,
            "errors": [],
        }

        local_to_remote_snapshot_ids: dict[str, str] = {}
        local_snapshots_by_id = {
            str(snapshot.get("id")): snapshot
            for snapshot in state["snapshots"]
        }
        processed = 0

        for snapshot in state["snapshots"]:
            local_snapshot_id = str(snapshot.get("id"))
            sync = snapshot.get("sync")
            if isinstance(sync, dict) and sync.get("supabase_id"):
                local_to_remote_snapshot_ids[local_snapshot_id] = str(sync["supabase_id"])
                report["snapshots_skipped"] += 1
                continue

            if limit is not None and processed >= limit:
                break

            try:
                route = self._route_for_snapshot(snapshot)
                remote_route_id = self._remote_route_id(route)
                existing_snapshot_id = self.supabase.find_synced_snapshot(
                    remote_route_id,
                    local_snapshot_id,
                )
                if existing_snapshot_id is not None:
                    remote_snapshot_id = existing_snapshot_id
                else:
                    remote_snapshot_id = self.supabase.save_snapshot(
                        remote_route_id,
                        self._snapshot_record(snapshot),
                        scanned_at=snapshot.get("scanned_at"),
                    )

                snapshot["sync"] = {
                    "supabase_id": remote_snapshot_id,
                    "synced_at": utcnow_iso(),
                }
                local_to_remote_snapshot_ids[local_snapshot_id] = remote_snapshot_id
                report["snapshots_synced"] += 1
                processed += 1
                _persist_state(self.state_path, state)
            except Exception as error:  # pragma: no cover - depends on live Supabase
                report["errors"].append(
                    {
                        "type": "snapshot",
                        "local_id": local_snapshot_id,
                        "error": str(error),
                    }
                )

        for deal in state["deals"]:
            if _is_synced(deal):
                report["deals_skipped"] += 1
                continue

            local_snapshot_id = str(deal.get("snapshot_id"))
            remote_snapshot_id = local_to_remote_snapshot_ids.get(local_snapshot_id)
            if remote_snapshot_id is None:
                report["deals_skipped"] += 1
                continue

            try:
                local_snapshot = local_snapshots_by_id.get(local_snapshot_id)
                if local_snapshot is None:
                    raise RuntimeError(f"Missing local snapshot {local_snapshot_id!r} for deal.")
                remote_route_id = self._remote_route_id(self._route_for_snapshot(local_snapshot))
                existing_deal_id = self.supabase.find_deal_by_snapshot_id(remote_snapshot_id)
                if existing_deal_id is None:
                    self.supabase.save_deal(
                        remote_route_id,
                        remote_snapshot_id,
                        self._deal_candidate(deal),
                    )
                    existing_deal_id = "created"

                deal["sync"] = {
                    "supabase_id": existing_deal_id,
                    "supabase_snapshot_id": remote_snapshot_id,
                    "synced_at": utcnow_iso(),
                }
                report["deals_synced"] += 1
                _persist_state(self.state_path, state)
            except Exception as error:  # pragma: no cover - depends on live Supabase
                report["errors"].append(
                    {
                        "type": "deal",
                        "local_snapshot_id": local_snapshot_id,
                        "error": str(error),
                    }
                )

        report["remote_routes_touched"] = len(self.remote_route_ids)
        report["configured_routes"] = len(self.routes_by_key)
        report["storage_mode"] = self.config.storage_mode
        return report
