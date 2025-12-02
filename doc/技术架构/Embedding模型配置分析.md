# Embedding 模型配置分析

> 适用版本：`promptx-agenticRag`（DeeChat）主干，基于 `analysis-embeddings-config-promptx-agenticRag` 分支代码。

## 1. 当前默认的 Embedding 模型

| 模型 ID | 来源 | 大小/下载量 | `maxConcurrentChunks` | `embeddingMaxChunkLength` | 备注 |
| --- | --- | --- | --- | --- | --- |
| `Xenova/all-MiniLM-L6-v2` | HuggingFace（Xenova 适配） | 23 MB | 25 | 1,000 字符（≈512 token） | 系统默认；轻量、CPU 推理；`server/utils/EmbeddingEngines/native/constants.js` |
| `Xenova/nomic-embed-text-v1` | HuggingFace | 139 MB | 5 | 16,000 字符（≈8,192 token） | 需要更多内存/CPU，支持查询、文档前缀 |
| `MintplexLabs/multilingual-e5-small` | HuggingFace（intfloat/e5） | 487 MB | 5 | 1,000 字符 | 覆盖 100+ 语言，吞吐大幅降低 |

- 默认 engine：未设置 `EMBEDDING_ENGINE` 时，`getEmbeddingEngineSelection()` 会回退到 `NativeEmbedder`（`server/utils/helpers/index.js:291-339`）。
- 默认模型：`NativeEmbedder.defaultModel = "Xenova/all-MiniLM-L6-v2"`，除非 `EMBEDDING_MODEL_PREF` 被覆盖（`server/utils/EmbeddingEngines/native/index.js`）。
- 模型元信息（语言、描述、HuggingFace model card）在 `server/utils/EmbeddingEngines/native/constants.js` 中硬编码，可直接用于前端下拉和文档展示。

## 2. 配置入口与参数

### 2.1 环境变量

- `EMBEDDING_ENGINE`：`native` / `openai` / `azure` / `localai` / `ollama` / `lmstudio` / `cohere` / `voyageai` / `litellm` / `mistral` / `generic-openai` / `gemini`（`docker/.env.example`、`server/.env.example`）。
- `EMBEDDING_MODEL_PREF`：模型 ID 或远端部署名（OpenAI/Azure 需填部署名而非 base model）。
- `EMBEDDING_BASE_PATH`：本地/代理型引擎的 HTTP base URL。
- `EMBEDDING_MODEL_MAX_CHUNK_LENGTH`：当使用远端 API（LocalAI、Ollama 等）时，限制单段长度，避免 4xx。
- `GENERIC_OPEN_AI_EMBEDDING_MAX_CONCURRENT_CHUNKS`、`GENERIC_OPEN_AI_EMBEDDING_API_DELAY_MS` 等用于限流。

### 2.2 系统设置接口

`server/models/systemSettings.js` 会在 `/api/system/settings` 返回：

- `EmbeddingEngine`、`EmbeddingModelPref`、`EmbeddingModelMaxChunkLength`、`HasExistingEmbeddings` 等字段（行 196-275）。
- Admin 前端通过 `frontend/src/pages/GeneralSettings/EmbeddingPreference` 读取并写入这些字段。

### 2.3 载入流程

1. `getLLMProvider()` -> `getEmbeddingEngineSelection()`（`server/utils/helpers/index.js`）。
2. `NativeEmbedder` 构造时：
   - 计算缓存目录 `storage/models/<model-id>`；首次不存在会自动下载。
   - 使用 `@xenova/transformers` `pipeline('feature-extraction')` 加载模型；失败时切换到 Mintplex CDN 备用源（`NativeEmbedder.#fetchWithHost`）。
   - 记录 `maxConcurrentChunks`、`embeddingMaxChunkLength` 给 `TextSplitter`。

## 3. 资源占用分析

### 3.1 内存 / CPU 行为

- `embedChunks()`（`server/utils/EmbeddingEngines/native/index.js:233-279`）在注释中记录了基准：
  - 测试硬件：AWS t3.small（2 GB RAM / 1 vCPU）。
  - 并发批次 25（MiniLM 默认），大文档（>100k 单词）时常驻内存 ~30%，GC 前峰值 ~70%。
  - 为避免一次性占满内存，算法将结果写入临时文件，再整体读回。
- 进程纯 CPU 推理，无 GPU/AVX 加速；`@xenova/transformers` 使用 WebAssembly + WASM-BLAS，首次加载需编译/初始化，会短暂吃满单核。
- 大模型（`nomic-embed-text-v1`、`multilingual-e5-small`）把 `maxConcurrentChunks` 降到 5，仍会显著增加：
  - 下载体积 140 MB~487 MB。
  - 推理时间与内存均翻倍甚至三倍，低内存主机易触发 GC 抖动。

### 3.2 Chunk 大小与切分策略

- `TextSplitter.determineMaxChunkSize()` 会取系统配置与 `embeddingMaxChunkLength` 的较小值（`server/utils/vectorDbProviders/lance/index.js:313-332`）。
- 默认 `text_splitter_chunk_size = 1,000`（`systemSettings` 校验逻辑），与 MiniLM 的 1,000 字符上限一致，减少单次推理爆内存。

### 3.3 触发嵌入的流程

- 文档入库：`LanceDb.addDocumentToNamespace()` 调用 `EmbedderEngine.embedChunks()`，每 500 向量批量入库（行 276-375）。
- 查询：`LanceDb.performSimilaritySearch()` 先用 `LLMConnector.embedTextInput()` 生成查询向量，再做向量检索（行 380-430）。
- Rerank：`NativeEmbeddingReranker` 也依赖本地 `Xenova` 模型，为 rerank 再执行一轮 embedding（`server/utils/vectorDbProviders/lance/index.js:70-141`）。

综上，任何文档导入或查询都离不开本地 CPU embedding，资源消耗与工作区文档数、chunk 数量成线性关系。

## 4. 向量数据库配置

- 默认 `VECTOR_DB="lancedb"`（`server/.env.example` 明确未注释；`getVectorDbClass()` 回退到 `LanceDb`）。
- LanceDB 客户端：`server/utils/vectorDbProviders/lance/index.js`
  - 数据路径：`<STORAGE_DIR>/lancedb`（或 `./storage/lancedb`）。
  - 依赖 `apache-arrow`、`@lancedb/lancedb` 原生扩展，需现代 CPU 指令集。
  - Namespace = Workspace ID，向量条目包含 `id`, `vector`, `metadata.text`。
  - 支持相似度+rerank、命名空间删除、缓存（`storeVectorResult/cachedVectorInformation`）。
- 可选数据库：Chroma、Chroma Cloud、Pinecone、pgvector、Weaviate、Qdrant、Milvus、Zilliz、Astra —— 通过 `.env` 切换（`docker/.env.example`）。

## 5. 低配 CPU 可能无法启动的原因

1. **原生嵌入依赖现代指令集**：Dockerfile 专门设置 `CFLAGS="-march=x86-64 -mtune=generic"` 来兼容 Intel Xeon E5-2650 v2 等老 CPU，并在注释中说明必须避免 AVX2/AVX-512 `Illegal instruction`（`docker/Dockerfile:147-151`）。如果在宿主上直接运行或安装二进制依赖（`@lancedb/lancedb`, `apache-arrow`, `@xenova/transformers`）时未做此限制，缺少 AVX/SSE4.2 的老机器会直接崩溃。
2. **CPU/memory 峰值高**：`NativeEmbedder` 在 t3.small 上已可冲到 70% 内存，再加上 Node 主进程、Prisma、LanceDB 占用，很容易把 1 GB~2 GB 主机推到 OOM；当 GC 来不及回收时，容器会被系统杀死或阻塞启动。
3. **I/O 与磁盘压力**：模型缓存（23–487 MB）+ LanceDB 本地 Arrow 文件全部落在同一磁盘；低速 HDD + 低 CPU 的组合会导致首次启动长时间“卡住”，常被误判为启动失败。
4. **Rerank 双倍计算**：开启“语义重排”时，同一查询会先执行一次查询向量，再执行 rerank embedding，低配 CPU 会出现请求堆积。

## 6. 建议与排查思路

- **低配环境优先改用云端 embedding**（OpenAI `text-embedding-3-large`/`small`、Cohere、VoyageAI 等），通过 `EMBEDDING_ENGINE=openai` 等方式把计算卸载到外部。
- 若必须使用本地：
  - 选用 `Xenova/all-MiniLM-L6-v2`，保持 `text_splitter_chunk_size <= 1000`，并避免一次导入超大文档。
  - 关闭 rerank 或调低 `topN`，减少重复 embedding。
  - 检查宿主 CPU 是否至少支持 SSE4.2；对极老 CPU，可在本地编译依赖时手动设置 `CFLAGS`（参考 Dockerfile）。
- **向量库调优**：对于 LanceDB，确保磁盘 IOPS 充足，或切换到 Pinecone/Qdrant 这类托管数据库，降低本地 CPU/IO 压力。

---

如需进一步压缩占用，可考虑：

1. 把 `maxConcurrentChunks` 下调（修改 `SUPPORTED_NATIVE_EMBEDDING_MODELS`）。
2. 使用更小的模型（如 MiniLM），或将 embedding 迁移到 `LiteLLM`/`Generic OpenAI` 代理。
3. 在 collector 端做更 aggressive 的 chunking，减少需要嵌入的 token 总量。
