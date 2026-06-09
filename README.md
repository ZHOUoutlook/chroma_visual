# 知识库与向量数据库可视化

这是一个按照 `PLAN.md` 搭建的 MVP，可视化内容包括：

- 知识库文档总览
- MinerU OCR 解析结果可视化
- 上传文档并生成解析预览
- Chunk 切分与原文联动
- Chroma Collection 与 Records 展示
- Embedding 3D 点云
- Query Top-K 检索可视化

## 目录结构

```text
backend/   FastAPI 后端
frontend/  React + Three.js 前端
data/      示例 MinerU 解析数据
```

## 接口调用策略

项目采用按需加载，减少不必要的接口请求：

| 页面 | 调用的接口 |
|------|-----------|
| 知识库总览 | `/api/chroma/collections` + `/api/documents` + `/api/chroma/status` |
| OCR 解析 | `/api/documents/{id}/native`（含 pages） |
| Chunk 切分 | `/api/documents/{id}/chunks` + `/api/chroma/.../embedded-chunks/{id}` |
| Chroma 内容 / 3D 空间 / 查询 | 启动时后台静默预取 records + 3D embeddings，切换页面不重复请求 |
| Embedding | `POST /api/documents/{id}/embedding` → 完成后刷新 embedded-chunks + 后台刷新 records/3D |

## 运行前的配置说明
执行指令，将初始化配置
```powershell
copy ..\.env.example ..\.env
```
随后按下面配置.env文件
### 嵌入模型配置

嵌入服务仅支持 API 方式（不再使用本地 SentenceTransformer）：

`.env` 配置：
```text
EMBEDDING_API_BASE_URL=http://your-embedding-service:port
EMBEDDING_API_KEY=sk-your-key
EMBEDDING_MODEL=your-model-name
```

### MinerU API 配置

MinerU 用于 PDF OCR 解析，需要在 `.env` 中配置 API Key：

```text
MINERU_API_KEY=your_key
MINERU_API_BASE_URL=https://mineru.net
MINERU_POLL_TIMEOUT_SECONDS=90
MINERU_POLL_INTERVAL_SECONDS=3
```

## Chroma 向量数据库

### 客户端模式（默认）

不配置 `CHROMA_HOST` 和 `CHROMA_PORT` 时，后端自动使用客户端模式，数据默认存储在 `./chroma_db`：

```text
# .env 中无需配置 CHROMA_HOST / CHROMA_PORT
CHROMA_DB_PATH=./chroma_db
```

### 服务器模式

配置 `CHROMA_HOST` 和 `CHROMA_PORT` 后，后端通过 HTTP 连接 chroma 服务：

```text
# .env
CHROMA_HOST=localhost
CHROMA_PORT=1212
```

启动 chroma 服务：

```powershell
pip install chromadb
chroma run --path E:\大模型\v_db --port 1212
```

### ⚠️ 关闭 chroma 服务的正确方式

**直接关闭终端窗口会导致 HNSW 索引损坏，数据无法恢复。** 必须优雅关闭：

**方式一（推荐）：** 另开终端执行 curl 命令关闭：

```powershell
curl.exe -X POST http://localhost:1212/api/v2/pre-flight-checks
```

**方式二：** 在运行 chroma 的终端按 `Ctrl+C`，等待打印 `shutdown complete` 后再关窗口

### ⚠️ 不要混用客户端模式和服务器模式

两种模式指向同一个数据目录会导致 HNSW 索引损坏。选定一种模式后不要切换，数据目录只让一个进程独占访问。

## 启动后端

```powershell
.\scripts\start-backend.ps1
```

如果 Chroma 不可用，后端会返回内置示例数据，方便先验证页面。

## 启动前端

```powershell
.\scripts\start-frontend.ps1
```

默认访问：
```text
http://localhost:5173
```

## 配置说明

真实 MinerU API key 请放在 `.env` 中，不要提交到仓库：

```text
MINERU_API_KEY=your_key
```

MinerU 本地解析 JSON 可放在：

```text
data/mineru/
```

上传文件默认保存到：

```text
data/uploads/
```

前端会通过 `http://localhost:8010` 调用后端接口，并在顶部显示 API 与 Chroma 的连接状态。
