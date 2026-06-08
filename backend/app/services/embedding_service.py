from __future__ import annotations

from typing import Any

from app.config import get_settings


class EmbeddingService:
    def __init__(self, model_name: str | None = None) -> None:
        settings = get_settings()
        self._model_name = model_name or settings.embedding_model
        self._model: Any = None

    def _load(self) -> bool:
        if self._model is not None:
            return True
        try:
            from sentence_transformers import SentenceTransformer

            settings = get_settings()
            if settings.embedding_model_path:
                self._model = SentenceTransformer(
                    settings.embedding_model_path,
                    local_files_only=True,
                )
            elif settings.embedding_local_only:
                self._model = SentenceTransformer(
                    self._model_name,
                    local_files_only=True,
                )
            else:
                self._model = SentenceTransformer(self._model_name)
            return True
        except Exception:
            return False

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not self._load():
            return [[] for _ in texts]
        embeddings = self._model.encode(texts, normalize_embeddings=True)
        return [vec.tolist() for vec in embeddings]

    @property
    def ready(self) -> bool:
        return self._load()
