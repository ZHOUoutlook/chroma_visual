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

## 启动后端

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy ..\.env.example ..\.env
uvicorn app.main:app --host 0.0.0.0 --port 8010 --reload
```

后端默认连接：

```python
chromadb.HttpClient(host="localhost", port=8000)
```

如果 Chroma 不可用，后端会返回内置示例数据，方便先验证页面。

## 启动前端

```powershell
cd frontend
npm install
npm run dev
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
