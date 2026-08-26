from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class AIRequest:
    messages: List[Dict[str, Any]]
    provider: str
    model: str
    tenant_id: str
    session_id: Optional[str] = None
    tools: Optional[List[Dict[str, Any]]] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    stream: bool = False


@dataclass
class AIResponse:
    content: str
    provider: str
    model: str
    usage: Dict[str, int]
    finish_reason: str = "stop"


@dataclass
class LatencyMetrics:
    request_latency_ms: float
    total_latency_ms: float
    time_to_first_token_ms: Optional[float] = None


@dataclass
class DuplicateDetectionResult:
    is_duplicate: bool
    repetition_count: int
    first_seen_at: float
    last_seen_at: float


@dataclass
class LoopRisk:
    score: float
    is_loop: bool
    repetition_count: int
    reason: str


@dataclass
class RequestState:
    tenant_id: str
    session_id: Optional[str]
    fingerprint: str
    normalized_fingerprint: str
    timestamps: List[float] = field(default_factory=list)
    tool_signature: Optional[str] = None


@dataclass
class TelemetryEvent:
    event: str
    request_id: str
    correlation_id: str
    tenant_id: str
    provider: str
    model: str
    timestamp: float
    latency: Optional[LatencyMetrics] = None
    duplicate: bool = False
    loop_risk: Optional[float] = None
    decision: Optional[str] = None

    def as_dict(self) -> Dict[str, Any]:
        result = self.__dict__.copy()
        if self.latency:
            result["latency"] = self.latency.__dict__
        return result