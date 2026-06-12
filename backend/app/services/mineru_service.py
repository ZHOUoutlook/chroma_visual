from __future__ import annotations

import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.config import get_settings
from app.sample_data import SAMPLE_DOCUMENTS, SAMPLE_PAGES, SAMPLE_RECORDS
from app.services.embedding_service import EmbeddingService
from app.services.mineru_api import MineruApiClient, MineruApiError


class MineruService:
    def __init__(self, embedding_svc: EmbeddingService | None = None) -> None:
        self.settings = get_settings()
        self.mineru_api = MineruApiClient()
        self.embedding_service = embedding_svc or EmbeddingService()

    def list_documents(self,collection_name:str = None) -> list[dict[str, Any]]:
        files = self._json_files()
        if not files:
            return SAMPLE_DOCUMENTS

        documents = []
        for path in files:
            data = self._read_json(path)
            document = data.get("document") or {}
            chunks_list = data.get("chunks") or data.get("result", {}).get("chunks") or []
            total = len(chunks_list)
            if collection_name:
                embedded = sum(1 for c in chunks_list if collection_name in (c.get("collections") or []))
            else:
                embedded = 0
            documents.append(
                {
                    "id": document["id"],
                    "file_name": document["file_name"],
                    "file_type": document["file_type"],
                    "file_url": document["file_url"],
                    "pages": document["pages"],
                    "uploaded_at": document["uploaded_at"],
                    "chunk_status": document["chunk_status"],
                    "embedding_status": f"{embedded}/{total}" if total > 0 else "0",
                    "ingest_status": "no" if embedded == 0 else f"doing",
                }
            )
        return documents

    def get_pages(self, document_id: str) -> list[dict[str, Any]]:
        data = self._document_json(document_id)
        if data is None:
            return SAMPLE_PAGES if document_id in {"mineru-demo", "sample"} else []
        return self._extract_pages(data)

    def get_native_result(self, document_id: str) -> dict[str, Any]:
        return self._document_json(document_id) or {}

    def get_chunks(self, document_id: str) -> list[dict[str, Any]]:
        data = self._document_json(document_id)
        if data and data.get("chunks"):
            return data["chunks"]

        pages = self.get_pages(document_id)
        chunk_ids = {
            chunk_id
            for page in pages
            for block in page.get("blocks", [])
            for chunk_id in block.get("chunk_ids", [])
        }
        chunks = []
        for record in SAMPLE_RECORDS:
            if not chunk_ids or record["id"] in chunk_ids:
                chunks.append(
                    {
                        "id": record["id"],
                        "text": record["document"],
                        "metadata": record["metadata"],
                        "collections": ["sample_knowledge_base"] if record.get("embedding") else [],
                    }
                )
        return chunks

    @staticmethod
    def _is_table_text(text: str) -> bool:
        """Check if text is markdown table or HTML table content."""
        stripped = text.strip()
        # Markdown table: contains pipe-separated rows
        if "|" in stripped:
            lines = [ln.strip() for ln in stripped.split("\n") if ln.strip()]
            pipe_lines = [ln for ln in lines if ln.startswith("|") and ln.endswith("|")]
            if len(pipe_lines) >= 2:
                return True
        # HTML table
        if "<table" in stripped.lower():
            return True
        return False

    @staticmethod
    def _split_sentences(text: str) -> list[str]:
        """Split text into sentences for Chinese/English mixed content."""
        # Normalize line breaks: join OCR-wrapped lines with space
        text = text.replace("\r\n", " ").replace("\r", " ").replace("\n", " ")

        result: list[str] = []
        # Collapse multiple spaces into one
        text = re.sub(r"\s{2,}", " ", text).strip()
        if not text:
            return result

        parts = re.split(r"(?<=[。！？；!?])\s*", text)

        for part in parts:
            modified = re.sub(
                r"([a-zA-Z]{2,})\.(\s+)([A-Z一-鿿])",
                lambda m: m.group(1) + "\x00" + m.group(2) + m.group(3),
                part,
            )
            for sub in modified.split("\x00"):
                sub = sub.strip()
                if sub and len(sub) >= 2:
                    result.append(sub)

        return result

    def embed_chunks(self, document_id: str, chunk_ids: list[str], collection: str, chroma_svc: Any) -> dict[str, Any] | None:
        """将选中的 chunk 做句子切分、向量化，写入 ChromaDB 指定集合。
        
        流程：
        1. 找到文档 JSON 文件
        2. 过滤：跳过已在该集合中嵌入过的 chunk（从 chunk.collections 判断，无需查 ChromaDB）
        3. 对未嵌入的 chunk 切句（表格整段保留，普通文本按中英文标点切分）
        4. 生成 embedding 向量并写入 ChromaDB
        5. 更新本地 JSON：chunk.collections 追加集合名，document.collections 记录映射
        """
        # ── 1. 查找文档 JSON 文件 ──
        json_path = None
        data = None
        for path in self._json_files():
            if path.stem == document_id:
                json_path = path
                data = self._read_json(path)
                break

        if data is None:
            return None
        
        # ── 2. 构建 chunk 索引 ──
        chunks = data.get("chunks", [])
        chunk_map = {c["id"]: c for c in chunks}

        to_embed: list[dict[str, Any]] = []
        skipped = 0
        not_found = 0

        # ── 3. 过滤：跳过已嵌入当前集合的 chunk ──
        for cid in chunk_ids:
            chunk = chunk_map.get(cid)
            if chunk is None:
                not_found += 1  # chunk_id 在文档中不存在
            elif collection in (chunk.get("collections") or []):
                skipped += 1    # 已嵌入当前集合，跳过
            else:
                to_embed.append(chunk)  # 需要嵌入

        # ── 4. 句子切分 + 向量化 + 写入 ChromaDB ──
        total_sentences = 0
        embedded_count = 0
        if to_embed:
            all_ids: list[str] = []
            all_documents: list[str] = []
            all_metadatas: list[dict[str, Any]] = []

            for chunk in to_embed:
                chunk_text = chunk["text"]
                chunk_meta = chunk.get("metadata", {})
                if self._is_table_text(chunk_text):
                    # 表格文本保持整段，不切句
                    sentence_id = f"{document_id}_{chunk['id']}_sent_0000"
                    all_ids.append(sentence_id)
                    all_documents.append(chunk_text)
                    all_metadatas.append({**chunk_meta, "sentence_index": 0})
                    total_sentences += 1
                else:
                    # 普通文本按中英文标点切句
                    sentences = self._split_sentences(chunk_text)
                    for idx, sentence in enumerate(sentences):
                        sentence_id = f"{document_id}_{chunk['id']}_sent_{idx:04d}"
                        sentence_meta = {
                            **chunk_meta,
                            "sentence_index": idx,
                        }
                        all_ids.append(sentence_id)
                        all_documents.append(sentence)
                        all_metadatas.append(sentence_meta)
                        total_sentences += 1

            if all_ids:
                # 生成 embedding 向量
                all_embeddings = self.embedding_service.embed(all_documents)
                # 写入 ChromaDB
                success = chroma_svc.add_to_collection(collection, all_ids, all_documents, all_metadatas, all_embeddings)
                if success:
                    # ── 5. 更新本地 JSON：标记 chunk 和文档的集合归属 ──
                    for c in to_embed:
                        cols = c.get("collections")
                        if not isinstance(cols, list):
                            cols = []
                            c["collections"] = cols
                        if collection not in cols:
                            cols.append(collection)
                    embedded_count = len(to_embed)

                    # 获取集合的显示名称
                    display_name = collection
                    try:
                        display_name = chroma_svc.get_collection_display_name(collection)
                    except Exception:
                        pass

                    # 更新文档级集合映射
                    doc_info = data.get("document")
                    if doc_info is None:
                        doc_info = {}
                        data["document"] = doc_info

                    doc_collections = doc_info.get("collections")
                    if not isinstance(doc_collections, dict):
                        doc_collections = {}
                    doc_collections[collection] = display_name
                    doc_info["collections"] = doc_collections

                    # 持久化到 JSON 文件
                    with json_path.open("w", encoding="utf-8") as f:
                        json.dump(data, f, ensure_ascii=False, indent=2)

        return {
            "embedded": embedded_count,   # 本次新嵌入的 chunk 数
            "sentences": total_sentences, # 生成的句子向量数
            "skipped": skipped,           # 已存在跳过的 chunk 数
            "not_found": not_found,       # 未找到的 chunk_id 数
            "total": len(chunk_ids),      # 请求处理的 chunk 总数
        }

    def upload_and_parse(self, source_path: Path, original_name: str) -> dict[str, Any]:
        document_id = f"tmp{uuid4().hex[:8]}-{uuid4().hex[:8]}"
        upload_dir = self.settings.upload_dir
        data_dir = self.settings.mineru_data_dir
        upload_dir.mkdir(parents=True, exist_ok=True)
        data_dir.mkdir(parents=True, exist_ok=True)

        saved_path = upload_dir / f"{document_id}{source_path.suffix}"
        if source_path.resolve() != saved_path.resolve():
            shutil.copyfile(source_path, saved_path)
        file_url = f"/uploads/{saved_path.name}"

        parsed = self.mineru_api.parse_file(saved_path, original_name, document_id)

        # 构造最终返回结构
        result = self._build_result(parsed, original_name, document_id, file_url)

        # 保存到 JSON 文件
        json_path = data_dir / f"{document_id}.json"
        with json_path.open("w", encoding="utf-8") as file:
            json.dump(result, file, ensure_ascii=False, indent=2)

        return result

    def _build_result(
        self, parsed: dict[str, Any], original_name: str, document_id: str, file_url: str
    ) -> dict[str, Any]:
        native_json = parsed.get("native_json", {})
        batch_id = parsed.get("task", {}).get("batch_id", "")
        raw_result = parsed.get("task", {}).get("raw_result", {})

        pages = self._extract_pages(parsed)
        chunks = self._chunks_from_pages(pages, original_name, document_id)

        uploaded_at = (
            native_json.get("uploaded_at")
            or parsed.get("uploaded_at")
            or datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
        )
        
        markdown_content = native_json.get("markdown_content") or ""

        total_chunks = len(chunks)
        
        result: dict[str, Any] = {
            "document": {
                "id": document_id,
                "file_name": native_json.get("file_name") or original_name,
                "file_type": native_json.get("file_type") or "pdf",
                "file_url": file_url,
                "pages": len(pages),
                "uploaded_at": uploaded_at,
                "ocr_status": "done",
                "chunk_status": str(total_chunks) if total_chunks > 0 else "0",
                "collections": {},
            },  # 用于管理文档
            "pages": pages,    #用于文档可视化
            "mineru_task": {
                "batch_id": batch_id,
                "raw_result": raw_result,
            },
            "chunks": chunks,
            "parse_mode": "mineru-api",
            "mineru_api_configured": bool(self.settings.mineru_api_key),
            "message": f"文档 {original_name} 已解析完成，共 {len(pages)} 页",
        }
        if markdown_content:
            result["markdown_content"] = markdown_content
        return result


    def repair_document_data(self, chroma_svc: Any) -> dict[str, Any]:
        """修正所有文档 JSON 中的 collections 数据，以 ChromaDB 实际状态为准。

        遍历每个文档 JSON 文件，对每个 ChromaDB 集合查询该文档实际已嵌入的 chunk，
        然后更新 chunks[].collections 和 document.collections，防止数据偏移。
        """
        json_files = self._json_files()
        if not json_files:
            return {"repaired": 0, "total_documents": 0, "details": [], "message": "没有找到文档 JSON 文件"}

        # 获取所有 ChromaDB 集合（排除前端示例集合）
        collections = chroma_svc.list_collections()
        chroma_collections = [c for c in collections if c.get("source") == "chroma"]

        repaired_count = 0
        details: list[dict[str, Any]] = []

        for path in json_files:
            data = self._read_json(path)
            document_id = path.stem
            chunks = data.get("chunks", [])
            if not chunks:
                continue

            changed = False
            chunk_map = {c["id"]: c for c in chunks}
            new_doc_collections: dict[str, str] = {}

            for col in chroma_collections:
                col_name = col["name"]
                col_display = col.get("display_name", col_name)

                # 从 ChromaDB 查询该文档在此集合中实际存在的 chunk_id
                actual_chunk_ids = chroma_svc.get_chunk_ids_for_document(col_name, document_id)
                if not actual_chunk_ids:
                    continue

                new_doc_collections[col_name] = col_display

                # 逐 chunk 修正 collections 列表
                for cid, chunk in chunk_map.items():
                    cols = chunk.get("collections")
                    if not isinstance(cols, list):
                        cols = []
                        chunk["collections"] = cols

                    if cid in actual_chunk_ids:
                        if col_name not in cols:
                            cols.append(col_name)
                            changed = True
                    else:
                        if col_name in cols:
                            cols.remove(col_name)
                            changed = True

            # 修正文档级 collections 映射
            doc_info = data.get("document")
            if doc_info is not None:
                old_cols = doc_info.get("collections") or {}
                if old_cols != new_doc_collections:
                    doc_info["collections"] = new_doc_collections
                    changed = True

            if changed:
                with path.open("w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                repaired_count += 1
                details.append({
                    "document_id": document_id,
                    "file_name": (data.get("document") or {}).get("file_name", ""),
                    "collections": new_doc_collections,
                })

        return {
            "repaired": repaired_count,
            "total_documents": len(json_files),
            "details": details,
            "message": f"已修正 {repaired_count} 个文档的 collections 数据",
        }
    def _json_files(self) -> list[Path]:
        data_dir = self.settings.mineru_data_dir
        if not data_dir.exists():
            return []
        return sorted(data_dir.glob("*.json"))

    def _document_json(self, document_id: str) -> dict[str, Any] | None:
        for path in self._json_files():
            if path.stem == document_id:
                return self._read_json(path)
        return None

    def _read_json(self, path: Path) -> dict[str, Any]:
        with path.open("r", encoding="utf-8") as file:
            return json.load(file)

    def _extract_pages(self, data: dict[str, Any]) -> list[dict[str, Any]]:
        native_json = data.get("native_json", {})
        pdf_info = native_json.get("pdf_info") or data.get("pdf_info") or data.get("pages") or []
        file_url = data.get("file_url", "")
        page_pdf_url = data.get("page_pdf_url") or ""
        page_images = data.get("page_images", {})
        pages = []
        block_counter = 0

        for index, raw_page in enumerate(pdf_info, start=1):
            if raw_page.get("page_no") is not None:
                page_no = int(raw_page["page_no"])
            elif raw_page.get("page_idx") is not None:
                page_no = int(raw_page["page_idx"]) + 1
            else:
                page_no = index

            page_size = raw_page.get("page_size") or []
            width = page_size[0] if page_size else raw_page.get("width", 900)
            height = page_size[1] if page_size else raw_page.get("height", 1200)

            image_info = page_images.get(page_no, {})
            image_url = raw_page.get("image_url") or image_info.get("image_url", "")

            raw_blocks = (
                raw_page.get("para_blocks")
                or raw_page.get("preproc_blocks")
                or raw_page.get("blocks")
                or raw_page.get("layout_dets")
                or []
            )
            flat_blocks = self._flatten_blocks(raw_blocks)
            blocks = []
            for block in flat_blocks:
                block_counter += 1
                blocks.append(self._normalize_block(block, block_counter))

            if image_url and not self._valid_page_image_shape(width, height):
                image_url = ""
                width, height = self._estimate_page_size(blocks, width, height)

            page: dict[str, Any] = {
                "page_no": page_no,
                "width": int(width),
                "height": int(height),
                "blocks": blocks,
            }
            if image_url:
                page["image_url"] = image_url
            pages.append(page)

        return pages

    def _valid_page_image_shape(self, width: int | float, height: int | float) -> bool:
        try:
            width_value = float(width)
            height_value = float(height)
        except Exception:
            return False
        if width_value < 600 or height_value < 800:
            return False
        return height_value / max(width_value, 1) > 1.1

    def _estimate_page_size(self, blocks: list[dict[str, Any]], width: Any, height: Any) -> tuple[int, int]:
        max_x = 0
        max_y = 0
        for block in blocks:
            bbox = block.get("bbox") or []
            if len(bbox) >= 4:
                max_x = max(max_x, int(float(bbox[2])))
                max_y = max(max_y, int(float(bbox[3])))
        estimated_width = max(900, int(max_x * 1.08) if max_x else int(width or 900))
        estimated_height = max(1200, int(max_y * 1.18) if max_y else int(height or 1200))
        return estimated_width, estimated_height

    def _flatten_blocks(self, blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
        flat: list[dict[str, Any]] = []
        for block in blocks:
            nested = block.get("blocks")
            if isinstance(nested, list) and nested:
                flat.extend(self._flatten_blocks(nested))
            else:
                flat.append(block)
        return flat

    def _extract_block_text(self, block: dict[str, Any]) -> str:
        for key in ("text", "content", "html", "latex"):
            value = block.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()

        line_texts: list[str] = []
        for line in block.get("lines") or []:
            if not isinstance(line, dict):
                continue
            line_content = line.get("content")
            if isinstance(line_content, str) and line_content.strip():
                line_texts.append(line_content.strip())
                continue
            span_parts: list[str] = []
            for span in line.get("spans") or []:
                if not isinstance(span, dict):
                    continue
                for span_key in ("content", "text", "html", "latex"):
                    span_value = span.get(span_key)
                    if isinstance(span_value, str) and span_value.strip():
                        span_parts.append(span_value.strip())
                        break
            if span_parts:
                line_texts.append("".join(span_parts))

        if line_texts:
            return "\n".join(line_texts)

        nested = block.get("blocks")
        if isinstance(nested, list) and nested:
            nested_texts = [self._extract_block_text(child) for child in nested if isinstance(child, dict)]
            nested_texts = [text for text in nested_texts if text]
            if nested_texts:
                return "\n".join(nested_texts)

        raw = block.get("raw")
        if isinstance(raw, dict) and raw is not block:
            return self._extract_block_text(raw)

        return ""

    def _normalize_block(self, block: dict[str, Any], index: int) -> dict[str, Any]:
        bbox = block.get("bbox") or block.get("poly") or [80, 80 + index * 90, 720, 140 + index * 90]
        if len(bbox) > 4:
            xs = bbox[0::2]
            ys = bbox[1::2]
            bbox = [min(xs), min(ys), max(xs), max(ys)]

        text = self._extract_block_text(block)

        block_id = str(block.get("id") or f"mineru_block_{index:03d}")
        
        return {
            "id": block_id,
            "type": block.get("type") or block.get("category") or block.get("layout_type") or "paragraph",
            "text": text,
            "bbox": bbox[:4],
            "confidence": block.get("confidence") or block.get("score") or None,
        }

    def _chunks_from_pages(self, pages: list[dict[str, Any]], original_name: str, document_id: str) -> list[dict[str, Any]]:
        chunks = []
        for page in pages:
            page_no = page.get("page_no", 1)
            for block in page.get("blocks", []):
                text = str(block.get("text") or "").strip()
                if not text:
                    continue
                block_id = block.get("id")

                chunks.append({
                    "id": block_id,
                    "text": text,
                    "metadata": {
                        "source": original_name,
                        "page": page_no,
                        "document_id": document_id,
                    },
                    "collections": []
                })
        return chunks

    def _local_parse(self, file_path: Path, original_name: str, document_id: str) -> dict[str, Any]:
        from app.services.mineru_api import MineruApiClient

        client = MineruApiClient()
        return client._local_parse(file_path, original_name, document_id)
