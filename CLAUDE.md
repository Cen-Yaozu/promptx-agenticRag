# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**重要提醒**: 在启动或重启任何服务之前,必须先征得用户同意。不要自行启动终端操作或清理进程。

## Project Overview

**DeeChat (promptx-agenticRag)** - 基于"深度实践"理念的智能对话助手平台,通过 Agentic RAG (检索增强生成) 将私有文档转换为智能对话体验。

**核心架构**: 三服务全栈应用
- **Server** (Node.js/Express) - 主API服务器,端口3001
- **Frontend** (React 18/Vite) - 用户界面,端口3000
- **Collector** - 独立的文档处理服务,负责文件解析和向量化

## Development Commands

### 环境设置与启动
```bash
# 完整设置(安装依赖并配置环境)
yarn setup

# 单独启动服务
yarn dev:server          # 启动后端服务器 (端口 3001)
yarn dev:frontend        # 启动前端开发服务器 (端口 3000)
yarn dev:collector       # 启动文档收集服务
yarn dev:all             # 同时启动所有服务

# 数据库操作
yarn prisma:generate     # 生成 Prisma Client
yarn prisma:migrate      # 运行数据库迁移
yarn prisma:seed         # 播种初始数据
yarn prisma:setup        # 完整数据库初始化(包含上述三步)
yarn prisma:reset        # 重置数据库
```

### 代码质量与构建
```bash
yarn lint                # 运行 ESLint 检查(检查所有三个服务)
yarn build               # 构建前端生产版本
yarn start               # 启动生产服务器
yarn verify:translations # 验证国际化翻译文件
yarn normalize:translations # 标准化翻译文件
```

### Docker 部署
```bash
docker-compose up -d     # 使用默认配置启动(包含Qdrant)
# 或使用特定向量数据库
docker-compose -f docker-compose.qdrant.yml up -d
docker-compose -f docker-compose.chromadb.yml up -d
```

## Core Architecture

### 三服务架构模式
- **Server/** - Express.js API服务器,提供核心对话功能
- **Frontend/** - React SPA,用户界面和实时聊天
- **Collector/** - 独立文档处理服务,处理文件解析和向量化

### 核心概念
- **Workspace (对话空间)** - 核心业务隔离单元,采用"一个空间一个对话"设计
- **PromptX 集成** - 角色驱动的对话系统,支持智能代理编排
- **MCP 支持** - Model Context Protocol,用于外部工具集成和插件架构
- **Aibitat 代理框架** - 自定义的多代理对话框架,支持工具调用和插件系统

### 数据库架构
- **SQLite** (通过 Prisma) - 存储位置: `server/storage/anythingllm.db`
- **核心模型**:
  - `workspaces` - 对话空间管理
  - `workspace_promptx_roles` - PromptX角色配置(工作区级权限)
  - `workspace_promptx_configs` - 工作区PromptX配置(支持启用所有角色模式)
  - `workspace_chats` - 聊天历史
  - `workspace_documents` - 文档管理
  - `users` - 用户认证和授权
  - `system_settings` - 系统配置

## Backend Structure

### 主要目录
- `server/endpoints/` - API路由定义,每个文件对应一组相关的端点
- `server/models/` - Prisma数据库模型
- `server/utils/` - 工具服务和核心功能
- `server/utils/agents/` - Aibitat代理框架实现
- `server/utils/MCP/` - MCP协议实现和集成
- `server/prisma/` - 数据库schema和迁移文件
- `server/storage/` - 运行时存储(数据库、文件、插件配置等)

### 关键API模块 (server/endpoints/)
- `system.js` - 系统管理和配置
- `workspaces.js` - 工作区CRUD操作
- `chat.js` - 实时聊天功能,支持WebSocket
- `workspacePromptXRoles.js` - PromptX角色管理API
- `deeconfig.js` - DeeChat配置管理(新配置系统)
- `mcpServers.js` - MCP服务器管理
- `agentWebsocket.js` - 代理WebSocket连接

### 核心工具服务 (server/utils/)
- `workspaceRoleAuth.js` - PromptX角色授权服务
  - `isRoleAuthorized(workspaceId, roleId)` - 检查角色是否被授权
  - `getAuthorizedRoles(workspaceId)` - 获取工作区授权的角色列表
  - 系统工具(discover, project, toolx)始终允许
  - 认知工具(action, recall, remember)始终允许
- `MCP/index.js` - MCP兼容层
  - `convertServerToolsToPlugins()` - 将MCP工具转换为Aibitat插件
  - 自动过滤未授权的PromptX角色工具
  - 动态权限检查

### Aibitat 代理框架
位于 `server/utils/agents/aibitat/`:
- **核心功能** - 多代理对话编排,工具调用,插件系统
- **提供商支持** - 20+ LLM提供商(OpenAI, Anthropic, Azure, Ollama等)
- **插件系统** - 可扩展的工具和能力(web浏览、SQL代理、文件操作等)
- **WebSocket支持** - 实时流式响应

## Frontend Architecture

### 技术栈
- React 18 - 函数组件和Hooks
- React Router 6 - SPA导航
- TailwindCSS - 样式系统
- Vite - 构建工具(快速HMR)
- i18next - 国际化支持(支持中文、日语、土耳其语、波斯语等)

### 关键组件结构
- `src/pages/` - 主要应用页面
  - `WorkspaceChat/` - 工作区聊天界面
  - `Admin/` - 管理员控制台
  - `GeneralSettings/` - 系统设置
- `src/components/WorkspaceSettings/` - 工作区级配置界面
  - `PromptXRoles/` - PromptX角色管理UI
- `src/components/PrivateRoute/` - 路由保护和认证
- `src/utils/` - 工具函数和配置管理

### 重要功能特性
- 实时聊天(WebSocket连接)
- 拖放文件上传
- PWA能力
- 主题切换
- 多语言支持
- 响应式设计

## PromptX Role Management System

### 核心实现
**PromptX角色管理**是DeeChat的核心功能,允许每个工作区启用/禁用特定的AI角色。

### 关键文件和流程
1. **数据库层** (`server/prisma/schema.prisma`)
   - `workspace_promptx_roles` - 存储角色配置
   - `workspace_promptx_configs` - 存储工作区级配置(如enableAllRoles开关)
   - 包含审计日志字段(updated_by, updated_at等)

2. **授权服务** (`server/utils/workspaceRoleAuth.js`)
   - 核心权限检查逻辑
   - 支持"启用所有角色"模式
   - 系统工具和认知工具始终允许

3. **MCP集成** (`server/utils/MCP/index.js`)
   - 在工具转换时过滤未授权的角色
   - 动态权限检查(基于workspace_id)
   - Discover工具结果自动过滤

4. **API端点** (`server/endpoints/workspacePromptXRoles.js`)
   - GET `/api/workspace/:slug/promptx/roles` - 获取角色列表
   - PUT `/api/workspace/:slug/promptx/roles/:roleId` - 更新角色状态
   - POST `/api/workspace/:slug/promptx/roles/sync` - 同步PromptX角色

5. **前端界面** (`frontend/src/pages/WorkspaceSettings/PromptXRoles/`)
   - 角色启用/禁用开关
   - 批量操作支持
   - 实时状态更新

### 权限控制流程
```
用户发起PromptX工具调用
    ↓
MCP层接收请求并提取workspace_id
    ↓
WorkspaceRoleAuth.isRoleAuthorized() 检查权限
    ↓
如果角色被禁用 → 返回错误
如果角色被启用 → 执行工具调用
    ↓
Discover工具结果自动过滤未授权角色
```

### 工具分类
- **系统工具** (始终允许): discover, project, toolx
- **认知工具** (始终允许): action, recall, remember
- **角色工具** (需要授权): 具体的PromptX角色(如luban, nuwa, sean等)

## Configuration Management

### 环境变量配置
项目使用多个 `.env` 文件:
- `server/.env.development` - 开发环境后端配置
- `frontend/.env` - 前端配置
- `collector/.env` - 收集器配置
- `docker/.env` - Docker部署配置

### 主要配置项
- **LLM提供商** - 支持20+提供商(OpenAI, Anthropic, Azure, Ollama等)
- **向量数据库** - LanceDB(默认), Chroma, Pinecone, Qdrant等
- **认证** - JWT基础,可选多用户模式
- **PromptX集成** - 通过MCP进行角色发现和激活
- **存储位置** - `server/storage/` (数据库、文档、日志等)

### DeeConfig 配置系统
新的统一配置管理系统(`/api/deeconfig/system`):
- **ConfigManager** - 统一配置管理
- **Simple vs Advanced模式** - Chat/Agent配置可同步或分离
- **Onboarding集成** - 一致的配置体验

## MCP Integration

### MCP服务器管理
- **配置位置**: `server/storage/plugins/anythingllm_mcp_servers.json`
- **连接类型**: "streamable" (用于PromptX集成)
- **权限控制**: 工作区级工具授权
- **动态加载**: 运行时MCP服务器发现和集成

### MCP实现细节
1. **MCPHypervisor** - MCP服务器管理器,负责启动和管理MCP进程
2. **MCPCompatibilityLayer** - 将MCP工具转换为Aibitat插件的兼容层
3. **权限过滤** - 在工具转换时根据工作区配置过滤未授权的角色

### MCP权限流程
```
MCP工具加载到代理对话
    ↓
每个工具调用包含workspace_id验证
    ↓
PromptX action工具检查特定角色权限
    ↓
Discover工具结果按授权角色过滤
```

## Special Development Workflows

### PromptX角色开发流程
1. 通过MCP discover工具发现角色
2. 自动存储到数据库(workspace_promptx_roles表)
3. 管理员可以在每个工作区启用/禁用角色
4. MCP工具调用时强制执行权限检查

### 文档处理流程
1. 文件上传到collector服务
2. 多格式解析(PDF, DOCX, 图片OCR等)
3. 向量化并存储到选定的向量数据库
4. 语义搜索集成到聊天响应

### MCP扩展开发
1. 在存储配置中配置MCP服务器
2. 服务器发现和工具加载
3. 工作区权限集成
4. 基于角色权限的动态工具激活

### 添加新的API端点
1. 在 `server/endpoints/` 创建新的端点文件
2. 在 `server/index.js` 导入并注册端点
3. 必要时更新相关的Prisma模型
4. 在前端创建对应的API调用函数

### 添加新的Prisma模型
1. 更新 `server/prisma/schema.prisma`
2. 运行 `yarn prisma:generate` 生成客户端
3. 运行 `yarn prisma:migrate` 创建迁移
4. 更新相关的API端点和服务

## Security & Permissions

### 认证机制
- JWT token基础认证
- 可选的多用户模式(角色基础访问控制)
- 会话管理和过期控制
- 外部集成的API密钥管理

### 工作区隔离
- 工作区之间完全数据分离
- 工作区特定的PromptX角色配置
- 文档和聊天历史隔离
- 用户权限边界

### MCP安全
- 工作区级工具授权
- PromptX角色权限检查
- 安全的MCP服务器通信
- 所有配置变更的审计日志

## Deployment

### Docker部署(推荐)
```bash
# 使用Qdrant(默认,CPU兼容)
cd docker && docker-compose up -d

# 使用ChromaDB
docker-compose -f docker-compose.chromadb.yml up -d
```

### 开发部署
```bash
yarn dev:all  # 同时启动所有服务进行开发
```

### 生产环境注意事项
- 通过.env文件配置环境变量
- schema变更需要数据库迁移
- 向量数据库设置和配置
- 生产部署需要SSL/TLS配置
- 推荐使用Qdrant作为向量数据库(无原生依赖,CPU兼容)

## Troubleshooting

### 常见问题
1. **向量数据库兼容性** - Qdrant通过HTTP API连接,兼容所有CPU架构。ChromaDB需要原生依赖。
2. **Prisma Client未生成** - 运行 `yarn prisma:generate`
3. **MCP服务器连接失败** - 检查 `server/storage/plugins/anythingllm_mcp_servers.json` 配置
4. **PromptX角色不可用** - 确保在工作区设置中启用了相应角色
5. **数据库迁移失败** - 尝试 `yarn prisma:reset` 重置数据库

### 调试技巧
- 启用HTTP日志: 设置 `ENABLE_HTTP_LOGGER=true` 环境变量
- 检查MCP工具权限: 查看 `server/utils/MCP/index.js` 中的日志输出
- 验证数据库状态: 使用Prisma Studio (`npx prisma studio`)
- 查看容器日志: `docker-compose logs -f [service_name]`

## Testing & Quality

### 运行测试
```bash
yarn test                # 运行Jest测试
```

### 代码质量检查
```bash
yarn lint                # 检查所有服务的代码质量
```

### 翻译验证
```bash
yarn verify:translations    # 验证i18n翻译文件
yarn normalize:translations # 标准化翻译文件
```

## Recent Changes & Migration Notes

- **v1.0.0** - 初始发布
  - 实现了PromptX工作区角色管理系统
  - MCP集成和权限控制
  - 工作区级角色授权
  - 审计日志记录
  - 新工作区自动角色初始化
  - DeeConfig统一配置系统
  - 向量数据库迁移到Qdrant(解决CPU兼容性问题)
