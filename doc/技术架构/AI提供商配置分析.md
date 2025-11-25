# AI提供商配置分析

## 🎯 当前配置逻辑

### 1. 配置层级结构

```
环境变量 (最高优先级)
    ↓
工作空间配置 (workspace.chatProvider, workspace.chatModel)
    ↓
默认值 (Fallback)
```

### 2. 核心配置文件位置

#### 后端核心文件
- **`server/utils/helpers/index.js`** - AI提供商获取逻辑
  - `getLLMProvider({ provider, model })` - 获取AI提供商实例
  - 支持30+种AI提供商(OpenAI, Anthropic, Ollama等)

- **`server/models/workspace.js`** - 工作空间数据模型
  - `chatProvider` - 聊天AI提供商字段
  - `chatModel` - 聊天模型字段
  - `agentProvider` - Agent AI提供商字段
  - `agentModel` - Agent模型字段

- **`server/utils/chats/stream.js`** - 流式聊天核心处理
  - 第3步:调用`getLLMProvider()`获取AI提供商
  - 传入`workspace.chatProvider`和`workspace.chatModel`

#### 前端核心文件
- **`frontend/src/pages/GeneralSettings/`** - AI设置界面
- **`frontend/src/components/SettingsSidebar/`** - 设置侧边栏

### 3. 获取AI提供商的逻辑(server/utils/helpers/index.js:130-233)

```javascript
/**
 * 🔥 核心函数:获取AI提供商实例
 * @param {object} params - {provider: string, model: string}
 * @returns {BaseLLMProvider} - AI提供商实例
 */
function getLLMProvider({ provider = null, model = null } = {}) {
  // 优先级: 传入的provider > 环境变量LLM_PROVIDER > 默认"openai"
  const LLMSelection = provider ?? process.env.LLM_PROVIDER ?? "openai";
  const embedder = getEmbeddingEngineSelection();

  switch (LLMSelection) {
    case "openai":
      const { OpenAiLLM } = require("../AiProviders/openAi");
      return new OpenAiLLM(embedder, model);
    case "anthropic":
      const { AnthropicLLM } = require("../AiProviders/anthropic");
      return new AnthropicLLM(embedder, model);
    case "ollama":
      const { OllamaAILLM } = require("../AiProviders/ollama");
      return new OllamaAILLM(embedder, model);
    // ... 还有27种其他提供商
    default:
      throw new Error(`ENV: No valid LLM_PROVIDER value found in environment!`);
  }
}
```

**关键点:**
1. `provider`参数来自`workspace.chatProvider`
2. `model`参数来自`workspace.chatModel`
3. 如果workspace没有配置,则使用环境变量
4. 最终fallback到"openai"

### 4. 调用链路追踪

```
用户发送消息
  ↓
frontend/src/utils/chat/index.js::Workspace.multiplexStream()
  ↓
server/endpoints/chat.js 或 server/endpoints/api/workspace/index.js
  ↓
server/utils/chats/stream.js::streamChatWithWorkspace()
  ↓ (第3步)
const LLMConnector = getLLMProvider({
  provider: workspace?.chatProvider,  // 🔥 从工作空间读取
  model: workspace?.chatModel,        // 🔥 从工作空间读取
});
  ↓
server/utils/helpers/index.js::getLLMProvider()
  ↓
返回具体的AI提供商实例 (如 OpenAiLLM, AnthropicLLM等)
```

### 5. 数据库配置字段(workspace表)

```javascript
// server/models/workspace.js:23-28
{
  chatProvider: "openai",      // AI提供商名称
  chatModel: "gpt-3.5-turbo",  // 模型名称
  agentProvider: "openai",     // Agent提供商
  agentModel: "gpt-4",         // Agent模型
}
```

### 6. 环境变量配置

```bash
# .env文件
LLM_PROVIDER=openai           # 全局默认AI提供商
OPEN_MODEL_PREF=gpt-3.5-turbo # OpenAI默认模型
ANTHROPIC_MODEL_PREF=claude-3-sonnet-20240229  # Anthropic默认模型
OLLAMA_MODEL_PREF=llama2      # Ollama默认模型
# ... 还有其他提供商的配置
```

---

## 🛠️ 写死AI提供商的方案

### 方案1:修改`getLLMProvider`函数(推荐)

**优点:** 改动最小,只需修改1个文件
**缺点:** 仍然需要数据库配置(但会被忽略)

```javascript
// server/utils/helpers/index.js
function getLLMProvider({ provider = null, model = null } = {}) {
  // 🔥 写死配置:强制使用Ollama + qwen2.5模型
  const LLMSelection = "ollama";  // 写死提供商
  const fixedModel = "qwen2.5";   // 写死模型
  const embedder = getEmbeddingEngineSelection();

  // 直接返回固定的提供商
  const { OllamaAILLM } = require("../AiProviders/ollama");
  return new OllamaAILLM(embedder, fixedModel);
}
```

### 方案2:启动时设置默认工作空间配置

**优点:** 可以保留灵活性,只是设置默认值
**缺点:** 用户仍然可以通过前端修改

```javascript
// server/utils/boot/index.js
async function setDefaultWorkspaceConfig() {
  const workspaces = await Workspace.all();
  for (const workspace of workspaces) {
    await workspace.update({
      chatProvider: "ollama",
      chatModel: "qwen2.5",
    });
  }
}
```

### 方案3:同时修改后端+隐藏前端(最彻底)

**优点:** 用户完全无法修改,真正的"写死"
**缺点:** 改动较大

1. 后端写死(方案1)
2. 前端隐藏AI配置界面
3. 文档说明使用固定AI提供商

---

## 📋 实施步骤

### 步骤1:确定要写死的AI提供商

你需要告诉我:
- **AI提供商:** openai / anthropic / ollama / 其他?
- **模型名称:** gpt-3.5-turbo / claude-3 / qwen2.5 / 其他?
- **API配置:** 如果是OpenAI/Anthropic,需要配置API Key

### 步骤2:修改后端配置

修改`server/utils/helpers/index.js`的`getLLMProvider`函数

### 步骤3:隐藏前端配置界面

修改前端路由和设置页面,移除AI配置选项

### 步骤4:环境变量配置

配置`.env`文件,设置对应的API Key和默认值

### 步骤5:测试验证

- 启动服务
- 发送消息测试
- 验证使用的是固定AI提供商

---

## ❓ 需要你提供的信息

1. **你想用哪个AI提供商?**
   - [ ] OpenAI (需要API Key)
   - [ ] Anthropic Claude (需要API Key)
   - [ ] Ollama (本地运行,免费)
   - [ ] 其他: ___________

2. **你想用哪个模型?**
   - OpenAI: gpt-3.5-turbo / gpt-4 / gpt-4-turbo
   - Anthropic: claude-3-opus / claude-3-sonnet / claude-3-haiku
   - Ollama: llama2 / qwen2.5 / mistral
   - 其他: ___________

3. **你有API Key吗?**(如果选择云端提供商)
   - [ ] 有,已准备好
   - [ ] 没有,需要申请
   - [ ] 使用本地Ollama(无需API Key)

4. **是否需要隐藏前端配置界面?**
   - [ ] 是,完全隐藏,用户无法修改
   - [ ] 否,保留界面但使用默认配置

---

## 🎯 推荐配置

如果你是国内用户,我推荐:

**选项A: Ollama本地部署(最简单)**
```
AI提供商: ollama
模型: qwen2.5:latest
优点: 免费、无需API Key、隐私保护
缺点: 需要本地GPU、首次下载模型较大
```

**选项B: OpenAI(最稳定)**
```
AI提供商: openai
模型: gpt-3.5-turbo
优点: 响应快、质量好、稳定
缺点: 需要API Key、需要付费、需要科学上网
```

**选项C: Anthropic Claude(最智能)**
```
AI提供商: anthropic
模型: claude-3-sonnet-20240229
优点: 智能程度高、上下文长
缺点: 需要API Key、相对贵、需要科学上网
```

---

请告诉我你的选择,我会立即帮你配置! 🚀
