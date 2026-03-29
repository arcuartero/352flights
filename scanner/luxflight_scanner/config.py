from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[2]
load_dotenv(ROOT_DIR / ".env")


@dataclass(frozen=True)
class ScannerConfig:
    routes_path: Path = ROOT_DIR / "data" / "lux-routes.json"
    state_path: Path = Path(os.getenv("SCANNER_STATE_FILE", ROOT_DIR / "scanner" / "state.json"))
    currency_code: str = os.getenv("SCANNER_CURRENCY", "EUR")
    history_window: int = int(os.getenv("SCANNER_HISTORY_WINDOW", "45"))
    review_ratio: float = float(os.getenv("SCANNER_REVIEW_RATIO", "0.72"))
    flash_ratio: float = float(os.getenv("SCANNER_FLASH_RATIO", "0.60"))
    supabase_url: str | None = os.getenv("SUPABASE_URL")
    supabase_service_role_key: str | None = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    @property
    def use_supabase(self) -> bool:
        return bool(self.supabase_url and self.supabase_service_role_key)

