from __future__ import annotations

import math
from typing import Iterable


def project_to_3d(embeddings: Iterable[Iterable[float]]) -> list[dict[str, float]]:
    vectors = [list(map(float, vector)) for vector in embeddings]
    if not vectors:
        return []

    try:
        import numpy as np
        from sklearn.decomposition import PCA

        matrix = np.array(vectors, dtype=float)
        if len(matrix) == 1:
            return [{"x": 0.0, "y": 0.0, "z": 0.0}]

        components = min(3, len(matrix), len(matrix[0]))
        coords = PCA(n_components=components).fit_transform(matrix)
        if components < 3:
            coords = np.pad(coords, ((0, 0), (0, 3 - components)))

        max_abs = float(np.max(np.abs(coords))) or 1.0
        normalized = coords / max_abs
        return [
            {"x": float(row[0]), "y": float(row[1]), "z": float(row[2])}
            for row in normalized
        ]
    except Exception:
        return _fallback_layout(len(vectors))


def _fallback_layout(count: int) -> list[dict[str, float]]:
    points: list[dict[str, float]] = []
    if count == 1:
        return [{"x": 0.0, "y": 0.0, "z": 0.0}]

    for index in range(count):
        angle = index * 2.399963229728653
        z = 1 - (2 * index / max(count - 1, 1))
        radius = math.sqrt(max(0.0, 1 - z * z))
        points.append(
            {
                "x": radius * math.cos(angle),
                "y": radius * math.sin(angle),
                "z": z,
            }
        )
    return points

