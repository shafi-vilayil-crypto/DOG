import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))
os.environ.setdefault("DOG_LATENCY_FULL_MS", "400")
os.environ.setdefault("DOG_LATENCY_SHORT_MS", "800")
os.environ.setdefault("DOG_LATENCY_CRITICAL_MS", "1500")

from dog_core.decision import decide
from dog_core.duplicate import DuplicateDetector
from dog_core.fingerprints import exact_fingerprint, normalized_fingerprint
from dog_core.latency import LatencyEngine
from dog_core.loop import LoopDetector
from dog_core.models import DuplicateDetectionResult, LatencyMetrics
from dog_core.stores import InMemoryRequestStateStore


def test_exact_and_normalized_fingerprints_ignore_secrets_and_formatting():
    first = {"messages": [{"role": "user", "content": "What is the weather today?"}], "metadata": {"trace": "one"}, "api_key": "secret-a"}
    second = {"messages": [{"role": "user", "content": "  What is the weather today?  "}], "metadata": {"trace": "two"}, "api_key": "secret-b"}
    assert exact_fingerprint(first) != exact_fingerprint(second)
    assert normalized_fingerprint(first) == normalized_fingerprint(second)


def test_duplicate_window_and_expiration():
    async def run():
        detector = DuplicateDetector(InMemoryRequestStateStore(), window_seconds=60)
        first = await detector.check("tenant-a", "session-a", "fp")
        second = await detector.check("tenant-a", "session-a", "fp")
        return first, second
    first, second = asyncio.run(run())
    assert not first.is_duplicate
    assert second.is_duplicate and second.repetition_count == 2


def test_loop_and_decision_paths():
    duplicate = DuplicateDetectionResult(True, 3, 1, 2)
    risk = LoopDetector().assess(duplicate, same_tool=True)
    assert risk.is_loop
    assert decide("NORMAL", duplicate, risk) == "BLOCK"
    assert decide("SLOW", DuplicateDetectionResult(False, 1, 1, 1), LoopDetector().assess(DuplicateDetectionResult(False, 1, 1, 1))) == "SHORT"


def test_latency_percentiles_and_thresholds():
    engine = LatencyEngine()
    for value in [100, 200, 400, 900, 1600]:
        engine.record("tenant:provider:model", LatencyMetrics(value, value))
    summary = engine.summary("tenant:provider:model")
    assert summary["count"] == 5 and summary["p95_ms"] == 1600
    assert engine.classify(399, {"full": 400, "short": 800, "critical": 1500}) == "NORMAL"
    assert engine.classify(1200, {"full": 400, "short": 800, "critical": 1500}) == "SLOW"
    assert engine.classify(1600, {"full": 400, "short": 800, "critical": 1500}) == "CRITICAL"