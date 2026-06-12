from __future__ import annotations

import math
from typing import Iterable


def _do_pca(vectors: list[list[float]], n_components: int = 3):
    import numpy as np
    from sklearn.decomposition import PCA

    matrix = np.array(vectors, dtype=float)
    components = min(n_components, len(matrix), len(matrix[0]))
    pca = PCA(n_components=components)
    coords = pca.fit_transform(matrix)
    if components < n_components:
        coords = np.pad(coords, ((0, 0), (0, n_components - components)))
    max_abs = float(np.max(np.abs(coords))) or 1.0
    return coords / max_abs, pca, max_abs


def project_to_3d(embeddings: Iterable[Iterable[float]], max_samples: int = 2000) -> list[dict[str, float]]:
    vectors = [list(map(float, vector)) for vector in embeddings if vector]
    if not vectors:
        return []

    try:
        if len(vectors) == 1:
            return [{"x": 0.0, "y": 0.0, "z": 0.0}]

        # 大集合采样 PCA：用子集拟合变换矩阵，再变换全量
        if len(vectors) > max_samples:
            import random
            indices = sorted(random.sample(range(len(vectors)), max_samples))
            sample = [vectors[i] for i in indices]
            _, pca, max_abs = _do_pca(sample)
            import numpy as np
            matrix = np.array(vectors, dtype=float)
            coords = pca.transform(matrix) / max_abs
            if coords.shape[1] < 3:
                coords = np.pad(coords, ((0, 0), (0, 3 - coords.shape[1])))
        else:
            coords, _, _ = _do_pca(vectors)

        return [{"x": float(row[0]), "y": float(row[1]), "z": float(row[2])} for row in coords]
    except Exception as exc:
        import logging
        logging.getLogger("uvicorn.error").warning(
            "PCA projection failed (embeddings=%d dim=%d): %s — using fallback layout",
            len(vectors), len(vectors[0]) if vectors else 0, exc
        )
        return _fallback_layout(len(vectors))


def project_query_to_3d(
    record_embeddings: Iterable[Iterable[float]],
    query_embedding: list[float],
) -> tuple[list[dict[str, float]], dict[str, float]]:
    """Project records + query to 3D using a single PCA fit. Returns (record_points, query_point)."""
    vectors = [list(map(float, vec)) for vec in record_embeddings if vec]
    if not vectors:
        return [], {"x": 0.0, "y": 0.0, "z": 0.0}

    try:
        coords, pca, max_abs = _do_pca(vectors)
        query_vec = pca.transform([list(map(float, query_embedding))])
        query_3d = query_vec / max_abs

        if query_3d.shape[1] < 3:
            query_3d = np.pad(query_3d, ((0, 0), (0, 3 - query_3d.shape[1])))

        record_points = [
            {"x": float(row[0]), "y": float(row[1]), "z": float(row[2])}
            for row in coords
        ]
        query_point = {
            "x": float(query_3d[0][0]),
            "y": float(query_3d[0][1]),
            "z": float(query_3d[0][2]),
        }
        return record_points, query_point
    except Exception:
        return _fallback_layout(len(vectors)), {"x": 0.0, "y": 0.0, "z": 0.0}


def _fallback_layout(count: int) -> list[dict[str, float]]:
    points: list[dict[str, float]] = []
    if count <= 1:
        return [{"x": 0.0, "y": 0.0, "z": 0.0}]

    for index in range(count):
        angle = index * 2.399963229728653  # golden angle
        z = 1 - (2 * index / max(count - 1, 1))
        max_radius = math.sqrt(max(0.0, 1 - z * z))
        # Deterministic fill factor so points spread through the volume, not just the shell
        fill = 0.15 + 0.85 * ((index * 0.754877669) % 1.0)
        r = max_radius * fill
        points.append(
            {
                "x": r * math.cos(angle),
                "y": r * math.sin(angle),
                "z": z,
            }
        )
    return points

