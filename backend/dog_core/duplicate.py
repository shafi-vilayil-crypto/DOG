import time
from .models import DuplicateDetectionResult
from .stores import RequestStateStore


class DuplicateDetector:
    def __init__(self, store: RequestStateStore, window_seconds: int = 60):
        self.store, self.window_seconds = store, window_seconds

    async def check(self, tenant_id: str, session_id: str, fingerprint: str, tool_signature: str | None = None) -> DuplicateDetectionResult:
        now = time.time()
        key = f"duplicate:{tenant_id}:{session_id}:{fingerprint}"
        state = await self.store.get(key)
        if not state or now - state.timestamps[-1] > self.window_seconds:
            from .models import RequestState
            state = RequestState(tenant_id, session_id, fingerprint, fingerprint, [now], tool_signature)
        else:
            state.timestamps.append(now)
        await self.store.set(key, state, self.window_seconds)
        return DuplicateDetectionResult(len(state.timestamps) > 1, len(state.timestamps), state.timestamps[0], state.timestamps[-1])