from __future__ import annotations

import argparse
import json

from luxflight_scanner.config import ScannerConfig
from luxflight_scanner.scanner import LuxFlightScanner


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
    return parser


def main() -> None:
    args = build_parser().parse_args()
    scanner = LuxFlightScanner(ScannerConfig())
    report = scanner.scan(limit=args.limit)

    if args.json:
        print(json.dumps(report, indent=2))
        return

    print(
        f"Scanned {report['routes_scanned']} routes at {report['generated_at']}"
    )
    for item in report["report"]:
        route = item["route"]
        status = item["status"]
        if status == "error":
            print(
                f"- {route['origin_airport']} -> {route['destination_airport']}: "
                f"error ({item['error']})"
            )
            continue
        if status == "no_results":
            print(f"- {route['origin_airport']} -> {route['destination_airport']}: no results")
            continue

        snapshot = item["snapshot"]
        print(
            f"- {route['origin_airport']} -> {route['destination_airport']}: "
            f"{snapshot['currency']} {snapshot['price']:.0f} ({status})"
        )


if __name__ == "__main__":
    main()
