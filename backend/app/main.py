import shutil
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.models import QueryRequest
from app.services.chroma_service import ChromaService
from app.services.mineru_api import MineruApiError
from app.services.mineru_service import MineruService

app = FastAPI(title="Knowledge Base Vector Visualization API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

chroma_service = ChromaService()
mineru_service = MineruService()
mineru_service.settings.upload_dir.mkdir(parents=True, exist_ok=True)
mineru_service.settings.mineru_assets_dir.mkdir(parents=True, exist_ok=True)
mineru_service.settings.mineru_meta_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=mineru_service.settings.upload_dir), name="uploads")
app.mount("/mineru-assets", StaticFiles(directory=mineru_service.settings.mineru_assets_dir), name="mineru-assets")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/mineru/status")
def mineru_status():
    settings = mineru_service.settings
    return {
        "configured": bool(settings.mineru_api_key),
        "api_base_url": settings.mineru_api_base_url,
        "poll_timeout_seconds": settings.mineru_poll_timeout_seconds,
        "poll_interval_seconds": settings.mineru_poll_interval_seconds,
        "upload_dir": str(settings.upload_dir),
        "mineru_data_dir": str(settings.mineru_data_dir),
    }


@app.post("/api/documents/upload")
async def upload_document(file: UploadFile = File(...)):
    suffix = ""
    if file.filename and "." in file.filename:
        suffix = "." + file.filename.rsplit(".", 1)[-1]

    with NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        shutil.copyfileobj(file.file, temp_file)
        temp_path = temp_file.name

    try:
        try:
            return mineru_service.upload_and_parse(
                source_path=Path(temp_path),
                original_name=file.filename or "uploaded-file",
            )
        except MineruApiError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
    finally:
        Path(temp_path).unlink(missing_ok=True)


@app.get("/api/documents")
def list_documents():
    return mineru_service.list_documents()


@app.get("/api/documents/{document_id}")
def get_document(document_id: str):
    document = mineru_service.get_document(document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return document


@app.get("/api/documents/{document_id}/pages")
def get_pages(document_id: str):
    return mineru_service.get_pages(document_id)


@app.get("/api/documents/{document_id}/pages/{page_no}/ocr-blocks")
def get_ocr_blocks(document_id: str, page_no: int):
    return mineru_service.get_ocr_blocks(document_id, page_no)


@app.get("/api/documents/{document_id}/structure")
def get_structure(document_id: str):
    return mineru_service.get_structure(document_id)


@app.get("/api/documents/{document_id}/native")
def get_native_result(document_id: str):
    result = mineru_service.get_native_result(document_id)
    if not result:
        raise HTTPException(status_code=404, detail="Native result not found")
    return result


@app.get("/api/documents/{document_id}/chunks")
def get_chunks(document_id: str):
    return mineru_service.get_chunks(document_id)


@app.get("/api/chunks/{chunk_id}")
def get_chunk(chunk_id: str):
    chunk = mineru_service.get_chunk(chunk_id)
    if chunk is None:
        raise HTTPException(status_code=404, detail="Chunk not found")
    return chunk


@app.post("/api/documents/{document_id}/embedding")
def embed_chunks(document_id: str, payload: dict[str, Any]):
    chunk_ids = payload.get("chunk_ids", [])
    if not chunk_ids:
        raise HTTPException(status_code=400, detail="No chunk_ids provided")
    result = mineru_service.embed_chunks(document_id, chunk_ids, chroma_service)
    if result is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return result


@app.get("/api/chroma/collections")
def list_collections():
    return chroma_service.list_collections()


@app.get("/api/chroma/status")
def get_chroma_status():
    return chroma_service.status()


@app.get("/api/chroma/collections/{collection_name}/stats")
def get_collection_stats(collection_name: str):
    return chroma_service.get_collection_stats(collection_name)


@app.get("/api/chroma/collections/{collection_name}/records")
def get_collection_records(collection_name: str, limit: int = 200):
    return chroma_service.get_collection_records(collection_name, limit)


@app.get("/api/chroma/collections/{collection_name}/embeddings/3d")
def get_3d_embeddings(collection_name: str):
    return chroma_service.get_3d_points(collection_name)


@app.post("/api/chroma/collections/{collection_name}/query")
def query_collection(collection_name: str, payload: QueryRequest):
    return chroma_service.query(collection_name, payload.query, payload.top_k, payload.where)


@app.post("/api/query")
def query(payload: QueryRequest):
    return chroma_service.query(payload.collection, payload.query, payload.top_k, payload.where)
