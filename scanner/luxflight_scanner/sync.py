from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from luxflight_scanner.config import ScannerConfig
from luxflight_scanner.models import DealCandidate, RouteSeed, SnapshotRecord
from luxflight_scanner.scanner import load_routes
from luxflight_scanner.storage import SupabaseStore, utcnow_iso, write_json_atomic


def _load_state(state_path: Path) -> dict[str, Any]:
    if not state_path.exists():
        return {
            "snapshots": [],
            "deals": [],
            "route_pattern_overrides": [],
            "route_service_months": [],
            "route_search_rules": [],
            "route_service_change_events": [],
            "price_scan_runs": [],
        }

    with state_path.open("r", encoding="utf-8") as file:
        payload = json.load(file)

    payload.setdefault("snapshots", [])
    payload.setdefault("deals", [])
    payload.setdefault("route_pattern_overrides", [])
    payload.setdefault("route_service_months", [])
    payload.setdefault("route_search_rules", [])
    payload.setdefault("route_service_change_events", [])
    payload.setdefault("price_scan_runs", [])
    return payload


def _persist_state(state_path: Path, state: dict[str, Any]) -> None:
    write_json_atomic(state_path, state)


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
        routes = load_routes(config)
        self.routes_by_key = {route.key: route for route in routes}
        self.routes_by_legacy_key = {
            f"{route.origin_airport}:{route.destination_airport}:{bucket}": route
            for route in routes
            for bucket in route.supported_buckets
        }
        self.remote_route_ids: dict[str, str] = {}

    @staticmethod
    def _with_local_route_id(
        rows: list[dict[str, Any]],
        local_route_id: str,
    ) -> list[dict[str, Any]]:
        return [
            {
                **row,
                "route_id": local_route_id,
            }
            for row in rows
        ]

    def pull_scanner_configuration(self) -> dict[str, Any]:
        """Refresh the local scan plan from the configuration stored in Supabase."""
        state = _load_state(self.state_path)
        pulled_at = utcnow_iso()
        pattern_overrides: list[dict[str, Any]] = []
        search_rules: list[dict[str, Any]] = []
        service_months: list[dict[str, Any]] = []
        routes_refreshed = 0

        for route in self.routes_by_key.values():
            remote_route_id = self._remote_route_id(route)
            local_route_id = route.key
            pattern_overrides.extend(
                self._with_local_route_id(
                    self.supabase.route_pattern_overrides(remote_route_id),
                    local_route_id,
                )
            )
            search_rules.extend(
                self._with_local_route_id(
                    self.supabase.route_search_rules(remote_route_id),
                    local_route_id,
                )
            )
            service_months.extend(
                self._with_local_route_id(
                    self.supabase.route_service_months(remote_route_id, route.max_stops),
                    local_route_id,
                )
            )
            routes_refreshed += 1

        state["route_pattern_overrides"] = pattern_overrides
        state["route_search_rules"] = search_rules
        state["route_service_months"] = service_months
        state["scanner_configuration"] = {
            "pulled_at": pulled_at,
            "source": "supabase",
            "routes": routes_refreshed,
            "pattern_overrides": len(pattern_overrides),
            "search_rules": len(search_rules),
            "service_months": len(service_months),
        }
        _persist_state(self.state_path, state)

        return {
            "state_path": str(self.state_path),
            "generated_at": pulled_at,
            "routes_refreshed": routes_refreshed,
            "pattern_overrides_pulled": len(pattern_overrides),
            "search_rules_pulled": len(search_rules),
            "service_months_pulled": len(service_months),
        }

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
                route = self.routes_by_legacy_key.get(f"{origin}:{destination}:{bucket}")
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
            "scan_runs_synced": 0,
            "scan_runs_skipped": 0,
            "errors": [],
        }

        local_to_remote_snapshot_ids: dict[str, str] = {}
        local_snapshots_by_id = {
            str(snapshot.get("id")): snapshot
            for snapshot in state["snapshots"]
        }
        processed = 0

        # Create or refresh the run records before uploading their snapshots so
        # every new remote price can carry a real foreign-key relationship.
        pending_snapshot_run_keys = {
            str(snapshot.get("scan_run_key"))
            for snapshot in state["snapshots"]
            if snapshot.get("scan_run_key") and not _is_synced(snapshot)
        }
        for scan_run in state["price_scan_runs"]:
            run_key = str(scan_run.get("run_key") or "")
            if not run_key or run_key not in pending_snapshot_run_keys:
                continue
            try:
                self.supabase.save_scan_run(
                    {
                        **scan_run,
                        "sync_status": "pending",
                        "sync_summary": {},
                    }
                )
            except Exception as error:  # pragma: no cover - depends on live Supabase
                report["errors"].append(
                    {
                        "type": "price_scan_run_prepare",
                        "run_key": run_key,
                        "error": str(error),
                    }
                )

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
                scan_run_key = str(snapshot.get("scan_run_key") or "") or None
                existing_snapshot_id = self.supabase.find_synced_snapshot(
                    remote_route_id,
                    local_snapshot_id,
                    scan_run_key=scan_run_key,
                )
                if existing_snapshot_id is not None:
                    remote_snapshot_id = existing_snapshot_id
                else:
                    remote_snapshot_id = self.supabase.save_snapshot(
                        remote_route_id,
                        self._snapshot_record(snapshot),
                        scanned_at=snapshot.get("scanned_at"),
                        scan_run_key=scan_run_key,
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

        for scan_run in state["price_scan_runs"]:
            if _is_synced(scan_run):
                report["scan_runs_skipped"] += 1
                continue

            run_key = str(scan_run.get("run_key") or "")
            try:
                sync_errors = list(report["errors"])
                remote_payload = {
                    **scan_run,
                    "sync_status": "partial" if sync_errors else "completed",
                    "sync_summary": {
                        "snapshots_synced": report["snapshots_synced"],
                        "snapshots_skipped": report["snapshots_skipped"],
                        "deals_synced": report["deals_synced"],
                        "deals_skipped": report["deals_skipped"],
                        "errors": sync_errors,
                    },
                }
                remote_run_id = self.supabase.save_scan_run(remote_payload)
                scan_run["sync_status"] = remote_payload["sync_status"]
                scan_run["sync_summary"] = remote_payload["sync_summary"]
                scan_run["sync"] = {
                    "supabase_id": remote_run_id,
                    "synced_at": utcnow_iso(),
                }
                report["scan_runs_synced"] += 1
                _persist_state(self.state_path, state)
            except Exception as error:  # pragma: no cover - depends on live Supabase
                report["errors"].append(
                    {
                        "type": "price_scan_run",
                        "run_key": run_key,
                        "error": str(error),
                    }
                )

        report["remote_routes_touched"] = len(self.remote_route_ids)
        report["configured_routes"] = len(self.routes_by_key)
        report["storage_mode"] = self.config.storage_mode
        return report
