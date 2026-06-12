import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Html, Line } from "@react-three/drei";
import * as pdfjsLib from "pdfjs-dist";
import {
  Boxes,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Database,
  FileText,
  GitBranch,
  Layers3,
  Loader2,
  RefreshCw,
  Wrench,
  Search,
  Trash2,
  UploadCloud,
  XCircle,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import "./styles.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8010";
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).toString();

const fallbackCollections: Collection[] = [
  { name: "sample_knowledge_base", count: 5, metadata: { mode: "sample" }, source: "frontend-sample" },
];

const fallbackRecords: RecordItem[] = [
  {
    id: "chunk_001",
    document: "向量数据库用于存储 embedding，并支持相似度检索。",
    metadata: { source: "vector-db-demo.pdf", page: 1, chunk_id: "chunk_001" },
    embedding: [0.12, 0.31, 0.88, 0.44, 0.19, 0.52],
  },
  {
    id: "chunk_002",
    document: "Chroma 适合本地 RAG 原型和知识库检索。",
    metadata: { source: "vector-db-demo.pdf", page: 2, chunk_id: "chunk_002" },
    embedding: [0.18, 0.28, 0.79, 0.55, 0.26, 0.49],
  },
  {
    id: "chunk_003",
    document: "MinerU OCR 可以把 PDF 页面解析为文本块、标题、表格、公式和图片区域。",
    metadata: { source: "mineru-demo.pdf", page: 1, chunk_id: "chunk_003" },
    embedding: [0.75, 0.11, 0.24, 0.62, 0.71, 0.35],
  },
  {
    id: "chunk_004",
    document: "Chunk 切分需要保留来源文档、页码、章节和 overlap 信息。",
    metadata: { source: "mineru-demo.pdf", page: 2, chunk_id: "chunk_004" },
    embedding: [0.69, 0.18, 0.31, 0.57, 0.66, 0.41],
  },
  {
    id: "chunk_005",
    document: "查询可视化会展示 query embedding、Top-K 命中结果和向量空间距离。",
    metadata: { source: "query-demo.pdf", page: 1, chunk_id: "chunk_005" },
    embedding: [0.22, 0.82, 0.35, 0.14, 0.47, 0.91],
  },
];

const fallbackPoints: Point3D[] = [
  { id: "chunk_001", x: -0.7, y: -0.1, z: 0.25, document: fallbackRecords[0].document, metadata: fallbackRecords[0].metadata },
  { id: "chunk_002", x: -0.55, y: 0.2, z: 0.1, document: fallbackRecords[1].document, metadata: fallbackRecords[1].metadata },
  { id: "chunk_003", x: 0.35, y: -0.45, z: -0.15, document: fallbackRecords[2].document, metadata: fallbackRecords[2].metadata },
  { id: "chunk_004", x: 0.52, y: -0.25, z: 0.08, document: fallbackRecords[3].document, metadata: fallbackRecords[3].metadata },
  { id: "chunk_005", x: 0.12, y: 0.72, z: -0.28, document: fallbackRecords[4].document, metadata: fallbackRecords[4].metadata },
];

const fallbackDocuments: DocumentItem[] = [
  {
    id: "mineru-demo",
    file_name: "mineru-demo.pdf",
    file_type: "pdf",
    pages: 2,
    ocr_status: "done",
    chunk_status: "done",
    embedding_status: "done",
    ingest_status: "done",
  },
];

const fallbackPages: OcrPage[] = [
  {
    page_no: 1,
    width: 900,
    height: 1200,
    blocks: [
      { id: "block_001", type: "text", text: "示例学报 · 2024 年第 3 期 · DOI: 10.1234/demo.2024.03", bbox: [90, 50, 760, 90], confidence: 0.96, chunk_ids: [] },
      { id: "block_002", type: "title", text: "MinerU OCR 文档解析与可视化", bbox: [90, 100, 700, 150], confidence: 0.98, chunk_ids: ["chunk_003"] },
      { id: "block_003", type: "title", text: "面向知识库构建的结构化解析方案", bbox: [90, 160, 720, 200], confidence: 0.97, chunk_ids: ["chunk_003"] },
      { id: "block_004", type: "text", text: "知识库可视化项目组", bbox: [90, 210, 400, 240], confidence: 0.95, chunk_ids: [] },
      { id: "block_005", type: "paragraph", text: "内容提要：页面会被解析为标题、段落、表格、公式和图片区域，并支持在 PDF 与 Markdown 之间双向定位。", bbox: [90, 260, 760, 340], confidence: 0.94, chunk_ids: ["chunk_003"] },
      { id: "block_006", type: "paragraph", text: "关键词：MinerU；OCR；知识库；向量检索", bbox: [90, 350, 600, 380], confidence: 0.93, chunk_ids: [] },
      { id: "block_007", type: "table", text: "类型 | 数量 | 状态\n标题 | 12 | 完成\n段落 | 48 | 完成", bbox: [90, 400, 800, 560], confidence: 0.91, chunk_ids: [] },
    ],
  },
  {
    page_no: 2,
    width: 900,
    height: 1200,
    blocks: [
      { id: "block_008", type: "title", text: "Chunk 切分与追溯", bbox: [90, 90, 650, 150], confidence: 0.97, chunk_ids: ["chunk_004"] },
      { id: "block_009", type: "paragraph", text: "每个 Chunk 都应保留来源文档、页码、章节和 OCR 区域映射，以便在向量检索时回溯原文。", bbox: [90, 200, 790, 340], confidence: 0.95, chunk_ids: ["chunk_004"] },
      { id: "block_010", type: "paragraph", text: "Abstract: This demo shows how parsed blocks map to markdown sections and remain traceable during retrieval.", bbox: [90, 360, 790, 420], confidence: 0.92, chunk_ids: [] },
    ],
  },
];

const fallbackChunks: Chunk[] = fallbackRecords.slice(2, 4).map((record) => ({
  id: record.id,
  text: record.document,
  metadata: record.metadata,
  token_count: record.document.length,
  collections: ["sample_knowledge_base"],
}));

type Collection = {
  name: string;
  display_name?: string;
  count: number;
  metadata: Record<string, unknown>;
  source: string;
};

type RecordItem = {
  id: string;
  document: string;
  metadata: Record<string, unknown>;
  embedding?: number[];
};

type Point3D = {
  id: string;
  x: number;
  y: number;
  z: number;
  document: string;
  metadata: Record<string, unknown>;
  score?: number | null;
};

type DocumentItem = {
  id: string;
  file_name: string;
  file_type: string;
  file_url?: string;
  pages: number;
  ocr_status: string;
  chunk_status: string;
  embedding_status: string;
  ingest_status: string;
};

type OcrBlock = {
  id: string;
  type: string;
  text: string;
  bbox: number[];
  confidence?: number | null;
  chunk_ids: string[];
  raw?: Record<string, unknown>;
};

type OcrPage = {
  page_no: number;
  width: number;
  height: number;
  file_url?: string;
  image_url?: string;
  blocks: OcrBlock[];
};

type PageRenderMetrics = {
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  pdfWidth?: number;
  pdfHeight?: number;
  pdfScale?: number;
  offsetX?: number;
  offsetY?: number;
};

type Chunk = {
  id: string;
  text: string;
  metadata: Record<string, unknown>;
  token_count: number;
  collections?: string[];
};

type QueryResult = {
  query: string;
  query_point: { x: number; y: number; z: number };
  results: Point3D[];
};

type ChromaStatus = {
  connected: boolean;
  host: string;
  port: number;
  collection_count?: number;
  message: string;
};

type UploadResponse = {
  document: DocumentItem;
  pages: OcrPage[];
  chunks: Chunk[];
  parse_mode: string;
  mineru_api_configured: boolean;
  message: string;
};

type UploadStepStatus = "pending" | "running" | "done" | "error";

type UploadStep = {
  key: string;
  label: string;
  detail: string;
  status: UploadStepStatus;
};

const initialUploadSteps: UploadStep[] = [
  { key: "save", label: "保存原始文件", detail: "等待上传", status: "pending" },
  { key: "submit", label: "提交 MinerU OCR 任务", detail: "等待 API 调用", status: "pending" },
  { key: "upload", label: "上传文件到 MinerU", detail: "等待上传 URL", status: "pending" },
  { key: "poll", label: "轮询解析结果", detail: "等待解析完成", status: "pending" },
  { key: "visualize", label: "生成可视化数据", detail: "等待 OCR blocks 和 chunks", status: "pending" },
];

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: isFormData ? undefined : { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    let detail = "";
    try {
      const payload = await response.json();
      detail = typeof payload.detail === "string" ? payload.detail : JSON.stringify(payload.detail ?? payload);
    } catch {
      detail = await response.text();
    }
    throw new Error(`${response.status} ${response.statusText}${detail ? `：${detail}` : ""}`);
  }
  return response.json();
}


// ── SWR 轻量缓存 hook：stale-while-revalidate ──
const SWR_TTL_MS = 30_000; // 缓存 30 秒后自动 revalidate
const swrCache = new Map<string, { data: any; promise: Promise<any> | null; ts: number }>();

function useSWR<T>(key: string | null, fetcher: () => Promise<T>, fallback: T) {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [revalidating, setRevalidating] = useState(false);
  const [data, setData] = useState<T>(() => {
    const entry = key ? swrCache.get(key) : undefined;
    return (entry?.data as T) ?? fallback;
  });

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const entry = swrCache.get(key);

    // 检查 TTL：过期则视为 miss，强制重新 fetch
    const expired = entry?.ts !== undefined && (Date.now() - entry.ts > SWR_TTL_MS);
    const hasFreshData = entry?.data !== undefined && !expired;

    if (hasFreshData) {
      console.log("[SWR] cache hit, instant render:", key, "records:", (entry.data as any)?.length);
      setData(entry.data as T);
    } else {
      console.log("[SWR] cache miss" + (expired ? " (expired)" : "") + ", will fetch:", key);
    }

    // 去重：复用进行中的请求
    if (entry?.promise) {
      console.log("[SWR] dedup: reusing in-flight promise for:", key);
      setRevalidating(true);
      entry.promise.then((fresh) => { if (!cancelled) { setData(fresh as T); setRevalidating(false); } });
      return;
    }

    setRevalidating(true);
    const promise = fetcherRef.current()
      .then((fresh) => {
        console.log("[SWR] fetch done, cached:", key, "records:", (fresh as any)?.length);
        swrCache.set(key, { data: fresh, promise: null, ts: Date.now() });
        if (!cancelled) { setData(fresh); setRevalidating(false); }
        return fresh;
      })
      .catch(() => {
        swrCache.set(key, { data: entry?.data ?? fallback, promise: null, ts: entry?.ts ?? 0 });
        if (!cancelled) {
          if (entry?.data === undefined) setData(fallback);
          setRevalidating(false);
        }
      });

    swrCache.set(key, { data: entry?.data ?? fallback, promise, ts: entry?.ts ?? 0 });
    return () => { cancelled = true; };
  }, [key]);

  const mutate = useCallback(async () => {
    if (!key) return;
    console.log("[SWR] mutate: clearing cache for:", key);
    swrCache.delete(key);
    setRevalidating(true);
    try {
      const fresh = await fetcherRef.current();
      swrCache.set(key, { data: fresh, promise: null, ts: Date.now() });
      setData(fresh);
    } catch { /* 刷新失败保留旧数据 */ }
    finally { setRevalidating(false); }
  }, [key]);

  return { data, loading: !key || !swrCache.has(key), revalidating, mutate } as { data: T; loading: boolean; revalidating: boolean; mutate: () => Promise<void> };
}
function App() {
  const [activeView, setActiveView] = useState("overview");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState("");


  // records：仅 Chroma 内容页面加载
  const recordsKey = useMemo(() => {
    if (!selectedCollection) return null;
    if (activeView === "chroma") return "records:" + selectedCollection;
    return null;
  }, [selectedCollection, activeView]);

  // embeddings/3d：仅 3D 向量空间 / 查询可视化页面加载
  const pointsKey = useMemo(() => {
    if (!selectedCollection) return null;
    if (activeView === "space" || activeView === "query") return "points:" + selectedCollection;
    return null;
  }, [selectedCollection, activeView]);

  const { data: records = fallbackRecords, mutate: mutateRecords } = useSWR(recordsKey, () => api<RecordItem[]>(`/api/chroma/collections/${selectedCollection}/records`), fallbackRecords);
  const { data: points = fallbackPoints, mutate: mutatePoints } = useSWR(pointsKey, () => api<Point3D[]>(`/api/chroma/collections/${selectedCollection}/embeddings/3d`), fallbackPoints);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedDocument, setSelectedDocument] = useState("");
  const [pages, setPages] = useState<OcrPage[]>([]);
  const [nativeResult, setNativeResult] = useState<Record<string, unknown> | null>(null);
  const [selectedPageNo, setSelectedPageNo] = useState(1);
  const [selectedBlock, setSelectedBlock] = useState<OcrBlock | null>(null);
  const pendingChunkTargetRef = useRef<{ block?: OcrBlock; pageNo: number; deferScroll?: boolean; chunkId?: string; blkId?: string } | null>(null);
  const [pendingVersion, setPendingVersion] = useState(0);
  const [chunks, setChunks] = useState<Chunk[]>([]);

  const [selectedPoint, setSelectedPoint] = useState<Point3D | null>(null);

  // points 变化时自动选第一个（若当前选中点已不在列表中）
  useEffect(() => {
    if (points.length > 0) {
      const inList = selectedPoint && points.some((p) => p.id === selectedPoint.id);
      if (!inList) setSelectedPoint(points[0]);
    }
  }, [points]);
  const [query, setQuery] = useState("什么是向量数据库？");
  const [topK, setTopK] = useState(5);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [status, setStatus] = useState("正在加载数据");
  const [apiConnected, setApiConnected] = useState(false);
  const [chromaStatus, setChromaStatus] = useState<ChromaStatus | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSteps, setUploadSteps] = useState<UploadStep[]>(initialUploadSteps);
  const [uploadResultMessage, setUploadResultMessage] = useState("");
  const [selectedChunkIds, setSelectedChunkIds] = useState<Set<string>>(new Set());
  const [embeddingBusy, setEmbeddingBusy] = useState(false);
  const [embeddingMessage, setEmbeddingMessage] = useState("");

  // OCR 页面：加载 native；Chunk 页面：仅加载 chunks
  useEffect(() => {
    if (!selectedDocument) return;
    if (activeView === "ocr") {
      void loadDocument(selectedDocument);
    } else if (activeView === "chunks") {
      api<Chunk[]>(`/api/documents/${selectedDocument}/chunks`)
        .then((data) => setChunks(data))
        .catch(() => setChunks(fallbackChunks));
    }
  }, [activeView, selectedDocument]);

  // Derive embedded chunk IDs from chunk.collections field
  const embeddedChunkIds = useMemo(() => {
    if (!selectedCollection) return new Set<string>();
    return new Set(
      chunks.filter((c) => (c.collections || []).includes(selectedCollection)).map((c) => c.id)
    );
  }, [chunks, selectedCollection]);

  // 进入知识库总览时刷新列表
  useEffect(() => {
    if (activeView !== "overview") return;
    void loadInitialData();
  }, [activeView]);

  // 切换集合时仅刷新文档处理状态
  useEffect(() => {
    if (activeView !== "overview" || !apiConnected) return;
    api<DocumentItem[]>(`/api/documents?collection=${encodeURIComponent(selectedCollection)}`)
      .then((docs) => {
        setDocuments(docs);
        if (docs[0]) setSelectedDocument(docs[0].id);
      })
      .catch(() => {});
  }, [selectedCollection]);

  const selectedPage = useMemo(
    () => pages.find((page) => page.page_no === selectedPageNo) ?? pages[0],
    [pages, selectedPageNo],
  );

  const highlightedIds = useMemo(
    () => new Set(queryResult?.results.map((item) => item.id) ?? []),
    [queryResult],
  );

  async function loadInitialData() {
    try {
      const collectionList = await api<Collection[]>("/api/chroma/collections");
      const liveChromaStatus = await api<ChromaStatus>("/api/chroma/status");
      setCollections(collectionList);
      setApiConnected(true);
      setChromaStatus(liveChromaStatus);
      if (collectionList[0] && !selectedCollection) setSelectedCollection(collectionList[0].name);
      setStatus(liveChromaStatus.connected ? "后端和 Chroma 已连接" : liveChromaStatus.message);
    } catch (error) {
      setCollections(fallbackCollections);
      setDocuments(fallbackDocuments);
      setApiConnected(false);
      setChromaStatus(null);
      setSelectedCollection(fallbackCollections[0].name);
      setSelectedDocument(fallbackDocuments[0].id);
      setStatus(`后端未连接，正在使用前端示例数据：${String(error)}`);
    }
  }

  async function loadDocument(documentId: string) {
    try {
      const native = await api<any>(`/api/documents/${documentId}/native`);
      const fallbackFileUrl: string = (native.document && native.document.file_url) || native.file_url || "";
      const pageList: OcrPage[] = (native.pages || []).map((p: any) => ({
        ...p,
        file_url: p.file_url || fallbackFileUrl,
      }));
      setPages(pageList);
      setNativeResult(native);
      // 若有 pending chunk target（从 chunk 页面跳转过来），不覆盖已设置的页码和 block
      if (!pendingChunkTargetRef.current) {
        setSelectedPageNo(pageList[0]?.page_no ?? 1);
        setSelectedBlock(pageList[0]?.blocks[0] ?? null);
      }
    } catch (error) {
      setPages(fallbackPages);
      setChunks(fallbackChunks);
      setNativeResult(null);
      setSelectedPageNo(fallbackPages[0].page_no);
      setSelectedBlock(fallbackPages[0].blocks[0]);
      setStatus(`文档接口不可用，正在使用示例 OCR 数据：${String(error)}`);
    }
  }

  async function runQuery() {
    if (!selectedCollection || !query.trim()) return;
    try {
      const result = await api<QueryResult>("/api/query", {
        method: "POST",
        body: JSON.stringify({
          collection: selectedCollection,
          query,
          top_k: topK,
        }),
      });
      setQueryResult(result);
      setSelectedPoint(result.results[0] ?? null);
      setActiveView("query");
    } catch (error) {
      const results = fallbackPoints.slice(0, topK).map((point, index) => ({
        ...point,
        score: Math.max(0.25, 0.92 - index * 0.1),
      }));
      const result = {
        query,
        query_point: { x: -0.2, y: 0.18, z: 0.05 },
        results,
      };
      setQueryResult(result);
      setSelectedPoint(results[0] ?? null);
      setActiveView("query");
      setStatus(`查询接口不可用，正在使用示例结果：${String(error)}`);
    }
  }

  async function handleDeleteRecord(recordId: string) {
    if (!selectedCollection) return;
    await api(`/api/chroma/collections/${selectedCollection}/records`, {
      method: "DELETE",
      body: JSON.stringify({ ids: [recordId] }),
    });
    await mutateRecords();
    await mutatePoints();
  }


  async function handleRepairData() {
    setStatus("正在修复 collections 数据...");
    try {
      const result = await api<any>("/api/admin/repair-collections", { method: "POST" });
      setStatus(result.message || "修复完成");
      await loadInitialData();
    } catch (error) {
      setStatus(`修复失败：${String(error)}`);
    }
  }
  async function handleClearCollection() {
    if (!selectedCollection) return;
    await api(`/api/chroma/collections/${selectedCollection}/clear`, { method: "DELETE" });
    await mutateRecords();
    await mutatePoints();
    await loadInitialData();
  }
  async function handleCreateCollection(name: string) {
    if (!name.trim()) return;
    await api("/api/chroma/collections", {
      method: "POST",
      body: JSON.stringify({ name: name.trim() }),
    });
    setStatus(`Collection "${name.trim()}" 已创建`);
    await loadInitialData();
  }

  async function handleDeleteCollection(name: string) {
    if (!name) return;
    await api(`/api/chroma/collections/${name}`, { method: "DELETE" });
    setStatus(`Collection "${name}" 已删除`);
    await loadInitialData();
  }

  async function uploadDocument(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    setUploading(true);
    setUploadResultMessage("");
    setUploadSteps(markUploadStep(initialUploadSteps, "save", "running", "正在发送到后端"));
    setStatus(`正在上传并解析 ${file.name}`);
    const timers = [
      window.setTimeout(() => setUploadSteps((steps) => markUploadStep(steps, "save", "done", "原始文件已提交到后端")), 500),
      window.setTimeout(() => setUploadSteps((steps) => markUploadStep(steps, "submit", "running", "正在申请 MinerU 上传任务")), 900),
      window.setTimeout(() => setUploadSteps((steps) => markUploadStep(steps, "upload", "running", "正在上传文件到 MinerU 临时地址")), 1800),
      window.setTimeout(() => setUploadSteps((steps) => markUploadStep(steps, "poll", "running", "正在等待 OCR 解析结果")), 3000),
      window.setTimeout(() => setUploadSteps((steps) => markUploadStep(steps, "poll", "running", "MinerU 解析中，继续轮询")), 6500),
    ];
    try {
      const result = await api<UploadResponse>("/api/documents/upload", {
        method: "POST",
        body: formData,
      });
      timers.forEach(window.clearTimeout);
      setDocuments((items) => [result.document, ...items.filter((item) => item.id !== result.document.id)]);
      setSelectedDocument(result.document.id);
      setPages(result.pages);
      setChunks(result.chunks);
      setNativeResult(result as unknown as Record<string, unknown>);
      setSelectedPageNo(result.pages[0]?.page_no ?? 1);
      setSelectedBlock(result.pages[0]?.blocks[0] ?? null);
      setApiConnected(true);
      setStatus(result.message);
      setUploadResultMessage(result.message);
      setUploadSteps((steps) =>
        completeUploadSteps(
          steps,
          result.parse_mode === "mineru-api"
            ? "MinerU OCR API 已返回解析结果"
            : "MinerU API 失败，已使用本地预览结果",
          result.parse_mode === "mineru-api",
        ),
      );
      setActiveView("ocr");
    } catch (error) {
      timers.forEach(window.clearTimeout);
      setUploadSteps((steps) => failRunningUploadStep(steps, String(error)));
      setUploadResultMessage(`上传解析失败：${String(error)}`);
      setStatus(`上传解析失败：${String(error)}`);
    } finally {
      setUploading(false);
    }
  }

  function handleToggleChunk(id: string) {
    setSelectedChunkIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSelectAllChunks() {
    setSelectedChunkIds(new Set(chunks.filter((c) => !embeddedChunkIds.has(c.id)).map((c) => c.id)));
  }

  function handleDeselectAllChunks() {
    setSelectedChunkIds(new Set());
  }

  async function handleEmbedChunks() {
    if (!selectedDocument || selectedChunkIds.size === 0) return;
    setEmbeddingBusy(true);
    setEmbeddingMessage("");
    try {
      const result = await api<{ embedded: number; sentences: number; skipped: number; not_found: number; total: number }>(
        `/api/documents/${selectedDocument}/embedding`,
        {
          method: "POST",
          body: JSON.stringify({ chunk_ids: [...selectedChunkIds], collection: selectedCollection }),
        },
      );
      setEmbeddingMessage(
        `已处理 ${result.embedded} 个 chunk，生成 ${result.sentences} 个句子向量，跳过 ${result.skipped} 个${result.not_found > 0 ? `，未找到 ${result.not_found} 个` : ""}`,
      );
      setSelectedChunkIds(new Set());
      // 刷新 chunk 列表，获取最新的 collections 字段
      api<Chunk[]>('/api/documents/' + selectedDocument + '/chunks')
        .then((data) => setChunks(data))
        .catch(() => {});
      // 后台静默刷新 Chroma records 和 3D embeddings
      void mutateRecords();
      void mutatePoints();
    } catch (error) {
      setEmbeddingMessage(`嵌入失败：${String(error)}`);
    } finally {
      setEmbeddingBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Layers3 size={24} />
          <div>
            <strong>知识库可视化</strong>
            <span>Chroma + MinerU</span>
          </div>
        </div>
        <NavButton icon={<FileText size={18} />} label="知识库总览" value="overview" active={activeView} onClick={setActiveView} />
        <NavButton icon={<UploadCloud size={18} />} label="上传解析" value="upload" active={activeView} onClick={setActiveView} />
        <NavButton icon={<Boxes size={18} />} label="OCR 解析" value="ocr" active={activeView} onClick={setActiveView} />
        <NavButton icon={<GitBranch size={18} />} label="Chunk 切分" value="chunks" active={activeView} onClick={setActiveView} />
        <NavButton icon={<Database size={18} />} label="Chroma 内容" value="chroma" active={activeView} onClick={setActiveView} />
        <NavButton icon={<Layers3 size={18} />} label="3D 向量空间" value="space" active={activeView} onClick={setActiveView} />
        <NavButton icon={<Search size={18} />} label="查询可视化" value="query" active={activeView} onClick={setActiveView} />
        <button className="refresh" onClick={() => void loadInitialData()} title="刷新">
          <RefreshCw size={16} />
          刷新数据
        </button>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <h1>{viewTitle(activeView)}</h1>
            <p>{status}</p>
          </div>
          <div className="toolbar">
            <span className={apiConnected ? "status-pill ok" : "status-pill warn"}>
              API {apiConnected ? "已连接" : "未连接"}
            </span>
            <span className={chromaStatus?.connected ? "status-pill ok" : "status-pill warn"}>
              Chroma {chromaStatus?.connected ? `${chromaStatus.host}:${chromaStatus.port}` : "未连接"}
            </span>
            <select value={selectedCollection} onChange={(event) => setSelectedCollection(event.target.value)}>
              {collections.map((collection) => (
                <option key={collection.display_name || collection.name} value={collection.name}>
                  {collection.display_name || collection.name}
                </option>
              ))}
            </select>
            <select value={selectedDocument} onChange={(event) => setSelectedDocument(event.target.value)}>
              {documents.map((document) => (
                <option key={document.id} value={document.id}>
                  {document.file_name}
                </option>
              ))}
            </select>
          </div>
        </header>

        {activeView === "overview" && <Overview documents={documents} collections={collections} onCreateCollection={handleCreateCollection} onDeleteCollection={handleDeleteCollection} onRepairData={() => void handleRepairData()} />}
        {activeView === "upload" && (
          <UploadView
            uploading={uploading}
            steps={uploadSteps}
            resultMessage={uploadResultMessage}
            onUpload={(file) => void uploadDocument(file)}
          />
        )}
        {activeView === "ocr" && (
          <OcrView
            pages={pages}
            selectedPage={selectedPage}
            selectedBlock={selectedBlock}
            nativeResult={nativeResult}
            onSelectPage={setSelectedPageNo}
            onSelectBlock={setSelectedBlock}
            pendingChunkTargetRef={pendingChunkTargetRef}
            pendingVersion={pendingVersion}
          />
        )}
        {activeView === "chunks" && (
          <ChunkView
            chunks={chunks}
            onFocusChunk={(chunk) =>
              focusChunk(chunk, pages, setSelectedPageNo, setSelectedBlock, setActiveView, pendingChunkTargetRef, setPendingVersion)
            }
            selectedIds={selectedChunkIds}
            onToggleChunk={handleToggleChunk}
            onSelectAll={handleSelectAllChunks}
            onDeselectAll={handleDeselectAllChunks}
            onEmbed={() => void handleEmbedChunks()}
            embeddingBusy={embeddingBusy}
            embeddingMessage={embeddingMessage}
            embeddedChunkIds={embeddedChunkIds}
          />
        )}
        {activeView === "chroma" && <ChromaView records={records} points={points} onSelectPoint={setSelectedPoint} onDeleteRecord={handleDeleteRecord} onClearCollection={handleClearCollection} />}
        {activeView === "space" && (
          <VectorSpace points={points} selectedPoint={selectedPoint} highlightedIds={highlightedIds} queryResult={queryResult} onSelectPoint={setSelectedPoint} />
        )}
        {activeView === "query" && (
          <QueryView
            query={query}
            topK={topK}
            result={queryResult}
            points={points}
            selectedPoint={selectedPoint}
            highlightedIds={highlightedIds}
            onQueryChange={setQuery}
            onTopKChange={setTopK}
            onRunQuery={() => void runQuery()}
            onSelectPoint={setSelectedPoint}
          />
        )}
      </main>
    </div>
  );
}

function NavButton(props: { icon: React.ReactNode; label: string; value: string; active: string; onClick: (value: string) => void }) {
  return (
    <button className={props.active === props.value ? "nav-button active" : "nav-button"} onClick={() => props.onClick(props.value)}>
      {props.icon}
      {props.label}
    </button>
  );
}

function UploadView({
  uploading,
  steps,
  resultMessage,
  onUpload,
}: {
  uploading: boolean;
  steps: UploadStep[];
  resultMessage: string;
  onUpload: (file: File) => void;
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  return (
    <section className="upload-layout">
      <div className="panel upload-panel">
        <h2>上传文档并解析</h2>
        <label className="dropzone">
          <UploadCloud size={42} />
          <strong>{selectedFile ? selectedFile.name : "选择 PDF、图片或文本文件"}</strong>
          <span>{selectedFile ? `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB` : "上传后会生成 OCR 区域、页面结构和 Chunk 预览"}</span>
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.txt,.md,.csv"
            onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <button className="primary" disabled={!selectedFile || uploading} onClick={() => selectedFile && onUpload(selectedFile)}>
          <UploadCloud size={16} />
          {uploading ? "解析中" : "上传并解析"}
        </button>
      </div>
      <div className="panel">
        <h2>解析链路</h2>
        <div className="step-list">
          {steps.map((step) => (
            <div className={`parse-step ${step.status}`} key={step.key}>
              <div className="step-icon">
                {step.status === "done" && <CheckCircle2 size={18} />}
                {step.status === "running" && <Loader2 size={18} />}
                {step.status === "error" && <XCircle size={18} />}
                {step.status === "pending" && <span />}
              </div>
              <div>
                <strong>{step.label}</strong>
                <span>{step.detail}</span>
              </div>
            </div>
          ))}
        </div>
        {resultMessage && <div className="upload-result">{resultMessage}</div>}
      </div>
    </section>
  );
}

function Overview({ documents, collections, onCreateCollection, onDeleteCollection, onRepairData }: { documents: DocumentItem[]; collections: Collection[]; onCreateCollection: (name: string) => void; onDeleteCollection: (name: string) => void; onRepairData: () => void }) {
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  return (
    <section className="grid two">
      <div className="panel">
        <h2>文档处理状态</h2>
        <div className="pipeline">
          {["上传文档", "MinerU OCR", "结构化解析", "Chunk 切分", "Embedding", "写入 Chroma"].map((step) => (
            <div className="pipeline-step" key={step}>
              <span />
              {step}
            </div>
          ))}
        </div>
        <button className="primary" onClick={onRepairData} title="以 ChromaDB 实际数据修正 JSON 中的 collections" style={{ marginBottom: 12 }}>
          <Wrench size={14} />
          修复数据
        </button>
        <Table
          headers={["文件", "页数", "Chunk", "Embedding", "入库"]}
          rows={documents.map((document) => [
            document.file_name,
            document.pages,
            document.chunk_status,
            document.embedding_status,
            document.ingest_status,
          ])}
        />
      </div>
      <div className="panel">
        <h2>Collection 总览</h2>
        <div className="metric-grid">
          <Metric label="Collection" value={collections.length} />
          <Metric label="Records" value={collections.reduce((sum, item) => sum + item.count, 0)} />
          <Metric label="数据源" value={collections[0]?.source ?? "-"} />
        </div>
        <div className="collection-actions">
          {creating ? (
            <div className="inline-form">
              <input
                type="text"
                placeholder="输入 Collection 名称"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newName.trim()) {
                    onCreateCollection(newName.trim());
                    setNewName("");
                    setCreating(false);
                  }
                  if (e.key === "Escape") {
                    setNewName("");
                    setCreating(false);
                  }
                }}
                autoFocus
              />
              <button className="primary" disabled={!newName.trim()} onClick={() => { onCreateCollection(newName.trim()); setNewName(""); setCreating(false); }}>
                确认
              </button>
              <button onClick={() => { setNewName(""); setCreating(false); }}>取消</button>
            </div>
          ) : (
            <button className="primary" onClick={() => setCreating(true)}>+ 创建 Collection</button>
          )}
        </div>
        <Table
          headers={["名称", "数量", "来源", "操作"]}
          rows={collections.map((collection) => [
            collection.display_name || collection.name,
            collection.count,
            collection.source,
            <button className="danger" onClick={() => { if (window.confirm(`确定删除 Collection "${collection.display_name || collection.name}" 吗？此操作不可恢复。`)) onDeleteCollection(collection.name); }} title="删除此 Collection">
              <Trash2 size={14} />
            </button>,
          ]) as any }
        />
      </div>
    </section>
  );
}

function blockKey(pageNo: number, blockId: string) {
  return `${pageNo}:${blockId}`;
}

function LazyPageSurface({
  page,
  zoom,
  selectedPageNo,
  selectedBlock,
  onSelectPage,
  onSelectBlock,
  containerRef,
  onPageReady,
  onActivate,
  pendingVersion,
}: {
  page: OcrPage;
  zoom: number;
  selectedPageNo: number;
  selectedBlock: OcrBlock | null;
  onSelectPage: (pageNo: number) => void;
  onSelectBlock: (block: OcrBlock) => void;
  containerRef: (node: HTMLDivElement | null) => void;
  onPageReady?: (pageNo: number) => void;
  onActivate?: () => void;
  pendingVersion?: number;
}) {
  const [activate, setActivate] = useState(page.page_no <= 3);
  const placeholderRef = useRef<HTMLDivElement | null>(null);
  const activatedRef = useRef(activate);
  const prevActivate = useRef(activate);

  useEffect(() => {
    if (page.page_no <= 3) {
      setActivate(true);
      activatedRef.current = true;
    }
  }, [page.page_no]);

  useEffect(() => {
    if (page.page_no === selectedPageNo) {
      setActivate(true);
      activatedRef.current = true;
    }
  }, [selectedPageNo, page.page_no]);

  useEffect(() => {
    if (activate && !prevActivate.current) {
      onActivate?.();
    }
    prevActivate.current = activate;
  }, [activate]);

  useEffect(() => {
    if (activate) return;
    const el = placeholderRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          activatedRef.current = true;
          setActivate(true);
          observer.disconnect();
        }
      },
      { rootMargin: "800px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [activate, page.page_no]);

  if (activate) {
    return (
      <OcrPageSurface
        page={page}
        zoom={zoom}
        selectedPageNo={selectedPageNo}
        selectedBlock={selectedBlock}
        onSelectPage={onSelectPage}
        onSelectBlock={onSelectBlock}
        containerRef={containerRef}
        onPageReady={onPageReady}
        pendingVersion={pendingVersion}
      />
    );
  }

  const estHeight = page.height && page.width
    ? Math.min((page.height / page.width) * 760, 2000)
    : 800;

  return (
    <div
      ref={(node) => {
        placeholderRef.current = node;
        containerRef(node);
      }}
      data-page-no={page.page_no}
      className="page-surface-wrap page-surface-lazy"
      style={{ height: `${estHeight}px` }}
    >
      <div className="page-surface-label">第 {page.page_no} 页</div>
      <div className="page-surface-skeleton">
        <Loader2 size={20} className="skeleton-spinner" />
      </div>
    </div>
  );
}

function OcrPageSurface({
  page,
  zoom,
  selectedPageNo,
  selectedBlock,
  onSelectPage,
  onSelectBlock,
  containerRef,
  onPageReady,
  pendingVersion,
}: {
  page: OcrPage;
  zoom: number;
  selectedPageNo: number;
  selectedBlock: OcrBlock | null;
  onSelectPage: (pageNo: number) => void;
  onSelectBlock: (block: OcrBlock) => void;
  containerRef: (node: HTMLDivElement | null) => void;
  onPageReady?: (pageNo: number) => void;
  pendingVersion?: number;
}) {
  const [renderMetrics, setRenderMetrics] = useState<PageRenderMetrics | null>(null);
  const [pageLoading, setPageLoading] = useState(Boolean(page.file_url || page.image_url));
  const surfaceRef = useRef<HTMLDivElement>(null);
  const surfaceWidth = page.width ?? 900;
  const surfaceHeight = page.height ?? 1200;
  const readyFiredRef = useRef(false);

  useEffect(() => {
    setRenderMetrics(null);
    setPageLoading(Boolean(page.file_url || page.image_url));
    readyFiredRef.current = false;
  }, [page.page_no, page.file_url, page.image_url]);

  useEffect(() => {
    readyFiredRef.current = false;
  }, [pendingVersion]);

  useEffect(() => {
    if (!pageLoading && !readyFiredRef.current) {
      readyFiredRef.current = true;
      onPageReady?.(page.page_no);
    }
  }, [pageLoading, pendingVersion]);

  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    if (renderMetrics) {
      el.style.width = `${renderMetrics.width}px`;
      el.style.height = `${renderMetrics.height}px`;
    } else if (!page.image_url && !page.file_url) {
      el.style.width = `${surfaceWidth}px`;
      el.style.height = `${surfaceHeight}px`;
    } else {
      el.style.width = "auto";
      el.style.height = "auto";
    }
  }, [renderMetrics, surfaceWidth, surfaceHeight, page.image_url, page.file_url]);

  return (
    <div
      className={`page-surface-wrap ${selectedPageNo === page.page_no ? "is-current" : ""}`}
      ref={containerRef}
      data-page-no={page.page_no}
    >
      <div className="page-surface-label">第 {page.page_no} 页</div>
      <div className="page-surface" ref={surfaceRef} style={{ zoom }}>
        {(page.image_url || page.file_url) && (
          <PageBackground
            fileUrl={page.image_url || page.file_url || ""}
            pageNo={page.page_no}
            targetWidth={surfaceWidth}
            targetHeight={surfaceHeight}
            onMetrics={setRenderMetrics}
            onLoaded={() => setPageLoading(false)}
            preferImage={Boolean(page.image_url)}
          />
        )}
        {!pageLoading &&
          page.blocks.map((block) => {
            const [x1, y1, x2, y2] = block.bbox;
            const active = selectedBlock?.id === block.id && selectedPageNo === page.page_no;
            const effectiveSurfaceWidth = renderMetrics?.width ?? surfaceWidth;
            const effectiveSurfaceHeight = renderMetrics?.height ?? surfaceHeight;
            const rect = mapBboxToSurface(
              [x1, y1, x2, y2],
              surfaceWidth,
              surfaceHeight,
              effectiveSurfaceWidth,
              effectiveSurfaceHeight,
              renderMetrics,
            );
            return (
              <button
                key={blockKey(page.page_no, block.id)}
                className={`ocr-box ${block.type} ${active ? "active" : ""}`}
                style={{
                  left: rect.left,
                  top: rect.top,
                  width: rect.width,
                  height: rect.height,
                }}
                onClick={() => {
                  onSelectPage(page.page_no);
                  onSelectBlock(block);
                }}
                title={resolveBlockText(block)}
              >
                {block.type}
              </button>
            );
          })}
      </div>
    </div>
  );
}

function firstBlockOfPage(pages: OcrPage[], pageNo: number): OcrBlock | null {
  const page = pages.find((item) => item.page_no === pageNo);
  if (!page?.blocks.length) return null;
  return page.blocks.find((block) => resolveBlockText(block).length > 0) ?? page.blocks[0] ?? null;
}

function selectPageWithFirstBlock(
  pages: OcrPage[],
  pageNo: number,
  onSelectPage: (pageNo: number) => void,
  onSelectBlock: (block: OcrBlock) => void,
) {
  onSelectPage(pageNo);
  const firstBlock = firstBlockOfPage(pages, pageNo);
  if (firstBlock) onSelectBlock(firstBlock);
}

function OcrView(props: {
  pages: OcrPage[];
  selectedPage?: OcrPage;
  selectedBlock: OcrBlock | null;
  nativeResult: Record<string, unknown> | null;
  onSelectPage: (pageNo: number) => void;
  onSelectBlock: (block: OcrBlock) => void;
  pendingChunkTargetRef?: React.MutableRefObject<{ block?: OcrBlock; pageNo: number; deferScroll?: boolean; chunkId?: string; blkId?: string } | null>;
  pendingVersion?: number;
}) {
  const page = props.selectedPage;
  const [zoom, setZoom] = useState(0.84);
  const [lazyVersion, setLazyVersion] = useState(0);
  const currentIndex = page ? props.pages.findIndex((item) => item.page_no === page.page_no) : -1;

  const stageScrollRef = useRef<HTMLDivElement>(null);
  const pageSurfaceRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const pageChangeSourceRef = useRef<"scroll" | null>(null);
  const markdownClickGuardUntilRef = useRef(0);
  const selectedPageNoRef = useRef(page?.page_no ?? 1);
  selectedPageNoRef.current = page?.page_no ?? 1;

  const navigationGuardUntilRef = useRef(0);

  const markMarkdownClick = () => {
    markdownClickGuardUntilRef.current = Date.now() + 700;
  };

  const isMarkdownClickGuarded = () => Date.now() < markdownClickGuardUntilRef.current;
  const isNavigationGuarded = () => Date.now() < navigationGuardUntilRef.current;

  const handlePageReady = (pageNo: number) => {
    const ref = props.pendingChunkTargetRef;
    if (!ref) return;
    const pending = ref.current;
    if (pending && pending.pageNo === pageNo) {
      let targetBlock = pending.block;
      if (!targetBlock) {
        // Search loaded page for matching block by chunkId or blkId
        const page = props.pages.find((p) => p.page_no === pageNo);
        if (page && pending.chunkId) {
          targetBlock = page.blocks.find((b) => b.chunk_ids.includes(pending.chunkId!));
        }
        if (!targetBlock && page && pending.blkId) {
          targetBlock = page.blocks.find((b) => b.id === pending.blkId);
        }
      }
      if (!targetBlock) return;
      ref.current = null;
      navigationGuardUntilRef.current = Date.now() + 800;
      props.onSelectPage(pageNo);
      scrollToPage(pageNo, "smooth");
      // 延迟选中 block，等自动首 block 定位完成后再覆盖
      setTimeout(() => {
        props.onSelectBlock(targetBlock);
      }, 150);
    }
  };

  const scrollToPage = (pageNo: number, behavior: ScrollBehavior = "smooth") => {
    pageSurfaceRefs.current[pageNo]?.scrollIntoView({ behavior, block: "start" });
  };

  useEffect(() => {
    if (pageChangeSourceRef.current === "scroll") {
      pageChangeSourceRef.current = null;
      return;
    }
    if (page?.page_no) {
      const pending = props.pendingChunkTargetRef?.current;
      if (pending?.deferScroll && pending.pageNo === page.page_no) {
        return;
      }
      navigationGuardUntilRef.current = Date.now() + 800;
      scrollToPage(page.page_no, "smooth");
    }
  }, [page?.page_no]);

  useEffect(() => {
    const container = stageScrollRef.current;
    if (!container || props.pages.length === 0) return;

    let observer: IntersectionObserver | null = null;
    const frameId = window.requestAnimationFrame(() => {
      observer = new IntersectionObserver(
        (entries) => {
          const best = entries
            .filter((entry) => entry.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
          if (!best) return;

          const pageNo = Number((best.target as HTMLElement).dataset.pageNo);
          if (!pageNo || pageNo === selectedPageNoRef.current) return;
          if (props.pendingChunkTargetRef?.current) return;
          if (isMarkdownClickGuarded()) return;
          if (isNavigationGuarded()) return;

          pageChangeSourceRef.current = "scroll";
          selectPageWithFirstBlock(props.pages, pageNo, props.onSelectPage, props.onSelectBlock);
        },
        { root: container, threshold: [0.2, 0.35, 0.5, 0.65, 0.8] },
      );

      props.pages.forEach((item) => {
        const el = pageSurfaceRefs.current[item.page_no];
        if (el) observer?.observe(el);
      });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      observer?.disconnect();
    };
  }, [props.pages, props.onSelectPage, props.onSelectBlock, lazyVersion]);

  function goPage(delta: number) {
    const next = props.pages[currentIndex + delta];
    if (!next) return;
    navigationGuardUntilRef.current = Date.now() + 800;
    selectPageWithFirstBlock(props.pages, next.page_no, props.onSelectPage, props.onSelectBlock);
  }

  function handleRailPageClick(pageNo: number) {
    navigationGuardUntilRef.current = Date.now() + 800;
    selectPageWithFirstBlock(props.pages, pageNo, props.onSelectPage, props.onSelectBlock);
  }

  return (
    <section className="mineru-ocr-shell">
      <aside className="mineru-file-rail">
        <div className="mineru-logo">MinerU</div>
        <button className="new-parse-button">
          <UploadCloud size={16} />
          新解析
        </button>
        <div className="mineru-rail-section">页面</div>
        <div className="mineru-page-stack">
          {props.pages.map((item) => (
            <button
              className={page?.page_no === item.page_no ? "mineru-page-button active" : "mineru-page-button"}
              key={item.page_no}
              onClick={() => handleRailPageClick(item.page_no)}
            >
              <FileText size={15} />
              第 {item.page_no} 页
              <span>{item.blocks.length}</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="mineru-document-stage">
        <div className="mineru-stage-toolbar">
          <div className="toolbar-group">
            <button onClick={() => goPage(-1)} disabled={currentIndex <= 0} title="上一页">
              <ChevronLeft size={16} />
            </button>
            <strong>{page ? page.page_no : 0}</strong>
            <span>/</span>
            <span>{props.pages.length}</span>
            <button onClick={() => goPage(1)} disabled={currentIndex < 0 || currentIndex >= props.pages.length - 1} title="下一页">
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="toolbar-group">
            <button onClick={() => setZoom((value) => Math.max(0.45, value - 0.08))} title="缩小">
              <ZoomOut size={15} />
            </button>
            <strong>{Math.round(zoom * 100)}%</strong>
            <button onClick={() => setZoom((value) => Math.min(1.6, value + 0.08))} title="放大">
              <ZoomIn size={15} />
            </button>
          </div>
        </div>

        <div className="mineru-stage-scroll" ref={stageScrollRef}>
          {props.pages.length > 0 ? (
            <div className="page-stack">
              {props.pages.map((pageItem) => (
                <LazyPageSurface
                  key={pageItem.page_no}
                  page={pageItem}
                  zoom={zoom}
                  selectedPageNo={page?.page_no ?? 1}
                  selectedBlock={props.selectedBlock}
                  onSelectPage={props.onSelectPage}
                  onSelectBlock={props.onSelectBlock}
                  containerRef={(node) => {
                    pageSurfaceRefs.current[pageItem.page_no] = node;
                  }}
                  onPageReady={handlePageReady}
                  onActivate={() => setLazyVersion((v) => v + 1)}
                  pendingVersion={props.pendingVersion}
                />
              ))}
            </div>
          ) : (
            <EmptyState text="没有 OCR 页面数据" />
          )}
        </div>
      </div>

      <MarkdownResultPanel
        pages={props.pages}
        selectedPageNo={page?.page_no ?? 1}
        selectedBlock={props.selectedBlock}
        nativeResult={props.nativeResult}
        onSelectBlock={props.onSelectBlock}
        onSelectPage={props.onSelectPage}
        onMarkdownBlockClick={markMarkdownClick}
        markdownClickGuardUntilRef={markdownClickGuardUntilRef}
      />
    </section>
  );
}

type MarkdownBlockItem = {
  block: OcrBlock;
  pageNo: number;
  markdown: string;
  variant: "meta" | "title" | "section" | "body" | "table" | "formula";
};

function MarkdownResultPanel({
  pages,
  selectedPageNo,
  selectedBlock,
  nativeResult,
  onSelectBlock,
  onSelectPage,
  onMarkdownBlockClick,
  markdownClickGuardUntilRef,
}: {
  pages: OcrPage[];
  selectedPageNo: number;
  selectedBlock: OcrBlock | null;
  nativeResult: Record<string, unknown> | null;
  onSelectBlock: (block: OcrBlock) => void;
  onSelectPage: (pageNo: number) => void;
  onMarkdownBlockClick: () => void;
  markdownClickGuardUntilRef: React.MutableRefObject<number>;
}) {
  const [resultTab, setResultTab] = useState<"markdown" | "json">("markdown");
  const [copyHint, setCopyHint] = useState("");
  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const markdownPreviewRef = useRef<HTMLDivElement>(null);

  const mdBlocks = useMemo(() => collectMarkdownBlocks(pages), [pages]);
  const fullMarkdown = useMemo(() => {
    const nativeMd = extractNativeMarkdown(nativeResult);
    if (nativeMd) return nativeMd;
    return mdBlocks.map((item) => item.markdown).join("\n\n");
  }, [mdBlocks, nativeResult]);
  const jsonText = useMemo(
    () => JSON.stringify(nativeResult ?? { pages }, null, 2),
    [nativeResult, pages],
  );

  function scrollMarkdownBlockToTop(pageNo: number, blockId: string) {
    const container = markdownPreviewRef.current;
    const el = blockRefs.current[blockKey(pageNo, blockId)];
    if (!container || !el) return;
    const top = el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
    container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }

  useEffect(() => {
    if (!selectedBlock?.id) return;
    if (Date.now() < markdownClickGuardUntilRef.current) return;
    scrollMarkdownBlockToTop(selectedPageNo, selectedBlock.id);
  }, [selectedBlock?.id, selectedPageNo, markdownClickGuardUntilRef]);

  async function handleCopy() {
    const text = resultTab === "markdown" ? fullMarkdown : jsonText;
    try {
      await navigator.clipboard.writeText(text);
      setCopyHint("已复制");
    } catch {
      setCopyHint("复制失败");
    }
    window.setTimeout(() => setCopyHint(""), 1500);
  }

  function handleBlockClick(item: MarkdownBlockItem) {
    onMarkdownBlockClick();
    onSelectPage(item.pageNo);
    onSelectBlock(item.block);
  }

  return (
    <aside className="mineru-result-panel">
      <div className="result-tabs">
        <button className={resultTab === "markdown" ? "active" : ""} onClick={() => setResultTab("markdown")}>
          Markdown
        </button>
        <button className={resultTab === "json" ? "active" : ""} onClick={() => setResultTab("json")}>
          JSON
        </button>
        <button className="copy-button" title={copyHint || "复制"} onClick={() => void handleCopy()}>
          <Copy size={15} />
        </button>
      </div>
      {resultTab === "markdown" ? (
        <div className="markdown-preview" ref={markdownPreviewRef}>
          {mdBlocks.length === 0 ? (
            extractNativeMarkdown(nativeResult) ? (
              <div className="markdown-full-doc">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={markdownComponents}>
                  {extractNativeMarkdown(nativeResult) ?? ""}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="md-empty">暂无 Markdown 内容</div>
            )
          ) : (
            mdBlocks.map((item) => {
              const itemKey = blockKey(item.pageNo, item.block.id);
              const isActive = selectedPageNo === item.pageNo && selectedBlock?.id === item.block.id;
              return (
              <div
                key={itemKey}
                ref={(node) => {
                  blockRefs.current[itemKey] = node;
                }}
                className={`md-doc-block variant-${item.variant} ${isActive ? "active" : ""}`}
                onClick={() => handleBlockClick(item)}
              >
                <div className="md-doc-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={markdownComponents}>
                    {item.markdown}
                  </ReactMarkdown>
                </div>
              </div>
            );
            })
          )}
        </div>
      ) : (
        <pre className="json-preview">{jsonText}</pre>
      )}
    </aside>
  );
}

const markdownComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => <h1 className="md-h1">{children}</h1>,
  h2: ({ children }: { children?: React.ReactNode }) => <h2 className="md-h2">{children}</h2>,
  h3: ({ children }: { children?: React.ReactNode }) => <h3 className="md-h3">{children}</h3>,
  p: ({ children }: { children?: React.ReactNode }) => <p className="md-p">{children}</p>,
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="md-table-wrap">
      <table className="md-table">{children}</table>
    </div>
  ),
  del: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
};

function PageBackground({
  fileUrl,
  pageNo,
  targetWidth,
  targetHeight,
  onMetrics,
  onLoaded,
  preferImage,
}: {
  fileUrl: string;
  pageNo: number;
  targetWidth: number;
  targetHeight: number;
  onMetrics: (metrics: PageRenderMetrics) => void;
  onLoaded?: () => void;
  preferImage?: boolean;
}) {
  const url = assetUrl(fileUrl);
  const lower = fileUrl.toLowerCase();
  if (preferImage || lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".webp")) {
    return <img className="page-background-image" src={url} alt="原始页面" onLoad={(event) => {
      const image = event.currentTarget;
      const maxWidth = Math.min(image.parentElement?.parentElement?.clientWidth || image.naturalWidth, 760);
      const scale = maxWidth / image.naturalWidth;
      onMetrics({
        width: Math.floor(image.naturalWidth * scale),
        height: Math.floor(image.naturalHeight * scale),
        sourceWidth: image.naturalWidth,
        sourceHeight: image.naturalHeight,
      });
      image.style.width = `${Math.floor(image.naturalWidth * scale)}px`;
      image.style.height = `${Math.floor(image.naturalHeight * scale)}px`;
      onLoaded?.();
    }} />;
  }
  if (lower.endsWith(".pdf")) {
    return <PdfPageCanvas url={url} pageNo={pageNo} targetWidth={targetWidth} targetHeight={targetHeight} onMetrics={onMetrics} onLoaded={onLoaded} />;
  }
  return <div className="page-background-placeholder">无法直接预览此文件</div>;
}

const pdfDocCache = new Map<string, Promise<pdfjsLib.PDFDocumentProxy>>();

function getPdfDocument(url: string): Promise<pdfjsLib.PDFDocumentProxy> {
  const cached = pdfDocCache.get(url);
  if (cached) return cached;
  const promise = pdfjsLib.getDocument(url).promise;
  pdfDocCache.set(url, promise);
  return promise;
}

function PdfPageCanvas({
  url,
  pageNo,
  targetWidth,
  targetHeight,
  onMetrics,
  onLoaded,
}: {
  url: string;
  pageNo: number;
  targetWidth: number;
  targetHeight: number;
  onMetrics: (metrics: PageRenderMetrics) => void;
  onLoaded?: () => void;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState("");
  const onLoadedRef = React.useRef(onLoaded);
  onLoadedRef.current = onLoaded;

  useEffect(() => {
    let cancelled = false;
    async function renderPage() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      setError("");
      try {
        const pdf = await getPdfDocument(url);
        const page = await pdf.getPage(Math.min(pageNo, pdf.numPages));
        const baseViewport = page.getViewport({ scale: 1 });
        const containerWidth = Math.min(canvas.parentElement?.parentElement?.clientWidth || targetWidth, 760);
        const targetAspect = targetHeight / targetWidth;
        const renderWidth = containerWidth;
        const renderHeight = Math.floor(renderWidth * targetAspect);
        const scale = Math.max(renderWidth / baseViewport.width, renderHeight / baseViewport.height);
        const viewport = page.getViewport({ scale });
        const context = canvas.getContext("2d");
        if (!context || cancelled) return;
        const offscreen = document.createElement("canvas");
        offscreen.width = Math.floor(viewport.width);
        offscreen.height = Math.floor(viewport.height);
        const offscreenContext = offscreen.getContext("2d");
        if (!offscreenContext) return;
        await page.render({ canvasContext: offscreenContext, viewport }).promise;

        canvas.width = renderWidth;
        canvas.height = renderHeight;
        canvas.style.width = `${renderWidth}px`;
        canvas.style.height = `${renderHeight}px`;
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, renderWidth, renderHeight);
        const offsetX = (renderWidth - offscreen.width) / 2;
        const offsetY = (renderHeight - offscreen.height) / 2;
        context.drawImage(offscreen, offsetX, offsetY);
        onMetrics({
          width: renderWidth,
          height: renderHeight,
          sourceWidth: targetWidth,
          sourceHeight: targetHeight,
          pdfWidth: baseViewport.width,
          pdfHeight: baseViewport.height,
          pdfScale: scale,
          offsetX,
          offsetY,
        });
        if (!cancelled) onLoadedRef.current?.();
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    }
    void renderPage();
    return () => {
      cancelled = true;
    };
  }, [url, pageNo]);

  return (
    <>
      <canvas className="page-background-canvas" ref={canvasRef} />
      {error && <div className="page-render-error">{error}</div>}
    </>
  );
}

function ChunkView({
  chunks,
  onFocusChunk,
  selectedIds,
  onToggleChunk,
  onSelectAll,
  onDeselectAll,
  onEmbed,
  embeddingBusy,
  embeddingMessage,
  embeddedChunkIds,
}: {
  chunks: Chunk[];
  onFocusChunk: (chunk: Chunk) => void;
  selectedIds: Set<string>;
  onToggleChunk: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onEmbed: () => void;
  embeddingBusy: boolean;
  embeddingMessage: string;
  embeddedChunkIds: Set<string>;
}) {
  const COLUMNS = 5;
  const columns = useMemo(() => {
    const cols: Chunk[][] = Array.from({ length: COLUMNS }, () => []);
    const heights = new Array(COLUMNS).fill(0);
    chunks.forEach((chunk) => {
      const h = Math.max(80, chunk.text.length * 0.35 + 60);
      const shortest = heights.indexOf(Math.min(...heights));
      cols[shortest].push(chunk);
      heights[shortest] += h;
    });
    return cols;
  }, [chunks]);

  const selectableCount = chunks.filter((c) => !embeddedChunkIds.has(c.id)).length;

  return (
    <section className="panel">
      <div className="chunk-toolbar">
        <h2>Chunk 切分</h2>
        <div className="chunk-toolbar-actions">
          <button className="secondary" onClick={onSelectAll} disabled={selectableCount === 0}>
            全选
          </button>
          <button className="secondary" onClick={onDeselectAll} disabled={selectedIds.size === 0}>
            取消全选
          </button>
          <button className="primary" onClick={onEmbed} disabled={selectedIds.size === 0 || embeddingBusy}>
            <Database size={16} />
            {embeddingBusy ? "Embedding..." : `Embedding (${selectedIds.size})`}
          </button>
        </div>
      </div>
      {embeddingMessage && <div className="embedding-message">{embeddingMessage}</div>}
      <div className="chunk-masonry">
        {columns.map((col, ci) => (
          <div className="chunk-masonry-col" key={ci}>
            {col.map((chunk) => {
              const isEmbedded = embeddedChunkIds.has(chunk.id);
              const isSelected = selectedIds.has(chunk.id);
              return (
                <div
                  className={`chunk-card${isEmbedded ? " embedded" : ""}${isSelected ? " selected" : ""}`}
                  key={chunk.id}
                >
                  <button
                    type="button"
                    className="chunk-context-btn"
                    onClick={() => onFocusChunk(chunk)}
                    title="在 OCR 页面中查看上下文"
                  >
                    <FileText size={14} />
                  </button>
                  <div className="chunk-card-header">
                    <label className="chunk-checkbox">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={isEmbedded}
                        onChange={() => onToggleChunk(chunk.id)}
                      />
                    </label>
                    <div
                      className="chunk-card-body"
                      onClick={() => !isEmbedded && onToggleChunk(chunk.id)}
                    >
                      <strong>{chunk.id}</strong>
                      <p>{chunk.text}</p>
                      <span>
                        {String(chunk.metadata.source ?? "unknown")} · page {String(chunk.metadata.page ?? "-")}
                      </span>
                    </div>
                    {isEmbedded && <span className="chunk-embedded-badge">已嵌入</span>}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

function ChromaView({ records, points, onSelectPoint, onDeleteRecord, onClearCollection }: { records: RecordItem[]; points: Point3D[]; onSelectPoint: (point: Point3D) => void; onDeleteRecord: (id: string) => void; onClearCollection: () => void }) {
  const pointMap = useMemo(() => new Map(points.map((point) => [point.id, point])), [points]);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());

  async function handleDelete(recordId: string) {
    setDeleting((prev) => new Set(prev).add(recordId));
    try {
      await onDeleteRecord(recordId);
    } finally {
      setDeleting((prev) => {
        const next = new Set(prev);
        next.delete(recordId);
        return next;
      });
    }
  }

  return (
    <section className="split">
      <div className="panel">
        <div className="records-header">
          <h2>Records</h2>
          <button className="clear-btn" onClick={onClearCollection} title="清空所有记录">
            <Trash2 size={14} /> 清空
          </button>
        </div>
        <div className="record-list">
          {records.map((record) => (
            <button
              className="record-content"
              key={record.id}
              onClick={() => pointMap.get(record.id) && onSelectPoint(pointMap.get(record.id)!)}
            >
              <strong>{record.id}</strong>
              <span>{record.document}</span>
              <small>{JSON.stringify(record.metadata, Object.keys(record.metadata).sort())}</small>
              <span
                className="record-delete-btn"
                role="button"
                tabIndex={0}
                aria-label="删除此记录"
                onClick={(e) => { e.stopPropagation(); handleDelete(record.id); }}
              >
                <Trash2 size={13} />
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="panel">
        <h2>Embedding 摘要</h2>
        <Table
          headers={["来源", "记录数"]}
          rows={(() => {
            const counts: Record<string, number> = {};
            records.forEach((r) => {
              const source = String(r.metadata.source ?? "-");
              counts[source] = (counts[source] || 0) + 1;
            });
            return Object.entries(counts)
              .sort((a, b) => b[1] - a[1])
              .map(([source, count]) => [source, String(count)]);
          })()}
        />
      </div>
    </section>
  );
}

function QueryView(props: {
  query: string;
  topK: number;
  result: QueryResult | null;
  points: Point3D[];
  selectedPoint: Point3D | null;
  highlightedIds: Set<string>;
  onQueryChange: (value: string) => void;
  onTopKChange: (value: number) => void;
  onRunQuery: () => void;
  onSelectPoint: (point: Point3D) => void;
}) {
  return (
    <section className="query-layout">
      <div className="panel query-controls">
        <h2>查询</h2>
        <textarea value={props.query} onChange={(event) => props.onQueryChange(event.target.value)} />
        <label>
          Top-K
          <input type="number" min={1} max={50} value={props.topK} onChange={(event) => props.onTopKChange(Number(event.target.value))} />
        </label>
        <button className="primary" onClick={props.onRunQuery}>
          <Search size={16} />
          执行查询
        </button>
        <div className="result-list">
          {props.result?.results.map((item) => (
            <button key={item.id} onClick={() => props.onSelectPoint(item)}>
              <strong>{item.id}</strong>
              <span>score {item.score?.toFixed(3) ?? "-"}</span>
              <p>{item.document}</p>
            </button>
          ))}
        </div>
      </div>
      <VectorSpace
        points={props.points}
        selectedPoint={props.selectedPoint}
        highlightedIds={props.highlightedIds}
        queryResult={props.result}
        onSelectPoint={props.onSelectPoint}
      />
    </section>
  );
}

function CoordinateAxes() {
  const L = 1.6;
  const coneRadius = 0.04;
  const coneHeight = 0.1;

  return (
    <group>
      {/* Axis lines */}
      <Line points={[[0, 0, 0], [L, 0, 0]]} color="#ef4444" lineWidth={1} />
      <Line points={[[0, 0, 0], [0, L, 0]]} color="#22c55e" lineWidth={1} />
      <Line points={[[0, 0, 0], [0, 0, L]]} color="#3b82f6" lineWidth={1} />

      {/* Arrowheads */}
      <mesh position={[L, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[coneRadius, coneHeight, 8]} />
        <meshBasicMaterial color="#ef4444" />
      </mesh>
      <mesh position={[0, L, 0]}>
        <coneGeometry args={[coneRadius, coneHeight, 8]} />
        <meshBasicMaterial color="#22c55e" />
      </mesh>
      <mesh position={[0, 0, L]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[coneRadius, coneHeight, 8]} />
        <meshBasicMaterial color="#3b82f6" />
      </mesh>

    </group>
  );
}

function VectorSpace(props: {
  points: Point3D[];
  selectedPoint: Point3D | null;
  highlightedIds: Set<string>;
  queryResult: QueryResult | null;
  onSelectPoint: (point: Point3D) => void;
}) {
  return (
    <section className="space-layout">
      <div className="panel three-panel">
        <Canvas camera={{ position: [2.8, 2.8, 3.0], up: [0, 0, 1], fov: 55 }}>
          <color attach="background" args={["#f8fafc"]} />
          <ambientLight intensity={0.7} />
          <pointLight position={[3, 4, 5]} intensity={0.7} />
          <CoordinateAxes />
          <Suspense fallback={<Html center>加载点云</Html>}>
            <group scale={1.35}>
              {props.points.map((point) => (
                <VectorDot
                  key={point.id}
                  point={point}
                  active={props.selectedPoint?.id === point.id}
                  highlighted={props.highlightedIds.has(point.id)}
                  faded={props.queryResult != null && !props.highlightedIds.has(point.id)}
                  onClick={() => props.onSelectPoint(point)}
                />
              ))}
              {props.queryResult && (
                <>
                  {props.points
                    .filter((p) => props.highlightedIds.has(p.id))
                    .map((p) => (
                      <Line
                        key={`conn-${p.id}`}
                        points={[
                          [props.queryResult!.query_point.x, props.queryResult!.query_point.y, props.queryResult!.query_point.z],
                          [p.x, p.y, p.z],
                        ]}
                        color="#c4b5fd"
                        lineWidth={1}
                        opacity={0.85}
                        transparent
                      />
                    ))}
                  <mesh position={[props.queryResult.query_point.x, props.queryResult.query_point.y, props.queryResult.query_point.z]}>
                    <sphereGeometry args={[0.075, 24, 24]} />
                    <meshStandardMaterial color="#ffffff" roughness={0.2} emissive="#7c3aed" emissiveIntensity={0.8} />
                  </mesh>
                </>
              )}
            </group>
          </Suspense>
          <OrbitControls makeDefault />
        </Canvas>
      </div>
      <div className="panel detail-panel">
        <h2>点详情</h2>
        {props.selectedPoint ? (
          <>
            <div className="tag-row">
              <span>{props.selectedPoint.id}</span>
              {props.selectedPoint.score != null && <span>{props.selectedPoint.score.toFixed(3)}</span>}
            </div>
            <p className="body-text">{props.selectedPoint.document}</p>
            <pre>{JSON.stringify(props.selectedPoint.metadata, null, 2)}</pre>
          </>
        ) : (
          <EmptyState text="选择一个向量点" />
        )}
      </div>
    </section>
  );
}

function VectorDot({ point, active, highlighted, faded, onClick }: { point: Point3D; active: boolean; highlighted: boolean; faded: boolean; onClick: () => void }) {
  const color = active ? "#e11d48" : highlighted ? "#f59e0b" : colorBySource(String(point.metadata.source ?? point.id));
  const size = active ? 0.065 : highlighted ? 0.07 : faded ? 0.032 : 0.038;
  return (
    <mesh position={[point.x, point.y, point.z]} onClick={(event) => { event.stopPropagation(); onClick(); }}>
      <sphereGeometry args={[size, 20, 20]} />
      <meshStandardMaterial
        color={color}
        roughness={highlighted ? 0.15 : 0.45}
        emissive={highlighted ? "#f59e0b" : "#000000"}
        emissiveIntensity={highlighted ? 0.55 : 0}
        transparent
        opacity={faded ? 0.35 : 1}
        depthWrite={!faded}
      />
    </mesh>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: Array<Array<string | number>> }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}

function viewTitle(view: string) {
  const titles: Record<string, string> = {
    overview: "知识库总览",
    upload: "上传文档并解析",
    ocr: "MinerU OCR 解析可视化",
    chunks: "Chunk 切分可视化",
    chroma: "Chroma 数据内容",
    space: "3D 向量空间",
    query: "查询可视化",
  };
  return titles[view] ?? "可视化";
}

function typeColor(type: string): string {
  const t = type.split(",")[0].toLowerCase();
  if (t === "title") return "#0d53de";
  if (t === "table") return "#059669";
  if (t === "formula") return "#7c3aed";
  if (t === "footnote" || t === "image_footnote") return "#a4a4a4";
  return "#2563eb";
}

function colorBySource(source: string) {
  const palette = ["#2563eb", "#059669", "#dc2626", "#7c3aed", "#0891b2", "#ca8a04"];
  const hash = [...source].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return palette[hash % palette.length];
}

function extractTextFromMineruBlock(block: Record<string, unknown>): string {
  for (const key of ["text", "content", "html", "latex"]) {
    const value = block[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  const lineTexts: string[] = [];
  const lines = block.lines;
  if (Array.isArray(lines)) {
    for (const line of lines) {
      if (!line || typeof line !== "object") continue;
      const lineObj = line as Record<string, unknown>;
      if (typeof lineObj.content === "string" && lineObj.content.trim()) {
        lineTexts.push(lineObj.content.trim());
        continue;
      }
      const spanParts: string[] = [];
      const spans = lineObj.spans;
      if (Array.isArray(spans)) {
        for (const span of spans) {
          if (!span || typeof span !== "object") continue;
          const spanObj = span as Record<string, unknown>;
          for (const spanKey of ["content", "text", "html", "latex"]) {
            const spanValue = spanObj[spanKey];
            if (typeof spanValue === "string" && spanValue.trim()) {
              spanParts.push(spanValue.trim());
              break;
            }
          }
        }
      }
      if (spanParts.length) lineTexts.push(spanParts.join(""));
    }
  }
  if (lineTexts.length) return lineTexts.join("\n");

  for (const key of ["blocks", "sub_blocks", "children"]) {
    const nested = block[key];
    if (!Array.isArray(nested)) continue;
    const nestedTexts = nested
      .filter((item) => item && typeof item === "object")
      .map((item) => extractTextFromMineruBlock(item as Record<string, unknown>))
      .filter(Boolean);
    if (nestedTexts.length) return nestedTexts.join("\n");
  }

  return "";
}

function resolveBlockText(block: OcrBlock) {
  const direct = block.text?.trim();
  if (direct) return direct;
  if (block.raw) return extractTextFromMineruBlock(block.raw);
  return "";
}

function extractNativeMarkdown(nativeResult: Record<string, unknown> | null) {
  if (!nativeResult) return "";
  for (const key of ["markdown_content", "md_content", "markdown"]) {
    const value = nativeResult[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function isMetadataText(text: string) {
  return /DOI|ISSN|cnki\.net|学报|期刊|年第\s*\d+\s*期/i.test(text) && text.length < 320;
}

function formatSectionLabel(text: string) {
  const match = text.match(/^([^:：]+[:：])([\s\S]*)$/);
  if (!match) return text;
  return `**${match[1]}**${match[2]}`;
}

function collectMarkdownBlocks(pages: OcrPage[]): MarkdownBlockItem[] {
  const items: MarkdownBlockItem[] = [];
  let titleCount = 0;

  for (const page of pages) {
    for (const block of page.blocks) {
      const text = resolveBlockText(block);
      if (!text) continue;

      const type = block.type.split(",")[0].toLowerCase();
      let markdown = text;
      let variant: MarkdownBlockItem["variant"] = "body";

      if (isMetadataText(text)) {
        variant = "meta";
      } else if (type === "title") {
        titleCount += 1;
        variant = "title";
        if (titleCount === 1) markdown = `# ${text}`;
        else if (titleCount === 2) markdown = `## ${text}`;
        else markdown = `### ${text}`;
      } else if (type === "table") {
        variant = "table";
        markdown = text.includes("|") ? text : text.replace(/\s*\|\s*/g, " | ").replace(/\n/g, "\n| ");
      } else if (type === "formula") {
        variant = "formula";
        markdown = `$$\n${text}\n$$`;
      } else if (/^(内容提要|关键词|Abstract|Keywords)[:：]/.test(text)) {
        variant = "section";
        markdown = formatSectionLabel(text);
      }

      items.push({ block, pageNo: page.page_no, markdown, variant });
    }
  }

  return items;
}

function pagesToMarkdown(pages: OcrPage[]) {
  return collectMarkdownBlocks(pages).map((item) => item.markdown).join("\n\n");
}

function mapBboxToSurface(
  bbox: [number, number, number, number],
  sourceWidth: number,
  sourceHeight: number,
  surfaceWidth: number,
  surfaceHeight: number,
  metrics: PageRenderMetrics | null,
) {
  const [x1, y1, x2, y2] = bbox;
  const bboxWidth = x2 - x1;
  const bboxHeight = y2 - y1;

  if (metrics?.pdfWidth && metrics.pdfHeight && metrics.pdfScale) {
    const pdfX1 = (x1 / sourceWidth) * metrics.pdfWidth;
    const pdfY1 = (y1 / sourceHeight) * metrics.pdfHeight;
    const pdfX2 = (x2 / sourceWidth) * metrics.pdfWidth;
    const pdfY2 = (y2 / sourceHeight) * metrics.pdfHeight;
    const offsetX = metrics.offsetX ?? 0;
    const offsetY = metrics.offsetY ?? 0;
    return {
      left: offsetX + pdfX1 * metrics.pdfScale,
      top: offsetY + pdfY1 * metrics.pdfScale,
      width: (pdfX2 - pdfX1) * metrics.pdfScale,
      height: (pdfY2 - pdfY1) * metrics.pdfScale,
    };
  }

  // Detect coordinate system: if bbox exceeds source dimensions, it's likely in PDF/image pixels
  if (bboxWidth > sourceWidth || bboxHeight > sourceHeight) {
    // Bbox is in actual pixels (PDF or image), need to scale to surface
    const scaleX = surfaceWidth / sourceWidth;
    const scaleY = surfaceHeight / sourceHeight;
    const scale = Math.min(scaleX, scaleY);
    const offsetX = (surfaceWidth - sourceWidth * scale) / 2;
    const offsetY = (surfaceHeight - sourceHeight * scale) / 2;
    return {
      left: offsetX + x1 * scale,
      top: offsetY + y1 * scale,
      width: bboxWidth * scale,
      height: bboxHeight * scale,
    };
  }

  // Normalize from source space to surface space
  return {
    left: (x1 / sourceWidth) * surfaceWidth,
    top: (y1 / sourceHeight) * surfaceHeight,
    width: ((x2 - x1) / sourceWidth) * surfaceWidth,
    height: ((y2 - y1) / sourceHeight) * surfaceHeight,
  };
}

function assetUrl(fileUrl: string) {
  if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
    return fileUrl;
  }
  return `${API_BASE_URL}${fileUrl.startsWith("/") ? fileUrl : `/${fileUrl}`}`;
}

function markUploadStep(steps: UploadStep[], key: string, status: UploadStepStatus, detail: string) {
  return steps.map((step) => {
    if (step.key === key) {
      return { ...step, status, detail };
    }
    return step;
  });
}

function completeUploadSteps(steps: UploadStep[], finalDetail: string, mineruSucceeded: boolean) {
  return steps.map((step) => {
    if (step.key === "visualize") {
      return { ...step, status: "done" as const, detail: "OCR blocks、页面结构和 chunks 已生成" };
    }
    if (step.key === "poll") {
      return { ...step, status: mineruSucceeded ? "done" as const : "error" as const, detail: finalDetail };
    }
    if (step.status === "pending" || step.status === "running") {
      return { ...step, status: "done" as const, detail: step.status === "pending" ? "已完成" : step.detail };
    }
    return step;
  });
}

function failRunningUploadStep(steps: UploadStep[], error: string) {
  const runningIndex = steps.findIndex((step) => step.status === "running");
  const targetIndex = runningIndex >= 0 ? runningIndex : steps.findIndex((step) => step.status === "pending");
  return steps.map((step, index) => {
    if (index === targetIndex) {
      return { ...step, status: "error" as const, detail: error };
    }
    return step;
  });
}

function focusChunk(
  chunk: Chunk,
  pages: OcrPage[],
  setSelectedPageNo: (pageNo: number) => void,
  _setSelectedBlock: (block: OcrBlock) => void,
  setActiveView: (view: string) => void,
  pendingRef: React.MutableRefObject<{ block?: OcrBlock; pageNo: number; deferScroll?: boolean; chunkId?: string; blkId?: string } | null>,
  setPendingVersion: (updater: (v: number) => number) => void,
) {
  const targetPage = Number(chunk.metadata.page);
  const blockId = String(chunk.metadata.block_id ?? "");
  const metaChunkId = String(chunk.metadata.chunk_id ?? "");
  const searchIds = [chunk.id];
  if (metaChunkId && metaChunkId !== chunk.id) searchIds.push(metaChunkId);

  function commit(pageNo: number, block: OcrBlock) {
    setSelectedPageNo(pageNo);
    pendingRef.current = { block, pageNo, deferScroll: true };
    setPendingVersion((v) => v + 1);
    setActiveView("ocr");
  }

  // Strategy 1: search all pages for block whose chunk_ids contains the chunk id
  for (const page of pages) {
    const block = page.blocks.find((item) => item.chunk_ids.some((cid) => searchIds.includes(cid)));
    if (block) {
      commit(page.page_no, block);
      return;
    }
  }

  // Strategy 2: find block by block_id on the target page (from chunk metadata)
  if (!isNaN(targetPage) && targetPage > 0 && blockId) {
    const page = pages.find((p) => p.page_no === targetPage);
    if (page) {
      const block = page.blocks.find((b) => b.id === blockId);
      if (block) {
        commit(targetPage, block);
        return;
      }
    }
  }

  // Strategy 3: find any block on the target page that matches searchIds (loose match)
  if (!isNaN(targetPage) && targetPage > 0) {
    const page = pages.find((p) => p.page_no === targetPage);
    if (page) {
      const block = page.blocks.find((item) => item.chunk_ids.some((cid) => searchIds.includes(cid)));
      if (block) {
        commit(targetPage, block);
        return;
      }
    }
  }

  // Fallback / pages empty: set pending target for OCR page to resolve after loading
  if (!isNaN(targetPage) && targetPage > 0) {
    setSelectedPageNo(targetPage);
    pendingRef.current = { pageNo: targetPage, deferScroll: true, chunkId: chunk.id, blkId: blockId };
    setPendingVersion((v) => v + 1);
  }
  setActiveView("ocr");
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
