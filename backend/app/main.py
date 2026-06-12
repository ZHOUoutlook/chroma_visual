import shutil
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any, Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.models import QueryRequest
from app.services.chroma_service import ChromaService
from app.services.embedding_service import EmbeddingService
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

embedding_service = EmbeddingService()
chroma_service = ChromaService(embedding_service)
mineru_service = MineruService(embedding_service)
mineru_service.settings.upload_dir.mkdir(parents=True, exist_ok=True)
mineru_service.settings.mineru_assets_dir.mkdir(parents=True, exist_ok=True)
mineru_service.settings.mineru_meta_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=mineru_service.settings.upload_dir), name="uploads")
app.mount("/mineru-assets", StaticFiles(directory=mineru_service.settings.mineru_assets_dir), name="mineru-assets")

@app.on_event("shutdown")
def shutdown() -> None:
    """Gracefully release ChromaDB resources on app shutdown."""
    chroma_service.close()


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
def list_documents(collection: str = ""):
    return mineru_service.list_documents(collection if collection else None)
    


@app.get("/api/documents/{document_id}/native")
def get_native_result(document_id: str):
    result = mineru_service.get_native_result(document_id)
    if not result:
        raise HTTPException(status_code=404, detail="Native result not found")
    return result


@app.get("/api/documents/{document_id}/chunks")
def get_chunks(document_id: str):
    return mineru_service.get_chunks(document_id)


@app.post("/api/documents/{document_id}/embedding")
def embed_chunks(document_id: str, payload: dict[str, Any]):
    chunk_ids = payload.get("chunk_ids", [])
    collection = payload.get("collection") or document_id
    if not chunk_ids:
        raise HTTPException(status_code=400, detail="No chunk_ids provided")
    result = mineru_service.embed_chunks(document_id, chunk_ids, collection, chroma_service)
    if result is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return result


@app.get("/api/chroma/collections")
def list_collections():
    return chroma_service.list_collections()


@app.post("/api/chroma/collections")
def create_collection(payload: dict[str, Any]):
    collection_name = payload.get("name", "").strip()
    if not collection_name:
        raise HTTPException(status_code=400, detail="Collection name is required")
    metadata = payload.get("metadata", {})
    success = chroma_service.create_collection(collection_name, metadata)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to create collection or Chroma unavailable")
    return {"name": collection_name, "created": True}


@app.delete("/api/chroma/collections/{collection_name}")
def delete_collection(collection_name: str):
    success = chroma_service.delete_collection(collection_name)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete collection or Chroma unavailable")
    return {"name": collection_name, "deleted": True}


@app.get("/api/chroma/status")
def get_chroma_status():
    return chroma_service.status()


@app.get("/api/chroma/collections/{collection_name}/records")
def get_collection_records(collection_name: str, limit: int = 500, offset: int = 0):
    return chroma_service.get_collection_records(collection_name, limit, offset, include_embeddings=False)


@app.delete("/api/chroma/collections/{collection_name}/records")
def delete_collection_records(collection_name: str, payload: dict[str, Any]):
    record_ids = payload.get("ids", [])
    if not record_ids:
        raise HTTPException(status_code=400, detail="No ids provided")
    success = chroma_service.delete_records(collection_name, record_ids)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete records or Chroma unavailable")
    return {"deleted": len(record_ids)}


@app.delete("/api/chroma/collections/{collection_name}/clear")
def clear_collection(collection_name: str):
    count = chroma_service.clear_collection(collection_name)
    if count < 0:
        raise HTTPException(status_code=500, detail="Failed to clear collection or Chroma unavailable")
    return {"cleared": count}


# @app.get("/api/chroma/collections/{collection_name}/embedded-chunks/{document_id}")
# def get_embedded_chunk_ids(collection_name: str, document_id: str):
#     return chroma_service.get_embedded_chunk_ids(collection_name, document_id)


@app.get("/api/chroma/collections/{collection_name}/embeddings/3d")
def get_3d_embeddings(collection_name: str):
    return chroma_service.get_3d_points(collection_name)



@app.post("/api/admin/repair-collections")
def repair_collections():
    """修正所有文档 JSON 中的 collections 数据，以 ChromaDB 实际向量数据为准，防止数据偏移。"""
    return mineru_service.repair_document_data(chroma_service)

@app.post("/api/query")
def query(payload: QueryRequest):
    return chroma_service.query(payload.collection, payload.query, payload.top_k, payload.where)
