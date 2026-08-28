from __future__ import annotations

import argparse
import json
import signal

from luxflight_scanner.config import ScannerConfig
from luxflight_scanner.scanner import LuxFlightScanner
from luxflight_scanner.sync import LocalSupabaseSync


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Scan Luxembourg flight routes and surface fare drops."
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Only scan the first N configured routes.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print a JSON report instead of the plain-text summary.",
    )
    parser.add_argument(
        "--discover-patterns",
        action="store_true",
        help="Map supported route patterns and save per-route overrides.",
    )
    parser.add_argument(
        "--only-missing-service-months",
        action="store_true",
        help="Skip routes that already have a complete service-calendar horizon.",
    )
    parser.add_argument(
        "--refresh-service-months",
        action="store_true",
        help="Refresh the selected service calendars even when recent data already exists.",
    )
    parser.add_argument(
        "--origin-airport",
        type=str,
        default=None,
        help="Limit discovery to a single origin airport.",
    )
    parser.add_argument(
        "--destination-airport",
        type=str,
        default=None,
        help="Limit discovery to a single destination airport.",
    )
    parser.add_argument(
        "--destination-airports",
        type=str,
        default=None,
        help="Limit a price scan to a comma-separated list of destination airports.",
    )
    parser.add_argument(
        "--max-stops",
        type=str,
        default=None,
        help="Limit discovery to a single routing rule.",
    )
    parser.add_argument(
        "--sync-local-to-supabase",
        action="store_true",
        help="Upload unsynced records from the local state file to Supabase.",
    )
    parser.add_argument(
        "--pull-supabase-configuration",
        action="store_true",
        help="Refresh local route rules and service calendars from Supabase.",
    )
    parser.add_argument(
        "--sync-limit",
        type=int,
        default=None,
        help="Only sync the first N pending local snapshots.",
    )
    return parser


def scanner_exit_code(report: dict[str, object]) -> int | None:
    reason_code = report.get("stopped_reason_code")
    if reason_code == "network_outage":
        return 75
    if reason_code == "provider_unavailable":
        return 69
    return None


def main() -> None:
    # Treat service shutdowns like Ctrl-C so the scanner can persist a stopped run.
    def handle_stop(_signum: int, _frame: object) -> None:
        raise KeyboardInterrupt()

    signal.signal(signal.SIGINT, handle_stop)
    signal.signal(signal.SIGTERM, handle_stop)

    args = build_parser().parse_args()
    config = ScannerConfig()

    if args.sync_local_to_supabase:
        report = LocalSupabaseSync(config).sync(limit=args.sync_limit)
        if args.json:
            print(json.dumps(report, indent=2))
            return

        print(
            f"Synced {report['snapshots_synced']} snapshots and "
            f"{report['deals_synced']} deals from {report['state_path']}"
        )
        if report["errors"]:
            print(f"Sync finished with {len(report['errors'])} error(s).")
            raise SystemExit(1)
        return

    if args.pull_supabase_configuration:
        report = LocalSupabaseSync(config).pull_scanner_configuration()
        if args.json:
            print(json.dumps(report, indent=2))
            return

        print(
            f"Refreshed {report['routes_refreshed']} routes with "
            f"{report['search_rules_pulled']} monthly rules and "
            f"{report['service_months_pulled']} service months."
        )
        return

    scanner = LuxFlightScanner(config)
    route_filter = None
    if args.origin_airport or args.destination_airport or args.max_stops:
        route_filter = {
            "origin_airport": args.origin_airport.upper() if args.origin_airport else None,
            "destination_airport": args.destination_airport.upper()
            if args.destination_airport
            else None,
            "max_stops": args.max_stops if args.max_stops else None,
        }

    report = (
        scanner.discover_route_patterns(
            limit=args.limit,
            route_filter=route_filter,
            only_missing_service_months=(
                args.only_missing_service_months and not args.refresh_service_months
            ),
        )
        if args.discover_patterns
        else scanner.scan(
            limit=args.limit,
            destination_airports={
                value.strip().upper()
                for value in (args.destination_airports or "").split(",")
                if value.strip()
            }
            or None,
        )
    )
    exit_code = None if args.discover_patterns else scanner_exit_code(report)

    if args.json:
        print(json.dumps(report, indent=2))
        if exit_code is not None:
            raise SystemExit(exit_code)
        return

    if args.discover_patterns:
        print(
            f"Checked pattern overrides for {report['routes_checked']} routes at {report['generated_at']}"
        )
    else:
        print(
            f"Scanned {report['routes_scanned']} routes at {report['generated_at']}"
        )

    for item in report["report"]:
        route = item.get("route")
        status = item["status"]
        if not isinstance(route, dict):
            print(f"- Scanner: {status} ({item.get('error', 'unknown error')})")
            continue
        if status == "error":
            print(
                f"- {route['origin_airport']} -> {route['destination_airport']}: "
                f"error ({item['error']})"
            )
            continue
        if status == "no_results":
            print(f"- {route['origin_airport']} -> {route['destination_airport']}: no results")
            continue
        if args.discover_patterns:
            print(
                f"- {route['origin_airport']} -> {route['destination_airport']}: {status}"
            )
            continue

        snapshot = item["snapshot"]
        print(
            f"- {route['origin_airport']} -> {route['destination_airport']}: "
            f"{snapshot['currency']} {snapshot['price']:.0f} ({status})"
        )

    if exit_code is not None:
        raise SystemExit(exit_code)


if __name__ == "__main__":
    main()
