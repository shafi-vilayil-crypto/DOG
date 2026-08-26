"""Public DOG gateway API tests: auth, chat, streaming, telemetry, providers."""
import os
import uuid

import requests


BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
DOG_KEY = "dog_demo_acme_2026"
HEADERS = {"X-DOG-API-Key": DOG_KEY}


def payload(**overrides):
    value = {
        "messages": [{"role": "user", "content": "TEST_dog request " + uuid.uuid4().hex}],
        "provider": "openai",
        "model": "mock-fast",
        "session_id": "TEST_session_" + uuid.uuid4().hex,
    }
    value.update(overrides)
    return value


def test_chat_auth_and_response_contract():
    response = requests.post(f"{BASE_URL}/api/v1/ai/chat", headers=HEADERS, json=payload(), timeout=20)
    assert response.status_code == 200
    body = response.json()
    assert body["request_id"].startswith("req_")
    assert body["correlation_id"].startswith("cor_")
    assert body["response"]["provider"] == "openai"
    assert body["intelligence"]["normalized_fingerprint"]
    assert body["intelligence"]["decision"] in {"ALLOW", "WARN", "SHORT", "BLOCK", "DEDUPLICATE", "CACHE"}
    assert body["latency"]["total_latency_ms"] >= 0


def test_invalid_key_is_rejected():
    response = requests.post(f"{BASE_URL}/api/v1/ai/chat", headers={"X-DOG-API-Key": "invalid"}, json=payload(), timeout=20)
    assert response.status_code == 401


def test_stream_contains_first_chunk_and_done_events():
    response = requests.post(f"{BASE_URL}/api/v1/ai/stream", headers=HEADERS, json=payload(), timeout=20)
    assert response.status_code == 200
    assert "event\": \"FIRST_TOKEN\"" in response.text
    assert "event\": \"CHUNK\"" in response.text
    assert "event\": \"DONE\"" in response.text


def test_repeated_tool_requests_block_on_third_call():
    request = payload(messages=[{"role": "user", "content": "TEST_same tool request"}], tools=[{"name": "search"}], session_id="TEST_loop_session_" + uuid.uuid4().hex)
    results = [requests.post(f"{BASE_URL}/api/v1/ai/chat", headers=HEADERS, json=request, timeout=20).json() for _ in range(3)]
    assert results[2]["intelligence"]["duplicate"]["repetition_count"] == 3
    assert results[2]["intelligence"]["loop"]["is_loop"] is True
    assert results[2]["intelligence"]["decision"] == "BLOCK"


def test_providers_and_telemetry_contract():
    providers = requests.get(f"{BASE_URL}/api/v1/providers", headers=HEADERS, timeout=20)
    assert providers.status_code == 200
    assert {item["name"] for item in providers.json()["providers"]} == {"openai", "anthropic", "gemini", "custom"}
    telemetry = requests.get(f"{BASE_URL}/api/v1/telemetry", headers=HEADERS, timeout=20)
    assert telemetry.status_code == 200
    events = telemetry.json()["events"]
    assert events and events[-1]["event"] == "AI_RESPONSE_COMPLETED"
    assert "prompt" not in str(events[-1]).lower()