from .models import DuplicateDetectionResult, LoopRisk


class LoopDetector:
    def __init__(self, repetition_threshold: int = 3):
        self.repetition_threshold = repetition_threshold

    def assess(self, duplicate: DuplicateDetectionResult, same_tool: bool = False) -> LoopRisk:
        score = min(1.0, duplicate.repetition_count / self.repetition_threshold * (1.15 if same_tool else 1.0))
        is_loop = duplicate.repetition_count >= self.repetition_threshold and same_tool
        reason = "Repeated execution pattern with same tool" if is_loop else ("Repeated request detected" if duplicate.is_duplicate else "No repeated pattern")
        return LoopRisk(round(score, 2), is_loop, duplicate.repetition_count, reason)