SAMPLE_RECORDS = [
    {
        "id": "chunk_001",
        "document": "向量数据库用于存储文本、图片等内容的 embedding，并支持相似度检索。",
        "metadata": {"source": "vector-db-demo.pdf", "page": 1, "chunk_id": "chunk_001", "section": "基础概念"},
        "embedding": [0.12, 0.31, 0.88, 0.44, 0.19, 0.52],
    },
    {
        "id": "chunk_002",
        "document": "Chroma 是一个常见的开源向量数据库，适合本地 RAG 原型和知识库检索。",
        "metadata": {"source": "vector-db-demo.pdf", "page": 2, "chunk_id": "chunk_002", "section": "Chroma"},
        "embedding": [0.18, 0.28, 0.79, 0.55, 0.26, 0.49],
    },
    {
        "id": "chunk_003",
        "document": "MinerU OCR 可以把 PDF 页面解析为文本块、标题、表格、公式和图片区域。",
        "metadata": {"source": "mineru-demo.pdf", "page": 1, "chunk_id": "chunk_003", "section": "OCR"},
        "embedding": [0.75, 0.11, 0.24, 0.62, 0.71, 0.35],
    },
    {
        "id": "chunk_004",
        "document": "Chunk 切分需要保留来源文档、页码、章节和 overlap 信息，方便后续追溯。",
        "metadata": {"source": "mineru-demo.pdf", "page": 2, "chunk_id": "chunk_004", "section": "Chunk"},
        "embedding": [0.69, 0.18, 0.31, 0.57, 0.66, 0.41],
    },
    {
        "id": "chunk_005",
        "document": "查询可视化会展示 query embedding、Top-K 命中结果、相似度和向量空间距离。",
        "metadata": {"source": "query-demo.pdf", "page": 1, "chunk_id": "chunk_005", "section": "查询"},
        "embedding": [0.22, 0.82, 0.35, 0.14, 0.47, 0.91],
    },
]


SAMPLE_DOCUMENTS = [
    {
        "id": "mineru-demo",
        "file_name": "mineru-demo.pdf",
        "file_type": "pdf",
        "pages": 2,
        "uploaded_at": "2026-05-28T10:00:00+08:00",
        "ocr_status": "done",
        "chunk_status": "done",
        "embedding_status": "done",
        "ingest_status": "done",
        "error": "",
    }
]


SAMPLE_PAGES = [
    {
        "page_no": 1,
        "width": 900,
        "height": 1200,
        "blocks": [
            {
                "id": "block_001",
                "type": "title",
                "text": "MinerU OCR 文档解析",
                "bbox": [90, 80, 700, 150],
                "confidence": 0.98,
                "chunk_ids": ["chunk_003"],
            },
            {
                "id": "block_002",
                "type": "paragraph",
                "text": "页面会被解析为标题、段落、表格、公式和图片区域。",
                "bbox": [90, 190, 760, 300],
                "confidence": 0.94,
                "chunk_ids": ["chunk_003"],
            },
            {
                "id": "block_003",
                "type": "table",
                "text": "类型 | 数量 | 状态",
                "bbox": [90, 360, 800, 560],
                "confidence": 0.91,
                "chunk_ids": [],
            },
        ],
    },
    {
        "page_no": 2,
        "width": 900,
        "height": 1200,
        "blocks": [
            {
                "id": "block_004",
                "type": "title",
                "text": "Chunk 切分与追溯",
                "bbox": [90, 90, 650, 150],
                "confidence": 0.97,
                "chunk_ids": ["chunk_004"],
            },
            {
                "id": "block_005",
                "type": "paragraph",
                "text": "每个 Chunk 都应保留来源文档、页码、章节和 OCR 区域映射。",
                "bbox": [90, 200, 790, 340],
                "confidence": 0.95,
                "chunk_ids": ["chunk_004"],
            },
        ],
    },
]

