from __future__ import annotations

import io
import json
import re
import time
import zipfile
from pathlib import Path
from typing import Any

import httpx

from app.config import get_settings


class MineruApiError(RuntimeError):
    pass


class MineruApiClient:
    def __init__(self) -> None:
        self.settings = get_settings()

    def parse_file(self, file_path: Path, original_name: str, document_id: str) -> dict[str, Any]:
        if not self.settings.mineru_api_key:
            raise MineruApiError("MINERU_API_KEY is not configured")

        batch = self._create_batch_upload(original_name)
        file_url = self._extract_file_upload_url(batch)
        batch_id = batch.get("batch_id") or batch.get("data", {}).get("batch_id")
        if not batch_id:
            raise MineruApiError(f"MinerU response missing batch_id: {batch}")

        self._upload_file(file_url, file_path)
        result = self._wait_for_result(str(batch_id))
        parsed = self._download_result(result, document_id)
        parsed["task"] = {
            "batch_id": batch_id,
            "raw_result": result,
        }
        return parsed

    def _create_batch_upload(self, original_name: str) -> dict[str, Any]:
        url = f"{self.settings.mineru_api_base_url.rstrip('/')}/api/v4/file-urls/batch"
        payload = {
            "enable_formula": True,
            "enable_table": True,
            "language": "ch",
            "model_version": "vlm",
            "files": [
                {
                    "name": original_name,
                    "is_ocr": True,
                    "data_id": original_name,
                }
            ],
        }
        response = self._request("POST", url, headers=self._headers(), json=payload, timeout=30)
        self._raise_for_mineru(response, "create upload task")
        return response.json()

    def _extract_file_upload_url(self, batch: dict[str, Any]) -> str:
        candidates = []
        data = batch.get("data")
        if isinstance(data, dict):
            candidates.extend(data.get("file_urls") or [])
            candidates.extend(data.get("files") or [])
        candidates.extend(batch.get("file_urls") or [])
        candidates.extend(batch.get("files") or [])

        for item in candidates:
            if isinstance(item, str):
                return item
            if isinstance(item, dict):
                value = item.get("url") or item.get("upload_url") or item.get("file_url")
                if value:
                    return str(value)
        raise MineruApiError(f"MinerU response missing upload url: {batch}")

    def _upload_file(self, file_url: str, file_path: Path) -> None:
        with file_path.open("rb") as file:
            response = self._request("PUT", file_url, content=file, timeout=120)
        if response.status_code >= 400:
            raise MineruApiError(f"upload file failed: {response.status_code} {response.text[:500]}")

    def _wait_for_result(self, batch_id: str) -> dict[str, Any]:
        deadline = time.monotonic() + self.settings.mineru_poll_timeout_seconds
        last_result: dict[str, Any] | None = None
        while time.monotonic() < deadline:
            result = self._get_batch_result(batch_id)
            last_result = result
            extract_result = self._extract_first_result(result)
            state = str(
                extract_result.get("state")
                or extract_result.get("status")
                or result.get("state")
                or result.get("status")
                or ""
            ).lower()
            if state in {"done", "success", "completed", "finish", "finished"} or self._result_has_download_url(extract_result):
                return result
            if state in {"failed", "fail", "error"}:
                raise MineruApiError(f"MinerU task failed: {result}")
            time.sleep(self.settings.mineru_poll_interval_seconds)

        raise MineruApiError(f"MinerU task timeout. Last result: {last_result}")

    def _get_batch_result(self, batch_id: str) -> dict[str, Any]:
        url = f"{self.settings.mineru_api_base_url.rstrip('/')}/api/v4/extract-results/batch/{batch_id}"
        response = self._request("GET", url, headers=self._headers(), timeout=30)
        self._raise_for_mineru(response, "get parse result")
        return response.json()

    def _download_result(self, result: dict[str, Any], document_id: str) -> dict[str, Any]:
        extract_result = self._extract_first_result(result)
        download_url = (
            extract_result.get("full_zip_url")
            or extract_result.get("zip_url")
            or extract_result.get("download_url")
            or extract_result.get("result_url")
        )
        if not download_url:
            raise MineruApiError(f"MinerU result missing download url: {result}")

        response = self._request("GET", str(download_url), timeout=120)
        if response.status_code >= 400:
            raise MineruApiError(f"download result failed: {response.status_code} {response.text[:500]}")

        native_json, page_images = self._read_zip_payload(response.content, document_id)
        if not native_json.get("pdf_info"):
            raise MineruApiError("MinerU native json missing pdf_info")
        # Use PDF download URL from native_json if available
        pdf_url = native_json.get("pdf_url") or native_json.get("origin_pdf_url") or native_json.get("raw_pdf_url") or ""
        return {
            "native_json": native_json,
            "file_name": native_json.get("file_name", ""),
            "file_type": native_json.get("file_type", ""),
            "uploaded_at": native_json.get("uploaded_at", ""),
            "page_images": page_images,
            "page_pdf_url": pdf_url,
            "extract_result": extract_result,
        }

    def _read_zip_payload(self, payload: bytes, document_id: str) -> tuple[dict[str, Any], dict[int, dict[str, Any]]]:
        native_json: dict[str, Any] = {}
        page_images: dict[int, dict[str, Any]] = {}
        markdown_content = ""
        assets_dir = self.settings.mineru_assets_dir / document_id
        assets_dir.mkdir(parents=True, exist_ok=True)

        with zipfile.ZipFile(io.BytesIO(payload)) as archive:
            for name in archive.namelist():
                lower = name.lower()
                if lower.endswith(".json"):
                    candidate = json.loads(archive.read(name).decode("utf-8", errors="ignore"))
                    if isinstance(candidate, dict) and candidate.get("pdf_info") is not None:
                        native_json = candidate
                if lower.endswith(".md") and "layout" not in lower and "span" not in lower:
                    candidate_md = archive.read(name).decode("utf-8", errors="ignore").strip()
                    if len(candidate_md) > len(markdown_content):
                        markdown_content = candidate_md
                if lower.endswith((".png", ".jpg", ".jpeg", ".webp")) and self._looks_like_page_image(lower):
                    page_no = self._page_no_from_asset_name(lower, len(page_images) + 1)
                    suffix = Path(lower).suffix or ".png"
                    output_name = f"page_{page_no:04d}{suffix}"
                    output_path = assets_dir / output_name
                    image_bytes = archive.read(name)
                    output_path.write_bytes(image_bytes)
                    size = self._read_image_size(image_bytes)
                    if not size or not self._looks_like_full_page_image(size):
                        continue
                    image_info: dict[str, Any] = {"image_url": f"/mineru-assets/{document_id}/{output_name}"}
                    image_info["image_width"], image_info["image_height"] = size
                    page_images[page_no] = image_info
        if markdown_content:
            native_json["markdown_content"] = markdown_content
        return native_json, page_images

    def _looks_like_page_image(self, name: str) -> bool:
        if any(part in name for part in ["layout", "span", "table", "equation", "formula"]):
            return False
        return any(part in name for part in ["page", "origin", "raw"])

    def _looks_like_full_page_image(self, size: tuple[int, int]) -> bool:
        width, height = size
        if width < 600 or height < 800:
            return False
        return height / max(width, 1) > 1.1

    def _page_no_from_asset_name(self, name: str, fallback: int) -> int:
        matches = re.findall(r"(?:page|p|_)(\d{1,4})(?:\D|$)", name)
        if matches:
            value = int(matches[-1])
            return value + 1 if value == 0 else value
        return fallback

    def _read_image_size(self, image_bytes: bytes) -> tuple[int, int] | None:
        if image_bytes.startswith(b"\x89PNG\r\n\x1a\n") and len(image_bytes) >= 24:
            return int.from_bytes(image_bytes[16:20], "big"), int.from_bytes(image_bytes[20:24], "big")
        if image_bytes.startswith(b"\xff\xd8"):
            index = 2
            while index < len(image_bytes) - 9:
                if image_bytes[index] != 0xFF:
                    index += 1
                    continue
                marker = image_bytes[index + 1]
                length = int.from_bytes(image_bytes[index + 2:index + 4], "big")
                if marker in {0xC0, 0xC1, 0xC2, 0xC3}:
                    height = int.from_bytes(image_bytes[index + 5:index + 7], "big")
                    width = int.from_bytes(image_bytes[index + 7:index + 9], "big")
                    return width, height
                index += 2 + length
        return None

    def _extract_first_result(self, result: dict[str, Any]) -> dict[str, Any]:
        data = result.get("data", result)
        if isinstance(data, dict):
            items = data.get("extract_result") or data.get("results") or data.get("files")
            if isinstance(items, list) and items:
                return items[0]
            return data
        if isinstance(data, list) and data:
            return data[0]
        return result

    def _result_has_download_url(self, result: dict[str, Any]) -> bool:
        return any(result.get(key) for key in ["full_zip_url", "zip_url", "download_url", "result_url"])

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.settings.mineru_api_key}",
            "Content-Type": "application/json",
        }

    def _request(self, method: str, url: str, **kwargs: Any) -> httpx.Response:
        try:
            with httpx.Client(trust_env=self.settings.mineru_trust_env) as client:
                return client.request(method, url, **kwargs)
        except httpx.HTTPError as exc:
            raise MineruApiError(f"MinerU HTTP request failed: {method} {url}: {exc}") from exc

    def _raise_for_mineru(self, response: httpx.Response, action: str) -> None:
        if response.status_code >= 400:
            raise MineruApiError(f"MinerU {action} failed: {response.status_code} {response.text[:500]}")
        data = response.json()
        code = data.get("code")
        if code not in {None, 0, 200, "0", "200"}:
            raise MineruApiError(f"MinerU {action} returned error: {data}")