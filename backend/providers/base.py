from abc import ABC, abstractmethod
from typing import AsyncIterator, Dict
from dog_core.models import AIRequest, AIResponse


class AIProviderAdapter(ABC):
    @abstractmethod
    async def send(self, request: AIRequest) -> AIResponse: ...

    @abstractmethod
    async def stream(self, request: AIRequest) -> AsyncIterator[str]: ...

    @abstractmethod
    def get_capabilities(self) -> Dict[str, object]: ...