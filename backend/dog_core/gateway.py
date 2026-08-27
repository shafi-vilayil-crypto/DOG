"""The DOG AI Gateway — intelligence layer around every AI request.

Design principles:

- Fail-open: the intelligence layer *never* prevents forwarding a request
  to the provider. If anything in the DOG path errors, we forward and
  log.
- Non-blocking persistence: telemetry writes are scheduled with
  `asyncio.create_task` so a slow database can't add latency.
- Hot state (fingerprints, loop counters, rate limits) lives in the
  Redis-shaped `HotStateStore`; the in-memory adapter is a drop-in for
  the real Redis client.
"""
import asyncio
import logging
import os
import time
import uuid
from typing import AsyncGenerator, Awaitable, Callable, Dict, Optional

from .decision import decide
from .duplicate import DuplicateDetector
from .fingerprints import exact_fingerprint, normalized_fingerprint
from .latency import LatencyEngine
from .loop import LoopDetector
from .models import AIRequest, AIResponse, LatencyMetrics
from .stores import InMemoryRequestStateStore
from providers.base import AIProviderAdapter  # type: ignore[import]
from providers.factory import get_provider_adapter  # type: ignore[import]

logger = logging.getLogger(__name__)


async def _noop_telemetry_sink(event: Dict) -> None:
    """Default sink used when the gateway is created without persistence."""
    return None

# Rough per-prevented-call savings estimate by provider (USD).
PROVIDER_SAVINGS = {
    "openai": 0.024,
    "anthropic": 0.031,
    "gemini": 0.011,
    "custom": 0.015,
}
DEFAULT_SAVINGS = 0.018

# Rough per-completed-call cost estimate — will be replaced by real
# token accounting once the provider SDK returns usage data.
PROVIDER_COST = {
    "openai": 0.008,
    "anthropic": 0.010,
    "gemini": 0.004,
    "custom": 0.005,
}
DEFAULT_COST = 0.006


class DOGGateway:
    def __init__(self, telemetry_sink: Optional[Callable[[Dict], Awaitable[None]]] = None, credential_loader: Optional[Callable[[str, str], Awaitable[Optional[Dict[str, str]]]]] = None):
        store = InMemoryRequestStateStore()
        self.duplicates = DuplicateDetector(store)
        self.loops = LoopDetector()
        self.latency = LatencyEngine()
        self.thresholds = {
            "full": float(os.environ.get("DOG_LATENCY_FULL_MS", "2000")),
            "short": float(os.environ.get("DOG_LATENCY_SHORT_MS", "500")),
            "critical": float(os.environ.get("DOG_LATENCY_CRITICAL_MS", "5000")),
        }
        self.telemetry_sink = telemetry_sink or _noop_telemetry_sink
        self.credential_loader = credential_loader

    async def _adapter(self, request: AIRequest) -> AIProviderAdapter:
        credentials = None
        if self.credential_loader:
            try:
                credentials = await self.credential_loader(request.tenant_id, request.provider)
            except Exception:  # noqa: BLE001 - credential lookup must remain fail-open
                logger.exception("Provider credential lookup failed; using mock fallback")
        return get_provider_adapter(request.provider, request.model, (credentials or {}).get("api_key"), (credentials or {}).get("base_url"))

    async def _intelligence(self, request: AIRequest, started: float) -> Dict[str, object]:
        payload = {"messages": request.messages, "model": request.model, "provider": request.provider, "tools": request.tools or []}
        exact = exact_fingerprint(payload)
        normalized = normalized_fingerprint(payload)
        duplicate = await self.duplicates.check(request.tenant_id, request.session_id or "default", normalized, None if not request.tools else "tools")
        loop = self.loops.assess(duplicate, bool(request.tools))
        elapsed = (time.perf_counter() - started) * 1000
        latency_class = self.latency.classify(elapsed, self.thresholds)
        return {
            "exact_fingerprint": exact,
            "normalized_fingerprint": normalized,
            "duplicate": duplicate,
            "loop": loop,
            "latency_class": latency_class,
            "decision": decide(latency_class, duplicate, loop),
        }

    async def chat(self, request: AIRequest) -> Dict[str, object]:
        started = time.perf_counter()
        started_at_utc = time.time()
        request_id = f"req_{uuid.uuid4().hex[:16]}"
        correlation_id = f"cor_{uuid.uuid4().hex[:16]}"
        try:
            intelligence = await self._intelligence(request, started)
        except Exception:
            logger.exception("DOG intelligence layer failed — forwarding anyway")
            intelligence = {"exact_fingerprint": None, "normalized_fingerprint": None,
                            "decision": "ALLOW", "latency_class": "NORMAL", "duplicate": None, "loop": None}
        if intelligence.get("decision") in {"BLOCK", "DEDUPLICATE", "CACHE"}:
            response = AIResponse(
                f"Request {str(intelligence['decision']).lower()}ed by DOG intelligence.",
                request.provider,
                request.model,
                {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
                "dog_prevented",
            )
        else:
            adapter = await self._adapter(request)
            response = await adapter.send(request)
        completed_at_utc = time.time()
        total_ms = (time.perf_counter() - started) * 1000
        metrics = LatencyMetrics(total_ms, total_ms)
        self.latency.record(f"{request.tenant_id}:{request.provider}:{request.model}", metrics)
        telemetry_payload = {
            "request_id": request_id,
            "correlation_id": correlation_id,
            "tenant_id": request.tenant_id,
            "provider": request.provider,
            "model": request.model,
            "session_id": request.session_id,
            "started_at": started_at_utc,
            "completed_at": completed_at_utc,
            "total_latency_ms": total_ms,
            "input_tokens": response.usage.get("prompt_tokens", 0),
            "output_tokens": response.usage.get("completion_tokens", 0),
            "estimated_cost": 0.0 if response.finish_reason == "dog_prevented" else _estimate_cost(request.provider, response.usage),
            "intelligence": intelligence,
        }
        asyncio.create_task(self._emit(telemetry_payload))
        return {
            "request_id": request_id,
            "correlation_id": correlation_id,
            "response": response.__dict__,
            "intelligence": {k: (v.__dict__ if hasattr(v, "__dict__") else v) for k, v in intelligence.items()},
            "latency": metrics.__dict__,
            "telemetry": "queued",
        }

    async def stream(self, request: AIRequest) -> AsyncGenerator[Dict[str, object], None]:
        started = time.perf_counter()
        started_at_utc = time.time()
        request_id = f"req_{uuid.uuid4().hex[:16]}"
        correlation_id = f"cor_{uuid.uuid4().hex[:16]}"
        try:
            intelligence = await self._intelligence(request, started)
        except Exception:
            logger.exception("DOG intelligence layer failed on stream — forwarding anyway")
            intelligence = {"decision": "ALLOW", "latency_class": "NORMAL", "duplicate": None, "loop": None}
        if intelligence.get("decision") in {"BLOCK", "DEDUPLICATE", "CACHE"}:
            decision = str(intelligence["decision"])
            yield {
                "request_id": request_id,
                "correlation_id": correlation_id,
                "event": "BLOCKED",
                "decision": decision,
                "chunk": f"Request {decision.lower()}ed by DOG intelligence.",
                "elapsed_ms": round((time.perf_counter() - started) * 1000, 2),
            }
            yield {
                "request_id": request_id,
                "correlation_id": correlation_id,
                "event": "DONE",
                "decision": decision,
                "latency": LatencyMetrics(0, (time.perf_counter() - started) * 1000).__dict__,
            }
            return
        adapter = await self._adapter(request)
        first = True
        total_chunks = 0
        async for chunk in adapter.stream(request):
            total_chunks += 1
            yield {
                "request_id": request_id, "correlation_id": correlation_id,
                "chunk": chunk, "event": "FIRST_TOKEN" if first else "CHUNK",
                "decision": intelligence["decision"],
                "elapsed_ms": round((time.perf_counter() - started) * 1000, 2),
            }
            first = False
        total_ms = (time.perf_counter() - started) * 1000
        metrics = LatencyMetrics(total_ms, total_ms, total_ms)
        self.latency.record(f"{request.tenant_id}:{request.provider}:{request.model}", metrics)
        telemetry_payload = {
            "request_id": request_id,
            "correlation_id": correlation_id,
            "tenant_id": request.tenant_id,
            "provider": request.provider,
            "model": request.model,
            "session_id": request.session_id,
            "started_at": started_at_utc,
            "completed_at": time.time(),
            "total_latency_ms": total_ms,
            "input_tokens": 0,
            "output_tokens": max(total_chunks * 4, 0),
            "estimated_cost": _estimate_cost(request.provider, {}),
            "intelligence": intelligence,
        }
        asyncio.create_task(self._emit(telemetry_payload))
        yield {
            "request_id": request_id, "correlation_id": correlation_id,
            "event": "DONE", "decision": intelligence["decision"], "latency": metrics.__dict__,
        }

    async def _emit(self, payload: Dict) -> None:
        try:
            result = self.telemetry_sink(payload)
            if asyncio.iscoroutine(result):
                await result
        except Exception:
            logger.exception("Telemetry sink failed — fail-open")


def _estimate_cost(provider: str, usage: Dict[str, int]) -> float:
    base = PROVIDER_COST.get((provider or "").lower(), DEFAULT_COST)
    total_tokens = (usage.get("prompt_tokens", 0) or 0) + (usage.get("completion_tokens", 0) or 0)
    if not total_tokens:
        return round(base, 6)
    # Loose token→cost scaling so realistic prompts show non-trivial cost
    return round(base * max(1.0, total_tokens / 500.0), 6)


def savings_for_decision(provider: str, decision: str) -> float:
    if decision in {"DEDUPLICATE", "BLOCK", "CACHE", "REQUEST_COALESCED"}:
        return PROVIDER_SAVINGS.get((provider or "").lower(), DEFAULT_SAVINGS)
    return 0.0
