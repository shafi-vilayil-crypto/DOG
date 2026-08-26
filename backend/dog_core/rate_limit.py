"""Per-tenant rate limiter backed by the shared HotStateStore.

Fail-open by design: if the store errors we log and allow the request,
so DOG's rate limiter cannot itself become a source of outages.
"""
import logging
import time

from .hot_state import HotStateStore

logger = logging.getLogger(__name__)


class RateLimiter:
    def __init__(self, store: HotStateStore) -> None:
        self.store = store

    async def check(self, tenant_id: str, limit_per_minute: int) -> tuple[bool, int]:
        """Return `(allowed, current_count)`.

        Uses a rolling per-minute window keyed by the current epoch minute.
        """
        if limit_per_minute <= 0:
            return True, 0
        bucket = int(time.time() // 60)
        key = f"dog:tenant:{tenant_id}:ratelimit:{bucket}"
        try:
            count = await self.store.incr(key, ttl_seconds=90)
        except Exception:
            logger.exception("Rate limiter store failed — failing open")
            return True, 0
        return count <= limit_per_minute, count
