"""Live savings computation for the Overview widget.

The gateway emits a telemetry event for every request. Whenever the DOG
intelligence layer prevents an unnecessary provider call (duplicate, loop,
cache), we count that as money saved and multiply by an estimated per-call
cost so the customer can see the value of DOG in near real-time.

Cost estimates below are intentionally rough — real usage plumbing will
replace this once provider token counting is wired in.
"""
from datetime import datetime, timezone
from typing import Dict, Iterable, List
import random


# Rough average USD cost per prevented call, by provider. Tuned for a
# typical mixed prompt (~1500 input + 500 output tokens).
COST_PER_PREVENTED_CALL = {
    "openai": 0.024,
    "anthropic": 0.031,
    "gemini": 0.011,
    "custom": 0.015,
}
DEFAULT_COST = 0.018

# Which gateway decisions actually saved a provider call.
SAVINGS_DECISIONS = {"BLOCK", "DEDUPLICATE", "CACHE"}
REASON_LABEL = {
    "BLOCK": "Loop prevention",
    "DEDUPLICATE": "Duplicate prevention",
    "CACHE": "Cache hit",
}


def _midnight_utc_epoch() -> float:
    now = datetime.now(timezone.utc)
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return midnight.timestamp()


def _cost_for(provider: str) -> float:
    return COST_PER_PREVENTED_CALL.get((provider or "").lower(), DEFAULT_COST)


def compute_today_savings(events: Iterable[Dict]) -> Dict:
    """Return the "$X saved today" summary for the given telemetry stream."""
    midnight = _midnight_utc_epoch()
    saved_usd = 0.0
    prevented = 0
    by_reason: Dict[str, Dict[str, float]] = {}
    recent: List[Dict] = []

    for event in events:
        if event.get("timestamp", 0) < midnight:
            continue
        decision = event.get("decision")
        if decision not in SAVINGS_DECISIONS:
            continue
        cost = _cost_for(event.get("provider", ""))
        saved_usd += cost
        prevented += 1
        label = REASON_LABEL.get(decision, decision)
        bucket = by_reason.setdefault(label, {"calls": 0, "saved_usd": 0.0})
        bucket["calls"] += 1
        bucket["saved_usd"] += cost
        recent.append({
            "reason": label,
            "provider": event.get("provider"),
            "model": event.get("model"),
            "saved_usd": round(cost, 4),
            "timestamp": event.get("timestamp"),
        })

    return {
        "saved_usd": round(saved_usd, 2),
        "prevented_calls": prevented,
        "by_reason": {
            reason: {"calls": data["calls"], "saved_usd": round(data["saved_usd"], 2)}
            for reason, data in by_reason.items()
        },
        "recent": recent[-8:][::-1],
        "since": datetime.fromtimestamp(midnight, tz=timezone.utc).isoformat(),
        "as_of": datetime.now(timezone.utc).isoformat(),
    }


def seed_demo_savings(sink, count: int = 640) -> None:
    """Populate the telemetry sink with a realistic day-so-far of savings.

    Only used to give the Overview widget non-empty numbers on first load in
    demo / dev environments. Every real gateway request stacks on top of
    these synthetic events, so the counter continues to climb organically.
    """
    now = datetime.now(timezone.utc).timestamp()
    midnight = _midnight_utc_epoch()
    window = max(now - midnight, 60.0)
    providers = ["openai", "anthropic", "gemini"]
    decisions = ["DEDUPLICATE", "DEDUPLICATE", "DEDUPLICATE", "CACHE", "CACHE", "BLOCK"]
    for _ in range(count):
        ts = midnight + random.uniform(0, window)
        sink({
            "event": "AI_RESPONSE_COMPLETED",
            "provider": random.choice(providers),
            "model": "demo",
            "timestamp": ts,
            "decision": random.choice(decisions),
            "duplicate": True,
            "loop_risk": None,
            "seeded": True,
        })
