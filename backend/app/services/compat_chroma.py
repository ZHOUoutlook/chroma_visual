from __future__ import annotations

from typing import Any


class ChromaImportError(RuntimeError):
    pass


def create_http_client(host: str, port: int) -> Any:
    try:
        import chromadb
    except Exception as exc:
        raise ChromaImportError(str(exc)) from exc

    return chromadb.HttpClient(host=host, port=port)


def create_persistent_client(path: str) -> Any:
    try:
        import chromadb
    except Exception as exc:
        raise ChromaImportError(str(exc)) from exc

    return chromadb.PersistentClient(path=path)