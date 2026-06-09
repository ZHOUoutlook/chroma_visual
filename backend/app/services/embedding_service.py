from __future__ import annotations

import httpx

from app.config import get_settings


class EmbeddingService:
    def __init__(self, model_name: str | None = None) -> None:
        settings = get_settings()
        self._model_name = model_name or settings.embedding_model
        self._api_base_url = settings.embedding_api_base_url
        self._api_key = settings.embedding_api_key

    def embed(self, texts: list[str]) -> list[list[float]]:
        return self._embed_api(texts)

    def _embed_api(self, texts: list[str]) -> list[list[float]]:
        url = self._api_base_url.rstrip("/") + "/v1/embeddings"
        payload = {"input": texts, "model": self._model_name}
        headers = {}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        with httpx.Client(timeout=60) as client:
            resp = client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
        results = sorted(data["data"], key=lambda x: x["index"])
        return [item["embedding"] for item in results]

    @property
    def ready(self) -> bool:
        return bool(self._api_base_url)
