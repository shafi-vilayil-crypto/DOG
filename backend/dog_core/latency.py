import statistics
from typing import Dict, List
from .models import LatencyMetrics


class LatencyEngine:
    def __init__(self, max_samples: int = 500):
        self.history: Dict[str, List[float]] = {}
        self.max_samples = max_samples

    def record(self, key: str, metrics: LatencyMetrics) -> None:
        samples = self.history.setdefault(key, [])
        samples.append(metrics.total_latency_ms)
        del samples[:-self.max_samples]

    def summary(self, key: str) -> Dict[str, float]:
        values = sorted(self.history.get(key, []))
        if not values:
            return {"count": 0, "average_ms": 0, "p50_ms": 0, "p95_ms": 0, "p99_ms": 0}
        def percentile(percent: float) -> float:
            index = min(len(values) - 1, max(0, round((len(values) - 1) * percent)))
            return round(values[index], 2)
        return {"count": len(values), "average_ms": round(statistics.fmean(values), 2), "p50_ms": percentile(.50), "p95_ms": percentile(.95), "p99_ms": percentile(.99)}

    @staticmethod
    def classify(latency_ms: float, thresholds: Dict[str, float]) -> str:
        if latency_ms < thresholds["full"]:
            return "NORMAL"
        if latency_ms < thresholds["short"]:
            return "ELEVATED"
        if latency_ms < thresholds["critical"]:
            return "SLOW"
        return "CRITICAL"