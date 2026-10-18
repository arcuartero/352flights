from __future__ import annotations

import os


def public_cache_revalidation_secret() -> str:
    """Dedicated bearer for /api/public-deals/revalidate; never the Supabase service-role key."""
    return (
        os.getenv("PUBLIC_CACHE_REVALIDATION_SECRET", "").strip()
        or os.getenv("CRON_SECRET", "").strip()
    )
