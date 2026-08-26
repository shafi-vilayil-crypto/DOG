import asyncio
from typing import AsyncIterator, Dict
from dog_core.models import AIRequest, AIResponse
from .base import AIProviderAdapter


class MockProviderAdapter(AIProviderAdapter):
    def __init__(self, provider: str):
        self.provider = provider

    async def send(self, request: AIRequest) -> AIResponse:
        await asyncio.sleep(0.025)
        return AIResponse(f"Mock {self.provider} response for {request.model}. DOG intelligence is active.", self.provider, request.model, {"prompt_tokens": 24, "completion_tokens": 14, "total_tokens": 38})

    async def stream(self, request: AIRequest) -> AsyncIterator[str]:
        response = await self.send(request)
        for word in response.content.split():
            await asyncio.sleep(0.008)
            yield word + " "

    def get_capabilities(self) -> Dict[str, object]:
        return {"streaming": True, "models": ["mock-fast", "mock-reasoning"], "provider": self.provider}