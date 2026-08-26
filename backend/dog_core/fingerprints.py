import hashlib
import json
import re
from typing import Any, Dict


SENSITIVE_KEYS = {"api_key", "authorization", "token", "password", "secret"}


def _safe_payload(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _safe_payload(v) for k, v in sorted(value.items()) if k.lower() not in SENSITIVE_KEYS and k.lower() != "metadata"}
    if isinstance(value, list):
        return [_safe_payload(v) for v in value]
    return value


def exact_fingerprint(payload: Dict[str, Any]) -> str:
    safe = _safe_payload(payload)
    encoded = json.dumps(safe, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(encoded.encode()).hexdigest()


def _normalize(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _normalize(v) for k, v in sorted(value.items()) if k.lower() not in SENSITIVE_KEYS and k.lower() not in {"metadata", "timestamp", "request_id"}}
    if isinstance(value, list):
        return [_normalize(v) for v in value]
    if isinstance(value, str):
        return re.sub(r"\s+", " ", value).strip()
    return value


def normalized_fingerprint(payload: Dict[str, Any]) -> str:
    encoded = json.dumps(_normalize(payload), sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(encoded.encode()).hexdigest()