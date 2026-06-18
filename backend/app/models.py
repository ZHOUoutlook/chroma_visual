from typing import Any
from pydantic import BaseModel, Field


class QueryRequest(BaseModel):
    collection: str
    query: str
    top_k: int = Field(default=5, ge=1, le=50)
    where: dict[str, Any] | None = None


class VectorPoint(BaseModel):
    id: str
    x: float
    y: float
    z: float
    document: str
    metadata: dict[str, Any]
    score: float | None = None


class QueryResponse(BaseModel):
    query: str
    query_point: dict[str, float]
    results: list[VectorPoint]
