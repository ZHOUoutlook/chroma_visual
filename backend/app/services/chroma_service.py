from __future__ import annotations

import hashlib
import threading
import time
from typing import Any

from app.config import get_settings
from app.sample_data import SAMPLE_RECORDS
from app.services.compat_chroma import ChromaImportError, create_http_client, create_persistent_client
from app.services.embedding_service import EmbeddingService
from app.services.projection import project_to_3d


class ChromaService:
    def __init__(self, embedding_svc: EmbeddingService | None = None) -> None:
        self.settings = get_settings()
        self._client = None
        self._embedding_service = embedding_svc or EmbeddingService()
        self._write_lock = threading.Lock()
        self._records_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}  # (timestamp, records)

    def _get_client(self) -> Any | None:
        if self._client is not None:
            return self._client

        try:
            if self.settings.chroma_host:
                self._client = create_http_client(self.settings.chroma_host, self.settings.chroma_port)
            else:
                self._client = create_persistent_client(self.settings.chroma_db_path)
            self._client.heartbeat()
            return self._client
        except (ChromaImportError, Exception) as exc:
            print(f"[ChromaService] _get_client failed: {type(exc).__name__}: {exc}")
            import traceback
            traceback.print_exc()
            self._client = None
            return None

    def close(self) -> None:
        """Release ChromaDB client resources."""
        self._client = None

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
            meta = getattr(collection, "metadata", None) or {}
            display = meta.get("display_name", name)
            result.append(
                {
                    "name": name,
                    "display_name": display,
                    "count": collection.count(),
                    "metadata": meta,
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

    def get_collection_records(self, collection_name: str, limit: int = 500, offset: int = 0, include_embeddings: bool = True) -> list[dict[str, Any]]:
        # 短时缓存：5 秒内同一集合的请求复用结果，避免 records + 3d 双重查询 ChromaDB
        cache_key = f"records:{collection_name}:{offset}:{limit}:{include_embeddings}"
        cached = self._records_cache.get(cache_key)
        if cached and (time.time() - cached[0]) < 5.0:
            return cached[1]

        collection = self._get_collection(collection_name)
        if collection is None:
            result = SAMPLE_RECORDS[offset:offset + limit] if offset else SAMPLE_RECORDS[:limit]
            if not include_embeddings:
                result = [{k: v for k, v in r.items() if k != "embedding"} for r in result]
            return result

        includes = ["documents", "metadatas"]
        if include_embeddings:
            includes.append("embeddings")
        data = collection.get(limit=limit, offset=offset, include=includes)
        ids = data.get("ids") or []
        documents = _safe_sequence(data.get("documents"))
        metadatas = _safe_sequence(data.get("metadatas"))
        embeddings = _safe_sequence(data.get("embeddings")) if include_embeddings else []

        records = []
        for index, item_id in enumerate(ids):
            rec = {
                "id": item_id,
                "document": _safe_get(documents, index, ""),
                "metadata": _safe_get(metadatas, index, {}) or {},
            }
            if include_embeddings:
                rec["embedding"] = _safe_embedding(_safe_get(embeddings, index, []))
            records.append(rec)
        self._records_cache[cache_key] = (time.time(), records)
        return records

    def get_collection_display_name(self, collection_name: str) -> str:
        """Return the display_name of a collection, falling back to collection_name."""
        collection = self._get_collection(collection_name)
        if collection is None:
            return collection_name
        try:
            meta = getattr(collection, "metadata", None) or {}
            return meta.get("display_name", collection_name)
        except Exception:
            return collection_name

    def _find_cached_records(self, collection_name: str) -> list[dict[str, Any]] | None:
        """查找 _records_cache 中该集合的任意缓存记录（5 秒内有效）。"""
        now = time.time()
        for cache_key, (ts, records) in self._records_cache.items():
            if cache_key.startswith(f"records:{collection_name}:") and (now - ts) < 5.0:
                return records
        return None

    def _enrich_with_embeddings(self, collection_name: str, records: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """为不含 embedding 的 records 补充 embedding 字段（仅查询 ChromaDB 的 embeddings）。"""
        if not records:
            return records
        collection = self._get_collection(collection_name)
        if collection is None:
            return records
        ids = [rec["id"] for rec in records]
        try:
            data = collection.get(ids=ids, include=["embeddings"])
            emb_map: dict[str, list[float]] = {}
            for rid, emb in zip(data.get("ids") or [], _safe_sequence(data.get("embeddings"))):
                emb_map[str(rid)] = _safe_embedding(emb)
            for rec in records:
                rec["embedding"] = emb_map.get(rec["id"], [])
        except Exception as exc:
            print(f"[ChromaService] _enrich_with_embeddings failed: {type(exc).__name__}: {exc}")
        return records

    def get_3d_points(self, collection_name: str, max_pca_samples: int = 5000) -> list[dict[str, Any]]:
        # 优先复用 records 接口的缓存数据，避免重复查询 ChromaDB
        cached_records = self._find_cached_records(collection_name)
        if cached_records is not None:
            records = cached_records
            # 缓存中无 embedding 时，仅补查 embedding
            if records and "embedding" not in records[0]:
                records = self._enrich_with_embeddings(collection_name, records)
        else:
            records = self.get_collection_records(collection_name, max_pca_samples)

        embeddings = [record.get("embedding", []) for record in records]
        coords = project_to_3d(embeddings, max_samples=max_pca_samples)
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
                query_embeddings = self._embedding_service.embed([query_text])
                query_args: dict[str, Any] = {
                    "query_embeddings": query_embeddings,
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

    # def get_embedded_chunk_ids(self, collection_name: str, document_id: str) -> list[str]:
    #     """Return chunk IDs that have embeddings in the given collection for the given document."""
    #     collection = self._get_collection(collection_name)
    #     if collection is None:
    #         return []

    #     try:
    #         data = collection.get(
    #             where={"document_id": document_id},
    #             include=["metadatas"],
    #         )
    #     except Exception:
    #         return []

    #     chunk_ids: set[str] = set()
    #     for metadata in _safe_sequence(data.get("metadatas")):
    #         if isinstance(metadata, dict):
    #             cid = metadata.get("chunk_id")
    #             if cid:
    #                 chunk_ids.add(str(cid))

    #     return sorted(chunk_ids)


    def get_chunk_ids_for_document(self, collection_name: str, document_id: str) -> set[str]:
        """返回指定集合中属于某文档的所有 chunk_id（以 ChromaDB 实际数据为准）。
        
        ChromaDB 中句子 ID 格式为 {document_id}_{chunk_id}_sent_XXXX，
        通过解析 ID 提取 chunk_id。
        """
        collection = self._get_collection(collection_name)
        if collection is None:
            return set()

        try:
            data = collection.get(
                where={"document_id": document_id},
                include=["metadatas"],
            )
        except Exception:
            return set()

        chunk_ids: set[str] = set()
        ids = data.get("ids") or []
        prefix = document_id + "_"
        for record_id in ids:
            rid = str(record_id)
            if rid.startswith(prefix):
                rest = rid[len(prefix):]
                sent_idx = rest.rfind("_sent_")
                if sent_idx > 0:
                    chunk_ids.add(rest[:sent_idx])

        return chunk_ids
    def delete_records(self, collection_name: str, record_ids: list[str]) -> bool:
        with self._write_lock:
            client = self._get_client()
            if client is None:
                return False
            try:
                collection = client.get_collection(collection_name)
                if collection is None:
                    return False
                collection.delete(ids=record_ids)
                return True
            except Exception:
                return False

    def add_to_collection(self, collection_name: str, ids: list[str], documents: list[str], metadatas: list[dict[str, Any]], embeddings: list[list[float]] | None = None) -> bool:
        with self._write_lock:
            client = self._get_client()
            if client is None:
                return False
            try:
                collection = client.get_or_create_collection(name=collection_name)
                kwargs: dict[str, Any] = {"ids": ids, "documents": documents, "metadatas": metadatas}
                if embeddings:
                    kwargs["embeddings"] = embeddings
                collection.add(**kwargs)
                return True
            except Exception:
                return False


    def clear_collection(self, collection_name: str) -> int:
        """Delete all records from a collection. Returns count of deleted records."""
        with self._write_lock:
            client = self._get_client()
            if client is None:
                return -1
            try:
                collection = client.get_collection(collection_name)
                if collection is None:
                    return 0
                count = collection.count()
                if count > 0:
                    all_ids = collection.get(include=[])["ids"]
                    if all_ids:
                        collection.delete(ids=all_ids)
                return count
            except Exception:
                return -1

    def _safe_collection_name(self, display_name: str) -> str:
        safe = ''.join(c if c.isascii() and (c.isalnum() or c in '._-') else '_' for c in display_name)
        safe = safe.strip('_')
        if safe and len(safe) >= 3 and safe[0].isalnum():
            h = hashlib.md5(display_name.encode('utf-8')).hexdigest()[:8]
            return f'{safe[:48]}_{h}'
        h = hashlib.md5(display_name.encode('utf-8')).hexdigest()[:12]
        return f'coll_{h}'

    def create_collection(self, collection_name: str, metadata: dict[str, Any] | None = None) -> bool:
        with self._write_lock:
            client = self._get_client()
            if client is None:
                return False
            try:
                safe_name = self._safe_collection_name(collection_name)
                client.get_or_create_collection(name=safe_name, metadata={**(metadata or {}), 'display_name': collection_name})
                return True
            except Exception:
                return False

    def delete_collection(self, collection_name: str) -> bool:
        with self._write_lock:
            client = self._get_client()
            if client is None:
                return False
            try:
                client.delete_collection(name=collection_name)
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