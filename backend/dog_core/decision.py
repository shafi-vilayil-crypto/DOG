from typing import Dict
from .models import LoopRisk, DuplicateDetectionResult


def decide(latency_class: str, duplicate: DuplicateDetectionResult, loop_risk: LoopRisk, cache_hit: bool = False) -> str:
    if loop_risk.is_loop:
        return "BLOCK"
    if cache_hit:
        return "CACHE"
    if duplicate.is_duplicate and duplicate.repetition_count >= 3:
        return "DEDUPLICATE"
    if latency_class in {"SLOW", "CRITICAL"}:
        return "SHORT"
    if duplicate.is_duplicate or latency_class == "ELEVATED":
        return "WARN"
    return "ALLOW"