from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[2]
load_dotenv(ROOT_DIR / ".env")


def env_flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() not in {"0", "false", "no", "off"}


@dataclass(frozen=True)
class ScannerConfig:
    routes_path: Path = ROOT_DIR / "data" / "lux-routes.json"
    state_path: Path = Path(os.getenv("SCANNER_STATE_FILE", ROOT_DIR / "scanner" / "state.json"))
    currency_code: str = os.getenv("SCANNER_CURRENCY", "EUR")
    history_window: int = int(os.getenv("SCANNER_HISTORY_WINDOW", "45"))
    min_history_for_deal: int = int(os.getenv("SCANNER_MIN_HISTORY_FOR_DEAL", "3"))
    review_ratio: float = float(os.getenv("SCANNER_REVIEW_RATIO", "0.85"))
    flash_ratio: float = float(os.getenv("SCANNER_FLASH_RATIO", "0.60"))
    sync_snapshots_live: bool = env_flag("SCANNER_SYNC_SNAPSHOTS_LIVE", True)
    sync_deals_live: bool = env_flag("SCANNER_SYNC_DEALS_LIVE", True)
    search_request_timeout_seconds: float = float(
        os.getenv("SCANNER_SEARCH_REQUEST_TIMEOUT_SECONDS", "15")
    )
    search_pause_min_seconds: float = float(
        os.getenv("SCANNER_SEARCH_PAUSE_MIN_SECONDS", "0.8")
    )
    search_pause_max_seconds: float = float(
        os.getenv("SCANNER_SEARCH_PAUSE_MAX_SECONDS", "2.2")
    )
    route_pause_min_seconds: float = float(
        os.getenv("SCANNER_ROUTE_PAUSE_MIN_SECONDS", "2.5")
    )
    route_pause_max_seconds: float = float(
        os.getenv("SCANNER_ROUTE_PAUSE_MAX_SECONDS", "5.5")
    )
    storage_write_attempts: int = int(
        os.getenv("SCANNER_STORAGE_WRITE_ATTEMPTS", "3")
    )
    storage_retry_min_seconds: float = float(
        os.getenv("SCANNER_STORAGE_RETRY_MIN_SECONDS", "0.75")
    )
    storage_retry_max_seconds: float = float(
        os.getenv("SCANNER_STORAGE_RETRY_MAX_SECONDS", "2.0")
    )
    network_outage_breaker_threshold: int = int(
        os.getenv("SCANNER_NETWORK_OUTAGE_BREAKER_THRESHOLD", "6")
    )
    weekend_pattern_discovery_end_days: int = int(
        os.getenv("SCANNER_WEEKEND_PATTERN_DISCOVERY_END_DAYS", "120")
    )
    long_haul_pattern_discovery_end_days: int = int(
        os.getenv("SCANNER_LONG_HAUL_PATTERN_DISCOVERY_END_DAYS", "240")
    )
    pattern_override_valid_days: int = int(
        os.getenv("SCANNER_PATTERN_OVERRIDE_VALID_DAYS", "45")
    )
    storage_mode: str = os.getenv("SCANNER_STORAGE_MODE", "auto").lower()
    service_calendar_month_horizon: int = int(
        os.getenv("SCANNER_SERVICE_CALENDAR_MONTH_HORIZON", "9")
    )
    service_calendar_routing: str = os.getenv(
        "SCANNER_SERVICE_CALENDAR_ROUTING",
        "NON_STOP",
    )
    supabase_url: str | None = os.getenv("SUPABASE_URL")
    supabase_service_role_key: str | None = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    @property
    def use_supabase(self) -> bool:
        if self.storage_mode == "local":
            return False
        return bool(self.supabase_url and self.supabase_service_role_key)

    @property
    def has_supabase_credentials(self) -> bool:
        return bool(self.supabase_url and self.supabase_service_role_key)
