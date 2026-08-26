import time
from typing import Dict, Optional
from .models import RequestState


class RequestStateStore:
    async def get(self, key: str) -> Optional[RequestState]:
        raise NotImplementedError

    async def set(self, key: str, state: RequestState, ttl: int) -> None:
        raise NotImplementedError

    async def delete(self, key: str) -> None:
        raise NotImplementedError


class InMemoryRequestStateStore(RequestStateStore):
    def __init__(self):
        self._items: Dict[str, tuple[RequestState, float]] = {}

    async def get(self, key: str) -> Optional[RequestState]:
        item = self._items.get(key)
        if not item:
            return None
        state, expires_at = item
        if expires_at <= time.time():
            self._items.pop(key, None)
            return None
        return state

    async def set(self, key: str, state: RequestState, ttl: int) -> None:
        self._items[key] = (state, time.time() + ttl)

    async def delete(self, key: str) -> None:
        self._items.pop(key, None)