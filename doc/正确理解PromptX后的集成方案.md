# 🎯 正确理解 PromptX 后的集成方案

**核心认知**: PromptX 是 **AI 能力增强平台**，不是聊天应用！

**日期**: 2025-11-25
**版本**: Correct Final 1.0

---

## 💡 关键理解

### PromptX 是什么?

```
PromptX = AI 能力包
  ├── 角色系统 (让 AI 成为专家)
  ├── 认知记忆 (让 AI 能学习和回忆)
  └── 工具运行时 (让 AI 使用工具)
```

**NOT**:
- ❌ 不是聊天应用
- ❌ 不是 Agent 框架
- ❌ 不是 LLM 调用层

**BUT**:
- ✅ 通过 MCP 协议为 AI 应用注入能力
- ✅ 提供 6 个核心 MCP 工具
- ✅ 让现有 AI (Claude/Cursor) 变得更强大

### PromptX 的 6 个 MCP 工具

```
1. discover    - 查看可用角色和工具
2. action      - 激活角色 (加载专家视角)
3. recall      - 检索记忆 (调取历史经验)
4. remember    - 保存记忆 (积累新知识)
5. project     - 绑定项目目录
6. toolx       - 执行专用工具
```

---

## 🏗️ DeeChat + PromptX 正确架构

### 核心思路

```
DeeChat 的 LLM (Claude/GPT)
  ↓ 配置 MCP
启用 PromptX MCP Server
  ↓
LLM 自动获得 PromptX 的 6 个工具
  ↓
LLM 在需要时调用这些工具
```

**关键**: PromptX 是 **工具集**，不是执行层！

---

## 💻 正确的实施方案

### 方案架构

```
用户输入
  ↓
stream.js (保留基础流程)
  ├─ 步骤 1-6: 命令、初始化、历史 ✅
  │
  ├─ 步骤 7: 配置 LLM 时添加 PromptX MCP ⭐
  │   const LLMConnector = getLLMProvider({
  │     provider: workspace.chatProvider,
  │     model: workspace.chatModel,
  │     mcpServers: {  // 🔥 关键!
  │       promptx: {
  │         command: 'promptx',
  │         args: ['mcp-server'],
  │         env: {
  │           PROMPTX_PROJECT_DIR: workspace.workspaceDirectory
  │         }
  │       }
  │     }
  │   });
  │
  ├─ 步骤 8-10: 文档检索 (优化为可选) ✅
  │   - 不强制执行
  │   - 提供为工具让 LLM 调用
  │
  └─ 步骤 11-16: LLM 调用和响应 ✅
       - LLM 自己决定是否调用 PromptX 工具
       - LLM 自己决定是否搜索文档
```

### 核心改动

#### 1. 修改 getLLMProvider 支持 MCP

**文件**: `server/utils/helpers/index.js`

找到 `getLLMProvider` 函数,修改为:

```javascript
function getLLMProvider({ provider, model, mcpServers = null }) {
  const LLMProvider = getProviderClass(provider);

  // 创建 LLM 实例
  const llm = new LLMProvider({
    model: model,
    // ... 其他配置
  });

  // 🔥 如果提供了 MCP 服务器配置,注入
  if (mcpServers) {
    llm.configureMCP(mcpServers);
  }

  return llm;
}
```

#### 2. 在 stream.js 中配置 PromptX

**文件**: `server/utils/chats/stream.js`

在第 83-87 行,修改 LLM 初始化:

```javascript
// 🔥 第三步：初始化AI提供商 (增强版)
const LLMConnector = getLLMProvider({
  provider: workspace?.chatProvider,
  model: workspace?.chatModel,

  // 🔥 如果工作空间有目录,配置 PromptX MCP
  mcpServers: workspace?.workspaceDirectory ? {
    promptx: {
      command: 'promptx',
      args: ['mcp-server'],
      env: {
        PROMPTX_PROJECT_DIR: workspace.workspaceDirectory,
        ...process.env
      }
    }
  } : null
});
```

#### 3. 将文档检索改为工具

**关键**: 不删除检索逻辑,而是包装为 **工具函数**,让 LLM 调用

**新建文件**: `server/utils/chats/tools/document-search.js`

```javascript
/**
 * 文档搜索工具
 * 提供给 LLM 调用,按需检索文档
 */
async function searchDocuments({ workspace, query, topN = 4 }) {
  const { getVectorDbClass } = require("../../helpers");
  const VectorDb = getVectorDbClass();

  const hasVectorSpace = await VectorDb.hasNamespace(workspace.slug);
  if (!hasVectorSpace) {
    return { found: 0, documents: [] };
  }

  // 复用原来的检索逻辑
  const { contextTexts, sources } = await VectorDb.performSimilaritySearch({
    namespace: workspace.slug,
    input: query,
    topN: topN,
    similarityThreshold: workspace?.similarityThreshold || 0.25,
  });

  return {
    found: sources.length,
    documents: sources.map(s => ({
      title: s.title || '未知',
      content: s.text,
      score: s.score
    }))
  };
}

module.exports = { searchDocuments };
```

#### 4. 注册工具到 LLM

**文件**: `server/utils/chats/stream.js`

在调用 LLM 前,注册工具:

```javascript
// 🔥 第十一步: 构建聊天提示词 (增强版)
const systemPrompt = await chatPrompt(workspace, user);

// 🔥 定义可用工具
const tools = [];

// 文档搜索工具
if (hasVectorizedSpace) {
  tools.push({
    name: 'search_documents',
    description: '在工作空间的文档库中搜索相关信息。适用于需要查找具体文档内容的问题。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索查询词'
        },
        topN: {
          type: 'number',
          description: '返回最相关的N个文档片段',
          default: 4
        }
      },
      required: ['query']
    },
    handler: async (args) => {
      return await searchDocuments({
        workspace,
        query: args.query,
        topN: args.topN || 4
      });
    }
  });
}

// 🔥 第十四步: 调用 LLM 流式生成 (增强版)
const stream = await LLMConnector.streamGetChatCompletion(
  chatHistory,
  {
    systemPrompt,
    tools: tools,  // 🔥 传递工具列表
  }
);
```

#### 5. 增强 System Prompt

**文件**: `server/utils/chats/index.js`

在 `chatPrompt` 函数中,添加 PromptX 使用指南:

```javascript
async function chatPrompt(workspace, user) {
  // ... 原有的 prompt 构建

  let finalPrompt = basePrompt + contextPrompt;

  // 🔥 如果启用了 PromptX,添加使用说明
  if (workspace?.workspaceDirectory) {
    finalPrompt += `

## 🎭 PromptX 专业能力

你已经集成了 PromptX,拥有以下专业能力:

### 可用工具

- **promptx-discover**: 查看当前工作空间的专业角色
  用法: 当用户问题需要专业领域知识时,先查看有什么角色

- **promptx-action**: 激活专业角色
  用法: 激活后,你将获得该角色的专业知识、思维模式、工作原则
  示例: 用户问"合同风险" → 激活 risk-analyst

- **promptx-recall**: 从角色记忆中检索经验
  用法: 激活角色后,检索该角色的历史经验
  示例: recall({ role: "risk-analyst", query: "付款风险" })

- **promptx-remember**: 保存重要发现到角色记忆
  用法: 完成专业分析后,保存新知识供未来使用

- **promptx-project**: 绑定项目目录 (已自动配置)

- **search_documents**: 在文档库中搜索
  用法: 需要查找具体文档内容时使用

### 使用原则

1. **智能判断**: 只在需要时使用工具
   - 简单问答 → 直接回答,不用工具
   - 文档查询 → 用 search_documents
   - 专业分析 → 用 promptx-* 工具

2. **专业场景流程**:
   a. 用 promptx-discover 查看可用角色
   b. 用 promptx-action 激活合适的角色
   c. 用 promptx-recall 检索角色经验
   d. 用 search_documents 搜索文档
   e. 综合分析给出答案
   f. 用 promptx-remember 保存新发现

3. **保持自然**: 工具调用应该无缝,不要让用户感觉机械

### 示例场景

用户: "这份合同的付款风险在哪里?"

你的思考:
  1. 这是专业风险分析
  2. 调用 promptx-discover 看看有什么角色
  3. 发现有 risk-analyst
  4. 调用 promptx-action({ role: "risk-analyst" })
  5. 调用 promptx-recall({ query: "付款风险" })
  6. 调用 search_documents({ query: "付款条款 违约责任" })
  7. 综合分析
  8. 调用 promptx-remember 保存发现
`;
  }

  return finalPrompt;
}
```

---

## 📊 流程对比

### 优化前 (强制检索)

```
用户: "你好"
  ↓
执行向量检索 (浪费!)
  ↓
注入大量上下文 (浪费!)
  ↓
调用 LLM
  ↓
"你好!我是..."

Tokens: ~3000
```

### 优化后 (智能决策)

```
用户: "你好"
  ↓
LLM 判断: 不需要工具
  ↓
直接回答
  ↓
"你好!我是..."

Tokens: ~500
```

```
用户: "这份合同的风险?"
  ↓
LLM 判断: 需要专业角色
  ↓
调用 promptx-discover
  ↓
调用 promptx-action({ role: "risk-analyst" })
  ↓
调用 promptx-recall({ query: "付款风险" })
  ↓
调用 search_documents({ query: "付款条款" })
  ↓
综合分析
  ↓
调用 promptx-remember
  ↓
"作为专业风险审查员..."

Tokens: ~1500
```

---

## 📁 工作空间结构

```
storage/workspaces/workspace-{id}-{slug}/
├── documents/              # 原始文档
├── lancedb/               # 向量数据库
└── .promptx/              # PromptX 资源
    ├── roles/             # 角色定义
    │   ├── risk-analyst.yml
    │   └── clause-extractor.yml
    ├── tools/             # 自定义工具
    └── cognition/         # 记忆数据
        └── {role-id}/
            └── memory-network.json
```

---

## 🎯 实施清单

### Phase 1: 数据库 (30分钟)

```sql
ALTER TABLE workspaces ADD COLUMN workspace_directory VARCHAR(500);

UPDATE workspaces
SET workspace_directory = CONCAT('./storage/workspaces/workspace-', id, '-', slug)
WHERE workspace_directory IS NULL;
```

### Phase 2: LLM Provider 增强 (1小时)

1. 修改 `getLLMProvider` 支持 mcpServers 参数
2. 在 `stream.js` 中配置 PromptX MCP
3. 测试 MCP 连接

### Phase 3: 工具化文档检索 (2小时)

1. 创建 `tools/document-search.js`
2. 在 stream.js 中注册工具
3. 移除强制检索逻辑 (步骤 7-10)
4. 测试工具调用

### Phase 4: System Prompt 增强 (1小时)

1. 在 `chatPrompt` 中添加 PromptX 指南
2. 说明 6 个 PromptX 工具的用法
3. 提供使用示例

### Phase 5: 角色定义 (1小时)

1. 在工作空间创建 `.promptx/roles/`
2. 定义示例角色 (risk-analyst, clause-extractor)
3. 测试角色激活

### Phase 6: 测试验证 (2小时)

1. 测试简单对话 (不应调用工具)
2. 测试文档查询 (应调用 search_documents)
3. 测试专业分析 (应调用 promptx-*)
4. 验证 token 节省效果

**总计: 7-8 小时 (1天)**

---

## ✅ 关键代码改动

| 文件 | 改动 | 行数 |
|------|------|-----|
| 数据库迁移 | 新增 | ~20行 |
| workspace.js | 修改 | +10行 |
| helpers/index.js | 修改 getLLMProvider | +20行 |
| stream.js | 配置 MCP + 工具注册 | +40行 |
| tools/document-search.js | 新建 | ~60行 |
| chats/index.js | 增强 System Prompt | +80行 |
| **总计** | | **~230行** |

---

## 🎓 核心认知总结

### PromptX 的定位

```
PromptX ≠ Agent 框架
PromptX ≠ 聊天应用
PromptX ≠ LLM 封装

PromptX = AI 能力包
  通过 MCP 协议
  为现有 AI 注入
  角色 + 记忆 + 工具
```

### DeeChat 的角色

```
DeeChat 是聊天应用
  ↓
使用 LLM (Claude/GPT)
  ↓
通过 MCP 配置 PromptX
  ↓
LLM 获得专业能力
  ↓
LLM 自主决策何时使用
```

### 集成的本质

**不是**: 把 PromptX 当作 Agent 框架使用
**而是**: 给 DeeChat 的 LLM 配置 PromptX MCP 服务器

**一行配置,能力加倍!**

```javascript
mcpServers: {
  promptx: {
    command: 'promptx',
    args: ['mcp-server']
  }
}
```

---

## 🌟 与原设计的完美契合

**原始设计** (`promptx+agenticRAG.md`):
```
Workspace = Domain
Roles = Experts
Tools = VectorDB Access
Orchestrator = Smart Dispatch
```

**我们的实现**:
```
Workspace ✅ (独立目录)
Roles ✅ (PromptX 角色)
Tools ✅ (search_documents + PromptX 工具)
Orchestrator ✅ (LLM 自主决策)
```

**完美实现,极致简洁!**

---

**这才是正确的理解和方案!** 🎯
