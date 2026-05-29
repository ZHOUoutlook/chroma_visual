# 知识库与向量数据库可视化计划

## 1. 项目目标

本项目计划建设两个相互独立、又可以联动的可视化模块：

1. 知识库可视化
   - 关注文档从上传、OCR 解析、结构化解析、Chunk 切分、Embedding 到入库的全过程。
   - 重点展示 MinerU OCR 文档解析结果、文档结构、页面区域、文本块、表格、公式、图片与 Chunk 对应关系。

2. 向量数据库可视化
   - 关注 Chroma 向量数据库中的数据内容、向量分布和查询过程。
   - 重点展示 Collection 内容、Embedding 降维后的 3D 点云、查询向量、Top-K 命中结果和相似度关系。

最终目标是让用户能够直观看到：

- 知识库是如何从原始文档构建出来的。
- 每个知识片段来自哪里、如何切分、如何入库。
- 向量数据库中存储了哪些内容。
- 查询时命中了哪些 Chunk，以及这些结果在向量空间中的关系。

## 2. 可视化一：知识库可视化

### 2.1 文档总览

展示知识库中的文档列表和处理状态。

主要字段：

- 文档 ID
- 文件名
- 文件类型
- 页数
- 上传时间
- OCR 解析状态
- Chunk 切分状态
- Embedding 状态
- 入库状态
- 错误信息

交互能力：

- 按状态筛选文档。
- 点击文档进入解析详情页。
- 查看文档处理流水线状态。

### 2.2 MinerU OCR 文档解析可视化

展示 MinerU OCR 对 PDF、图片等文档的解析结果。

主要内容：

- 页面缩略图或原始页面预览。
- OCR 文本块位置标注。
- 标题、正文、表格、图片、公式等区域分类。
- 每个区域的 bounding box。
- 每个文本块的识别内容。
- 页面级解析结果 JSON。

建议布局：

- 左侧：文档页面缩略图列表。
- 中间：当前页面预览，叠加 OCR 区域框。
- 右侧：当前选中区域的详细信息，包括类型、文本、坐标、置信度、来源页码。

交互能力：

- 点击页面区域，高亮对应 OCR 文本。
- 点击文本块，定位到页面中的区域框。
- 显示或隐藏不同类型区域，例如标题、段落、表格、公式、图片。
- 对异常区域进行标记。

### 2.3 文档结构树可视化

将解析后的文档展示为结构树。

结构示例：

```text
文档
  -> 章节
  -> 小节
  -> 段落
  -> 表格
  -> 图片
  -> 公式
```

主要能力：

- 展示文档层级结构。
- 点击节点定位到原始页面。
- 点击节点查看对应文本、页码和 metadata。
- 支持章节级别折叠和展开。

### 2.4 Chunk 切分可视化

展示文档内容如何被切分为向量化 Chunk。

主要字段：

- Chunk ID
- Chunk 文本
- 所属文档
- 所属页码
- 所属章节
- Token 数量
- Overlap 范围
- Metadata
- 是否已生成 Embedding
- 是否已写入 Chroma

交互能力：

- 查看 Chunk 与原文页面区域的对应关系。
- 高亮相邻 Chunk 的 overlap 内容。
- 按文档、页码、章节筛选 Chunk。
- 点击 Chunk 定位到原始文档区域。

### 2.5 知识库构建流水线可视化

用流程图展示文档处理链路。

流程：

```text
上传文档
  -> MinerU OCR
  -> 结构化解析
  -> 文本清洗
  -> Chunk 切分
  -> Embedding
  -> 写入 Chroma
```

主要能力：

- 展示每一步处理状态。
- 展示每一步耗时。
- 展示失败原因。
- 支持重新执行某个处理步骤。

## 3. 可视化二：向量数据库可视化

### 3.1 Chroma Collection 总览

展示 Chroma 数据库中的 Collection 信息。

主要字段：

- Collection 名称
- 文档数量
- Embedding 数量
- Embedding 维度
- Metadata 字段
- 创建时间
- 更新时间

交互能力：

- 切换 Collection。
- 查看 Collection 统计信息。
- 查看数据来源文档分布。

### 3.2 Chroma 数据内容可视化

展示 Chroma 中的 records。

主要字段：

- ID
- Document 文本
- Metadata
- Embedding 摘要
- 来源文档
- 页码
- Chunk ID

建议布局：

- 上方：Collection 选择器和筛选条件。
- 左侧：记录列表。
- 右侧：选中记录详情。

交互能力：

- 按 metadata 过滤。
- 按来源文档过滤。
- 按关键词搜索 document 文本。
- 点击记录后联动到 3D 向量空间中的点。

### 3.3 向量降维 3D 展示

将高维 Embedding 降维到 3D 空间进行展示。

推荐降维方式：

- MVP 阶段：PCA。
- 增强阶段：UMAP。
- 对比分析阶段：t-SNE。

展示方式：

- 每个点代表一个 Chunk。
- 点颜色代表来源文档、分类或 metadata。
- 点大小可以代表文本长度、相似度或权重。
- 鼠标悬停显示简要信息。
- 点击点显示完整 Chunk 文本和 metadata。

交互能力：

- 旋转、缩放、平移 3D 空间。
- 按文档、类别、页码过滤点。
- 框选或圈选点集合。
- 点击点联动显示原始文档位置。

### 3.4 查询可视化

展示用户查询从输入到向量检索的全过程。

流程：

```text
输入 Query
  -> 生成 Query Embedding
  -> Chroma 相似度检索
  -> 返回 Top-K Chunk
  -> 3D 空间高亮 Query 与命中结果
  -> 展示相似度和来源信息
```

主要能力：

- 输入 query 文本。
- 设置 top-k。
- 设置 metadata filter。
- 在 3D 空间中显示 query 点。
- 高亮 top-k 命中 Chunk。
- 使用线条连接 query 点与命中点。
- 展示 similarity score 或 distance。
- 展示命中 Chunk 的来源文档、页码和原文内容。

### 3.5 查询解释面板

展示检索结果的解释信息。

主要内容：

- Query 原文。
- Top-K 结果列表。
- 每条结果的相似度。
- 每条结果的来源文档。
- 每条结果的页码和 Chunk ID。
- Metadata filter 是否生效。
- 命中 Chunk 在原始文档中的位置。

交互能力：

- 点击结果定位到 3D 点。
- 点击结果定位到知识库解析页面。
- 对比多个查询的结果差异。

## 4. 建议页面结构

建议使用 Web 应用形式，左侧导航如下：

1. 知识库总览
2. 文档解析可视化
3. 文档结构树
4. Chunk 切分可视化
5. Chroma Collection 总览
6. Chroma 数据内容
7. 3D 向量空间
8. 查询可视化

## 5. 推荐技术方案

### 5.1 前端

推荐技术：

- React
- Vite
- TypeScript
- Three.js 或 React Three Fiber
- ECharts / AntV / Recharts
- Ant Design / shadcn/ui

前端重点：

- 3D 点云展示。
- OCR 页面区域叠加。
- 文档结构树。
- 查询结果联动。
- 多面板布局。

### 5.2 后端

推荐技术：

- Python
- FastAPI
- ChromaDB
- MinerU 解析结果读取
- scikit-learn PCA
- UMAP 可选
- Embedding 模型接口

后端重点：

- 读取 Chroma Collection。
- 提供 documents、metadata、embeddings 查询接口。
- 对 Embedding 做降维。
- 提供 query 检索接口。
- 读取 MinerU OCR 输出 JSON。
- 提供文档、页面、OCR block、Chunk 的关联接口。

### 5.3 外部服务配置

#### Chroma 配置

当前向量数据库计划连接本地 Chroma HTTP 服务：

```python
chroma_client = chromadb.HttpClient(host="localhost", port=8000)
```

建议后端配置项：

```text
CHROMA_HOST=localhost
CHROMA_PORT=8000
```

后端初始化示例：

```python
import os
import chromadb

chroma_client = chromadb.HttpClient(
    host=os.getenv("CHROMA_HOST", "localhost"),
    port=int(os.getenv("CHROMA_PORT", "8000")),
)
```

#### MinerU API 配置

MinerU API key 应通过环境变量读取，不写入代码仓库或文档。

建议后端配置项：

```text
MINERU_API_KEY=your_mineru_api_key
```

建议在项目中提供 `.env.example`：

```text
CHROMA_HOST=localhost
CHROMA_PORT=8000
MINERU_API_KEY=
```

安全要求：

- 真实 API key 只放在本地 `.env` 或部署环境变量中。
- `.env` 需要加入 `.gitignore`。
- 如果 API key 曾经出现在聊天、日志、截图或代码仓库中，建议立即轮换。

### 5.4 3D 可视化

推荐实现：

- 前端使用 Three.js / React Three Fiber 渲染 3D 点云。
- 后端负责高维向量降维到 3D。
- 点云数据格式包含 id、x、y、z、metadata、document 摘要。

数据结构示例：

```json
{
  "id": "chunk_001",
  "x": 0.12,
  "y": -0.45,
  "z": 0.78,
  "document": "示例文本...",
  "metadata": {
    "source": "demo.pdf",
    "page": 3,
    "chunk_id": "chunk_001"
  }
}
```

## 6. 数据流设计

整体数据流：

```text
原始文档
  -> MinerU OCR 输出结构化结果
  -> 文档结构解析
  -> 文本清洗
  -> Chunk 切分
  -> Embedding 生成
  -> 写入 Chroma
  -> Collection 内容读取
  -> Embedding 降维
  -> 3D 可视化
  -> Query 检索可视化
```

核心数据关系：

```text
Document
  -> Page
  -> OCR Block
  -> Chunk
  -> Embedding
  -> Chroma Record
```

## 7. API 初步规划

### 7.1 知识库相关接口

```text
GET /api/documents
GET /api/documents/{document_id}
GET /api/documents/{document_id}/pages
GET /api/documents/{document_id}/pages/{page_no}/ocr-blocks
GET /api/documents/{document_id}/structure
GET /api/documents/{document_id}/chunks
GET /api/chunks/{chunk_id}
```

### 7.2 Chroma 相关接口

```text
GET /api/chroma/collections
GET /api/chroma/collections/{collection_name}/stats
GET /api/chroma/collections/{collection_name}/records
GET /api/chroma/collections/{collection_name}/embeddings/3d
POST /api/chroma/collections/{collection_name}/query
```

### 7.3 查询可视化接口

```text
POST /api/query
```

请求示例：

```json
{
  "collection": "knowledge_base",
  "query": "什么是向量数据库？",
  "top_k": 5,
  "where": {
    "source": "demo.pdf"
  }
}
```

响应示例：

```json
{
  "query": "什么是向量数据库？",
  "query_point": {
    "x": 0.1,
    "y": 0.2,
    "z": 0.3
  },
  "results": [
    {
      "id": "chunk_001",
      "score": 0.92,
      "document": "向量数据库是一种...",
      "metadata": {
        "source": "demo.pdf",
        "page": 1
      },
      "point": {
        "x": 0.12,
        "y": 0.19,
        "z": 0.29
      }
    }
  ]
}
```

## 8. MVP 实施顺序

### 阶段一：Chroma 内容可视化

目标：先把向量数据库中的内容读出来并展示。

任务：

1. 搭建 FastAPI 后端。
2. 连接本地 Chroma 数据库。
3. 实现 Collection 列表接口。
4. 实现 Collection records 查询接口。
5. 前端展示 Collection 和 records。

验收标准：

- 能看到 Chroma 中有哪些 Collection。
- 能看到某个 Collection 中的 documents、metadata 和 ids。

### 阶段二：3D 向量空间可视化

目标：把 Embedding 降维后用 3D 点云展示。

任务：

1. 后端读取 embeddings。
2. 使用 PCA 将 embeddings 降到 3D。
3. 前端使用 Three.js / React Three Fiber 展示点云。
4. 支持鼠标 hover 和点击点查看详情。
5. 支持按来源文档或 metadata 着色。

验收标准：

- 能看到 Collection 的 3D 向量点云。
- 点击点可以看到对应 Chunk 文本和 metadata。

### 阶段三：查询可视化

目标：展示查询向量和 Top-K 命中结果。

任务：

1. 实现 query 接口。
2. 生成 query embedding。
3. 调用 Chroma 查询 Top-K。
4. 将 query 点和命中结果映射到 3D 空间。
5. 前端高亮 query 点与命中点。
6. 展示结果列表、相似度和来源信息。

验收标准：

- 输入 query 后可以看到 Top-K 结果。
- 3D 空间中能高亮查询点和命中点。
- 结果列表能联动到 3D 点和原始 Chunk。

### 阶段四：MinerU OCR 解析可视化

目标：展示文档解析过程和 OCR 区域。

任务：

1. 读取 MinerU 输出 JSON。
2. 建立 document、page、ocr block 数据结构。
3. 前端展示页面预览。
4. 在页面上叠加 OCR bounding box。
5. 右侧展示选中 block 的文本、类型和 metadata。

验收标准：

- 能按页查看 OCR 解析结果。
- 页面区域与 OCR 文本可以互相定位。

### 阶段五：Chunk 与原文联动

目标：打通知识库可视化和向量数据库可视化。

任务：

1. 建立 Chunk 与 OCR block / page 的映射关系。
2. 在 Chunk 页面展示来源文档和页面位置。
3. 从 Chroma record 跳转到知识库文档区域。
4. 从 OCR 文档区域查看对应 Chunk。

验收标准：

- 点击 Chroma 中的记录，可以定位到原文页面。
- 点击原文区域，可以看到对应 Chunk 和向量记录。

## 9. 后续增强方向

1. 支持多种降维算法对比。
2. 支持查询历史对比。
3. 支持语义簇自动聚类。
4. 支持异常向量检测。
5. 支持重复 Chunk 检测。
6. 支持低质量 OCR 区域标记。
7. 支持重新解析、重新切分、重新入库。
8. 支持 RAG 回答过程可视化。
9. 支持多 Collection 对比。
10. 支持导出可视化报告。

## 10. 推荐优先级

建议优先完成：

1. Chroma Collection 与 records 展示。
2. Embedding PCA 3D 点云展示。
3. Query Top-K 查询可视化。
4. MinerU OCR 页面解析展示。
5. Chunk 与原文位置联动。

这样可以先让向量数据库可视化跑通，再逐步补齐知识库构建过程的可解释性。
