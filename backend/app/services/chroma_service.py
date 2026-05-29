from __future__ import annotations

from typing import Any

from app.config import get_settings
from app.sample_data import SAMPLE_RECORDS
from app.services.compat_chroma import ChromaImportError, create_http_client
from app.services.projection import project_to_3d


class ChromaService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self._client = None

    def _get_client(self) -> Any | None:
        if self._client is not None:
            return self._client

        try:
            self._client = create_http_client(self.settings.chroma_host, self.settings.chroma_port)
            self._client.heartbeat()
            return self._client
        except (ChromaImportError, Exception):
            self._client = None
            return None

    def list_collections(self) -> list[dict[str, Any]]:
        client = self._get_client()
        if client is None:
            return [
                {
                    "name": "sample_knowledge_base",
                    "count": len(SAMPLE_RECORDS),
                    "metadata": {"mode": "sample"},
                    "source": "sample",
                }
            ]

        collections = client.list_collections()
        result = []
        for item in collections:
            name = item if isinstance(item, str) else item.name
            collection = client.get_collection(name)
            result.append(
                {
                    "name": name,
                    "count": collection.count(),
                    "metadata": getattr(collection, "metadata", None) or {},
                    "source": "chroma",
                }
            )
        return result

    def status(self) -> dict[str, Any]:
        client = self._get_client()
        if client is None:
            return {
                "connected": False,
                "host": self.settings.chroma_host,
                "port": self.settings.chroma_port,
                "message": "Chroma HTTP 服务不可用，当前接口返回示例数据。",
            }

        try:
            collections = client.list_collections()
            return {
                "connected": True,
                "host": self.settings.chroma_host,
                "port": self.settings.chroma_port,
                "collection_count": len(collections),
                "message": "Chroma HTTP 服务已连接。",
            }
        except Exception as exc:
            return {
                "connected": False,
                "host": self.settings.chroma_host,
                "port": self.settings.chroma_port,
                "message": f"Chroma 连接异常：{exc}",
            }

    def get_collection_records(self, collection_name: str, limit: int = 200) -> list[dict[str, Any]]:
        collection = self._get_collection(collection_name)
        if collection is None:
            return SAMPLE_RECORDS[:limit]

        data = collection.get(limit=limit, include=["documents", "metadatas", "embeddings"])
        ids = data.get("ids") or []
        documents = _safe_sequence(data.get("documents"))
        metadatas = _safe_sequence(data.get("metadatas"))
        embeddings = _safe_sequence(data.get("embeddings"))

        records = []
        for index, item_id in enumerate(ids):
            records.append(
                {
                    "id": item_id,
                    "document": _safe_get(documents, index, ""),
                    "metadata": _safe_get(metadatas, index, {}) or {},
                    "embedding": _safe_embedding(_safe_get(embeddings, index, [])),
                }
            )
        return records

    def get_collection_stats(self, collection_name: str) -> dict[str, Any]:
        records = self.get_collection_records(collection_name)
        metadata_keys = sorted(
            {key for record in records for key in (record.get("metadata") or {}).keys()}
        )
        dimension = len(records[0]["embedding"]) if records and records[0].get("embedding") else 0
        sources = {}
        for record in records:
            source = (record.get("metadata") or {}).get("source", "unknown")
            sources[source] = sources.get(source, 0) + 1

        return {
            "name": collection_name,
            "count": len(records),
            "embedding_dimension": dimension,
            "metadata_keys": metadata_keys,
            "sources": sources,
        }

    def get_3d_points(self, collection_name: str) -> list[dict[str, Any]]:
        records = self.get_collection_records(collection_name)
        coords = project_to_3d([record.get("embedding", []) for record in records])
        points = []
        for record, point in zip(records, coords):
            points.append(
                {
                    "id": record["id"],
                    **point,
                    "document": record.get("document", ""),
                    "metadata": record.get("metadata", {}),
                }
            )
        return points

    def query(self, collection_name: str, query_text: str, top_k: int, where: dict[str, Any] | None) -> dict[str, Any]:
        collection = self._get_collection(collection_name)
        if collection is not None:
            try:
                query_args: dict[str, Any] = {
                    "query_texts": [query_text],
                    "n_results": top_k,
                    "include": ["documents", "metadatas", "distances", "embeddings"],
                }
                if where:
                    query_args["where"] = where
                data = collection.query(**query_args)
                return self._format_query_result(collection_name, query_text, data)
            except Exception:
                pass

        return self._sample_query(collection_name, query_text, top_k, where)

    def _get_collection(self, collection_name: str) -> Any | None:
        client = self._get_client()
        if client is None:
            return None
        try:
            return client.get_collection(collection_name)
        except Exception:
            return None

    def add_to_collection(self, collection_name: str, ids: list[str], documents: list[str], metadatas: list[dict[str, Any]]) -> bool:
        client = self._get_client()
        if client is None:
            return False
        try:
            collection = client.get_or_create_collection(name=collection_name)
            collection.add(ids=ids, documents=documents, metadatas=metadatas)
            return True
        except Exception:
            return False

    def _format_query_result(self, collection_name: str, query_text: str, data: dict[str, Any]) -> dict[str, Any]:
        ids = (data.get("ids") or [[]])[0]
        documents = (data.get("documents") or [[]])[0]
        metadatas = (data.get("metadatas") or [[]])[0]
        distances = (data.get("distances") or [[]])[0]

        all_points = {point["id"]: point for point in self.get_3d_points(collection_name)}
        results = []
        for index, item_id in enumerate(ids):
            point = all_points.get(item_id, {"x": 0.0, "y": 0.0, "z": 0.0})
            distance = _safe_get(distances, index, None)
            score = None if distance is None else 1 / (1 + float(distance))
            results.append(
                {
                    "id": item_id,
                    "x": point["x"],
                    "y": point["y"],
                    "z": point["z"],
                    "document": _safe_get(documents, index, ""),
                    "metadata": _safe_get(metadatas, index, {}) or {},
                    "score": score,
                }
            )
        return {"query": query_text, "query_point": _centroid(results), "results": results}

    def _sample_query(self, collection_name: str, query_text: str, top_k: int, where: dict[str, Any] | None) -> dict[str, Any]:
        query_terms = set(query_text.lower().split())
        records = self.get_collection_records(collection_name)
        if where:
            records = [
                record
                for record in records
                if all((record.get("metadata") or {}).get(key) == value for key, value in where.items())
            ]

        scored = []
        for record in records:
            text = record.get("document", "").lower()
            metadata_text = " ".join(map(str, (record.get("metadata") or {}).values())).lower()
            overlap = sum(1 for term in query_terms if term in text or term in metadata_text)
            score = overlap / max(len(query_terms), 1)
            if score == 0:
                score = 0.35
            scored.append((score, record))

        scored.sort(key=lambda item: item[0], reverse=True)
        points = {point["id"]: point for point in self.get_3d_points(collection_name)}
        results = []
        for score, record in scored[:top_k]:
            point = points.get(record["id"], {"x": 0.0, "y": 0.0, "z": 0.0})
            results.append(
                {
                    "id": record["id"],
                    "x": point["x"],
                    "y": point["y"],
                    "z": point["z"],
                    "document": record.get("document", ""),
                    "metadata": record.get("metadata", {}),
                    "score": score,
                }
            )
        return {"query": query_text, "query_point": _centroid(results), "results": results}


def _safe_get(items: Any, index: int, default: Any) -> Any:
    try:
        return items[index]
    except Exception:
        return default


def _safe_sequence(value: Any) -> list[Any]:
    if value is None:
        return []
    if hasattr(value, "tolist"):
        return value.tolist()
    return list(value)


def _safe_embedding(value: Any) -> list[float]:
    if value is None:
        return []
    try:
        return [float(item) for item in value]
    except Exception:
        return []


def _centroid(points: list[dict[str, Any]]) -> dict[str, float]:
    if not points:
        return {"x": 0.0, "y": 0.0, "z": 0.0}
    return {
        "x": sum(float(point["x"]) for point in points) / len(points),
        "y": sum(float(point["y"]) for point in points) / len(points),
        "z": sum(float(point["z"]) for point in points) / len(points),
    }
