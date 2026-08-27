import os
import uuid

import requests


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", os.environ.get("BACKEND_URL", "http://localhost:8000")).rstrip("/")


def test_api_root():
    response = requests.get(f"{BASE_URL}/api/", timeout=15)
    assert response.status_code == 200
    assert response.json() == {"message": "Hello World"}


def test_status_create_and_persist():
    client_name = f"TEST_{uuid.uuid4()}"
    create = requests.post(
        f"{BASE_URL}/api/status",
        json={"client_name": client_name},
        timeout=15,
    )
    assert create.status_code == 200
    created = create.json()
    assert created["client_name"] == client_name
    assert isinstance(created["id"], str)
    assert "timestamp" in created

    listing = requests.get(f"{BASE_URL}/api/status", timeout=15)
    assert listing.status_code == 200
    assert any(item["id"] == created["id"] and item["client_name"] == client_name for item in listing.json())


def test_status_requires_client_name():
    response = requests.post(f"{BASE_URL}/api/status", json={}, timeout=15)
    assert response.status_code == 422
    assert "detail" in response.json()