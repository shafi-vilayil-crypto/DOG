"""Direct HTTP adapters for workspace-owned provider credentials."""
import json
from typing import AsyncIterator, Dict, List

import httpx

from dog_core.models import AIRequest, AIResponse
from .base import AIProviderAdapter


DEFAULT_MODELS = {
    "openai": "gpt-4o-mini",
    "anthropic": "claude-3-5-haiku-latest",
    "gemini": "gemini-3.6-flash",
}


def _text(value) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "".join(item.get("text", "") for item in value if isinstance(item, dict))
    return str(value or "")


class DirectProviderAdapter(AIProviderAdapter):
    def __init__(self, provider: str, api_key: str, base_url: str | None = None):
        self.provider = provider.lower()
        self.api_key = api_key
        self.base_url = (base_url or self._default_base_url()).rstrip("/")

    def _default_base_url(self) -> str:
        return {
            "openai": "https://api.openai.com/v1",
            "anthropic": "https://api.anthropic.com",
            "gemini": "https://generativelanguage.googleapis.com",
        }[self.provider]

    def _model(self, requested: str) -> str:
        return requested if requested and not requested.startswith("mock-") else DEFAULT_MODELS[self.provider]

    async def send(self, request: AIRequest) -> AIResponse:
        model = self._model(request.model)
        timeout = httpx.Timeout(90.0, connect=15.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            if self.provider == "openai":
                return await self._openai(client, request, model)
            if self.provider == "anthropic":
                return await self._anthropic(client, request, model)
            return await self._gemini(client, request, model)

    async def _openai(self, client: httpx.AsyncClient, request: AIRequest, model: str) -> AIResponse:
        response = await client.post(
            f"{self.base_url}/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={"model": model, "messages": request.messages, "temperature": 0.2},
        )
        self._raise_provider_error(response, "OpenAI")
        data = response.json()
        usage = data.get("usage") or {}
        return AIResponse(
            _text(data["choices"][0].get("message", {}).get("content")),
            self.provider, model,
            {"prompt_tokens": usage.get("prompt_tokens", 0), "completion_tokens": usage.get("completion_tokens", 0), "total_tokens": usage.get("total_tokens", 0)},
            data.get("choices", [{}])[0].get("finish_reason", "stop"),
        )

    async def _anthropic(self, client: httpx.AsyncClient, request: AIRequest, model: str) -> AIResponse:
        system = "\n\n".join(m["content"] for m in request.messages if m.get("role") == "system")
        messages = [{"role": m["role"], "content": _text(m.get("content"))} for m in request.messages if m.get("role") != "system"]
        body = {"model": model, "max_tokens": 1024, "messages": messages}
        if system:
            body["system"] = system
        response = await client.post(
            f"{self.base_url}/v1/messages",
            headers={"x-api-key": self.api_key, "anthropic-version": "2023-06-01"},
            json=body,
        )
        self._raise_provider_error(response, "Anthropic")
        data = response.json()
        usage = data.get("usage") or {}
        return AIResponse(
            _text(data.get("content")), self.provider, model,
            {"prompt_tokens": usage.get("input_tokens", 0), "completion_tokens": usage.get("output_tokens", 0), "total_tokens": usage.get("input_tokens", 0) + usage.get("output_tokens", 0)},
            data.get("stop_reason", "stop"),
        )

    async def _gemini(self, client: httpx.AsyncClient, request: AIRequest, model: str) -> AIResponse:
        system_parts = [m["content"] for m in request.messages if m.get("role") == "system"]
        contents = [{"role": "model" if m.get("role") == "assistant" else "user", "parts": [{"text": _text(m.get("content"))}]} for m in request.messages if m.get("role") != "system"]
        body = {"contents": contents}
        if system_parts:
            body["systemInstruction"] = {"parts": [{"text": "\n\n".join(system_parts)}]}
        response = await client.post(
            f"{self.base_url}/v1beta/models/{model}:generateContent",
            headers={"x-goog-api-key": self.api_key},
            json=body,
        )
        self._raise_provider_error(response, "Gemini")
        data = response.json()
        usage = data.get("usageMetadata") or {}
        content = _text(data.get("candidates", [{}])[0].get("content", {}).get("parts", []))
        return AIResponse(
            content, self.provider, model,
            {"prompt_tokens": usage.get("promptTokenCount", 0), "completion_tokens": usage.get("candidatesTokenCount", 0), "total_tokens": usage.get("totalTokenCount", 0)},
            data.get("candidates", [{}])[0].get("finishReason", "STOP"),
        )

    @staticmethod
    def _raise_provider_error(response: httpx.Response, provider: str) -> None:
        if response.is_error:
            try:
                detail = response.json().get("error", {}).get("message") or response.text
            except ValueError:
                detail = response.text
            raise RuntimeError(f"{provider} API {response.status_code}: {str(detail)[:500]}")

    async def stream(self, request: AIRequest) -> AsyncIterator[str]:
        # Keep the streaming contract stable while provider-specific SSE support is added.
        response = await self.send(request)
        for word in response.content.split():
            yield word + " "

    def get_capabilities(self) -> Dict[str, object]:
        return {"streaming": True, "provider": self.provider, "mode": "direct"}
