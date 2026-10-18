from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from luxflight_scanner.cache_revalidation import public_cache_revalidation_secret


class CacheRevalidationSecretTest(unittest.TestCase):
    def test_prefers_dedicated_secret_then_cron_secret(self) -> None:
        with patch.dict(os.environ, {"PUBLIC_CACHE_REVALIDATION_SECRET": "dedicated", "CRON_SECRET": "cron"}):
            self.assertEqual(public_cache_revalidation_secret(), "dedicated")
        with patch.dict(os.environ, {"PUBLIC_CACHE_REVALIDATION_SECRET": " ", "CRON_SECRET": "cron"}):
            self.assertEqual(public_cache_revalidation_secret(), "cron")

    def test_never_falls_back_to_the_service_role_key(self) -> None:
        env = {"SUPABASE_SERVICE_ROLE_KEY": "service-role"}
        with patch.dict(os.environ, env, clear=True):
            self.assertEqual(public_cache_revalidation_secret(), "")


if __name__ == "__main__":
    unittest.main()
