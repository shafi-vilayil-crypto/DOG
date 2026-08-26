"""Provider adapter factory.

Chooses the right adapter for a given (provider, model) pair:

- If the model is explicitly a mock variant (`mock-*`) or the provider is
  `custom`, return the local `MockProviderAdapter`.
- Otherwise, return a `FailOpenAdapter` that tries the workspace's direct
  provider credential and falls back to the mock on provider errors.
"""
import logging
import os
from typing import AsyncIterator, Dict

from dog_core.models import AIRequest, AIResponse

from .base import AIProviderAdapter
from .direct import DirectProviderAdapter
from .mock import MockProviderAdapter

logger = logging.getLogger(__name__)

SUPPORTED_PROVIDERS = {"openai", "anthropic", "gemini"}
_SUPPORTED = SUPPORTED_PROVIDERS | {"custom"}


class FailOpenAdapter(AIProviderAdapter):
    """Try the live adapter, fall back to the mock on any provider error."""

    def __init__(self, live: AIProviderAdapter, mock: AIProviderAdapter, allow_fallback: bool = False):
        self.live = live
        self.mock = mock
        self.allow_fallback = allow_fallback

    async def send(self, request: AIRequest) -> AIResponse:
        try:
            return await self.live.send(request)
        except Exception as exc:  # noqa: BLE001 - fail-open is the contract
            if not self.allow_fallback:
                raise RuntimeError(f"Live {request.provider} provider failed: {exc}") from exc
            logger.warning("Live provider failed, falling back to mock: %s", exc)
            return await self.mock.send(request)

    async def stream(self, request: AIRequest) -> AsyncIterator[str]:
        try:
            async for chunk in self.live.stream(request):
                yield chunk
            return
        except Exception as exc:  # noqa: BLE001
            if not self.allow_fallback:
                raise RuntimeError(f"Live {request.provider} provider failed: {exc}") from exc
            logger.warning("Live provider stream failed, falling back to mock: %s", exc)
        async for chunk in self.mock.stream(request):
            yield chunk

    def get_capabilities(self) -> Dict[str, object]:
        return {**self.live.get_capabilities(), "fallback": "mock"}


def _use_mock(model: str) -> bool:
    return bool(model) and model.startswith("mock-")


def get_provider_adapter(provider: str, model: str = "", api_key: str | None = None, base_url: str | None = None) -> AIProviderAdapter:
    provider = (provider or "").lower()
    if provider not in _SUPPORTED:
        raise ValueError(f"Unsupported provider: {provider}")

    # Explicit mock model → skip the live path entirely.
    if _use_mock(model) or provider == "custom":
        return MockProviderAdapter(provider)

    # A workspace credential is required for direct provider traffic.
    if not api_key:
        return MockProviderAdapter(provider)

    allow_fallback = os.environ.get("DOG_ALLOW_PROVIDER_FALLBACK", "false").lower() == "true"
    return FailOpenAdapter(DirectProviderAdapter(provider, api_key, base_url), MockProviderAdapter(provider), allow_fallback)


def provider_mode(provider: str, credential_configured: bool = False) -> str:
    """Reporting helper for `/v1/providers`."""
    provider = (provider or "").lower()
    if provider == "custom":
        return "mock"
    if provider in SUPPORTED_PROVIDERS and credential_configured:
        return "live"
    return "mock"
