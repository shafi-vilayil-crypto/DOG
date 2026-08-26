"""Redis-shaped hot-state store.

For MVP we ship an in-memory implementation so no external Redis is
required. The interface deliberately mirrors the Redis commands we plan
to use (get/set with TTL, incrementers, keyed locks) so the swap to a
real Redis client is a drop-in when we outgrow single-process state.
"""
import asyncio
import time
from dataclasses import dataclass, field
from typing import Any, Dict, Optional


@dataclass
class _Entry:
    value: Any
    expires_at: float = field(default=0.0)  # 0 == no expiry


class HotStateStore:
    """Async interface matching a subset of Redis semantics."""

    async def get(self, key: str) -> Optional[Any]: ...
    async def set(self, key: str, value: Any, ttl_seconds: Optional[int] = None) -> None: ...
    async def incr(self, key: str, ttl_seconds: Optional[int] = None) -> int: ...
    async def delete(self, key: str) -> None: ...


class InMemoryHotStateStore(HotStateStore):
    def __init__(self) -> None:
        self._data: Dict[str, _Entry] = {}
        self._lock = asyncio.Lock()

    def _expired(self, entry: _Entry) -> bool:
        return bool(entry.expires_at) and time.time() > entry.expires_at

    async def get(self, key: str) -> Optional[Any]:
        async with self._lock:
            entry = self._data.get(key)
            if not entry:
                return None
            if self._expired(entry):
                self._data.pop(key, None)
                return None
            return entry.value

    async def set(self, key: str, value: Any, ttl_seconds: Optional[int] = None) -> None:
        async with self._lock:
            expires_at = time.time() + ttl_seconds if ttl_seconds else 0.0
            self._data[key] = _Entry(value, expires_at)

    async def incr(self, key: str, ttl_seconds: Optional[int] = None) -> int:
        async with self._lock:
            entry = self._data.get(key)
            if entry and not self._expired(entry) and isinstance(entry.value, int):
                entry.value += 1
                return entry.value
            expires_at = time.time() + ttl_seconds if ttl_seconds else 0.0
            self._data[key] = _Entry(1, expires_at)
            return 1

    async def delete(self, key: str) -> None:
        async with self._lock:
            self._data.pop(key, None)


def build_hot_state_store() -> HotStateStore:
    """Return the configured hot-state store.

    Later this switches on `REDIS_URL`; for now we always use the in-memory
    implementation.
    """
    return InMemoryHotStateStore()
