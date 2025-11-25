// ==================== 导入依赖模块 ====================
const { v4: uuidv4 } = require("uuid");                                   // UUID生成器
const { DocumentManager } = require("../DocumentManager");               // 文档管理器
const { WorkspaceChats } = require("../../models/workspaceChats");         // 聊天记录数据模型
const { WorkspaceParsedFiles } = require("../../models/workspaceParsedFiles"); // 文件解析记录模型
const { getVectorDbClass, getLLMProvider } = require("../helpers");        // 工具函数：获取向量数据库和AI提供商
const { writeResponseChunk } = require("../helpers/chat/responses");       // SSE响应写入工具
const { grepAgents } = require("./agents");                                // Agent处理函数
const {
  grepCommand,                 // 命令识别函数（如/help, /clear等）
  VALID_COMMANDS,               // 有效命令列表
  chatPrompt,                   // 聊天提示词构建函数
  recentChatHistory,            // 获取最近聊天历史
  sourceIdentifier,             // 来源标识符
} = require("./index");

// ==================== 常量定义 ====================
const VALID_CHAT_MODE = ["chat", "query"];  // 支持的聊天模式："chat"普通对话，"query"查询模式

// ==================== 核心流式聊天处理函数 ====================
/**
 * 🔥 🔥 🔥 这是DeeChat聊天功能的核心函数！
 * 处理工作空间的流式聊天请求，包括文档检索、AI对话、SSE响应等
 *
 * @param {Object} response - Express响应对象，用于SSE流式响应
 * @param {Object} workspace - 工作空间配置信息
 * @param {string} message - 用户输入的消息
 * @param {string} chatMode - 聊天模式："chat"普通对话或"query"查询模式
 * @param {Object|null} user - 用户信息（可选）
 * @param {Object|null} thread - 对话线程信息（可选）
 * @param {Array} attachments - 附件文件列表
 * @returns {Promise<void>}
 */
async function streamChatWithWorkspace(
  response,
  workspace,
  message,
  chatMode = "chat",    // 默认为普通聊天模式
  user = null,
  thread = null,
  attachments = []
) {
  // 🔥 生成唯一会话标识符
  const uuid = uuidv4();

  // 🔥 第一步：检查是否为特殊命令
  const updatedMessage = await grepCommand(message, user);

  // 如果是有效命令（如/help, /clear等），执行命令并返回
  if (Object.keys(VALID_COMMANDS).includes(updatedMessage)) {
    console.log(`[流式聊天] 执行特殊命令: ${updatedMessage}`);

    const data = await VALID_COMMANDS[updatedMessage](
      workspace,
      message,
      uuid,
      user,
      thread
    );

    // 发送命令执行结果并返回
    writeResponseChunk(response, data);
    return;
  }

  // 🔥 第二步：检查是否为Agent聊天（高级功能）
  // Agent功能允许AI执行复杂的任务流程
  const isAgentChat = await grepAgents({
    uuid,
    response,
    message: updatedMessage,
    user,
    workspace,
    thread,
  });

  // 如果是Agent聊天，Agent会接管后续处理，这里直接返回
  if (isAgentChat) {
    console.log(`[流式聊天] Agent模式已激活，跳过普通聊天流程`);
    return;
  }

  // 🔥 第三步：初始化AI提供商和向量数据库
  const LLMConnector = getLLMProvider({
    provider: workspace?.chatProvider,  // AI提供商：OpenAI, Claude等
    model: workspace?.chatModel,        // AI模型：gpt-3.5-turbo, claude-3等
  });

  const VectorDb = getVectorDbClass();  // 向量数据库实例

  // 🔥 第四步：获取工作空间配置和状态
  const messageLimit = workspace?.openAiHistory || 20;  // 历史消息限制
  const hasVectorizedSpace = await VectorDb.hasNamespace(workspace.slug);  // 是否有向量空间
  const embeddingsCount = await VectorDb.namespaceCount(workspace.slug);   // 向量化文档数量

  console.log(`[流式聊天] 工作空间状态: 向量空间=${hasVectorizedSpace}, 文档数量=${embeddingsCount}`);

  // 🔥 第五步：查询模式特殊处理
  // 如果用户在查询模式下聊天，但工作空间没有数据，提前返回
  if ((!hasVectorizedSpace || embeddingsCount === 0) && chatMode === "query") {
    console.log(`[流式聊天] 查询模式但无数据，返回提示信息`);

    const textResponse =
      workspace?.queryRefusalResponse ??
      "抱歉，这个工作空间中没有相关信息来回答您的问题。";

    // 发送提示响应
    writeResponseChunk(response, {
      id: uuid,
      type: "textResponse",
      textResponse,
      sources: [],
      attachments,
      close: true,
      error: null,
    });

    // 保存聊天记录
    await WorkspaceChats.new({
      workspaceId: workspace.id,
      prompt: message,
      response: {
        text: textResponse,
        sources: [],
        type: chatMode,
        attachments,
      },
      threadId: thread?.id || null,
      include: false,  // 不包含在历史记录中
      user,
    });
    return;
  }

  // 🔥 如果执行到这里，说明：
  // 1. 普通聊天模式，可能有没有向量化数据
  // 2. 查询模式，且至少有一个向量化文档
  console.log(`[流式聊天] 开始正常聊天流程，模式=${chatMode}`);

  // 🔥 第六步：初始化变量并获取聊天历史
  let completeText = "";            // 完整的AI回答文本
  let metrics = {};                // 性能指标统计
  let contextTexts = [];           // 上下文文本数组
  let sources = [];                 // 文档来源列表
  let pinnedDocIdentifiers = [];    // 置顶文档标识符列表

  // 🔥 获取最近的聊天历史记录
  const { rawHistory, chatHistory } = await recentChatHistory({
    user,
    workspace,
    thread,
    messageLimit,  // 限制历史消息数量
  });

  console.log(`[流式聊天] 获取到 ${chatHistory.length} 条历史记录`);

  // 🔥 第七步：处理置顶文档（高级功能）
  // 置顶文档是用户手动指定的重要文档，会优先包含在上下文中
  // 这是一个补充工具，但需要谨慎使用，因为容易超出上下文窗口限制
  // 我们将置顶文档的上下文限制在总大小的80%以内，避免触发提示词压缩
  // 置顶功能最适合高上下文模型使用
  await new DocumentManager({
    workspace,
    maxTokens: LLMConnector.promptWindowLimit(),  // AI模型的上下文窗口限制
  })
    .pinnedDocs()  // 获取置顶文档
    .then((pinnedDocs) => {
      pinnedDocs.forEach((doc) => {
        const { pageContent, ...metadata } = doc;

        // 保存置顶文档标识符，避免重复
        pinnedDocIdentifiers.push(sourceIdentifier(doc));

        // 将置顶文档内容添加到上下文
        contextTexts.push(doc.pageContent);

        // 将置顶文档添加到来源列表
        sources.push({
          text:
            pageContent.slice(0, 1_000) +  // 限制显示长度
            "...continued on in source document...",
          ...metadata,
        });
      });
    });

  // 🔥 第八步：注入解析文件上下文
  // 这些是在工作空间/线程/用户级别解析的文件
  const parsedFiles = await WorkspaceParsedFiles.getContextFiles(
    workspace,
    thread || null,
    user || null
  );

  console.log(`[流式聊天] 获取到 ${parsedFiles.length} 个解析文件`);

  // 将解析文件添加到上下文和来源列表
  parsedFiles.forEach((doc) => {
    const { pageContent, ...metadata } = doc;

    // 添加到上下文文本
    contextTexts.push(doc.pageContent);

    // 添加到来源列表
    sources.push({
      text:
        pageContent.slice(0, 1_000) +  // 限制显示长度
        "...continued on in source document...",
      ...metadata,
    });
  });

  // 🔥 第九步：向量相似度搜索
  // 这是RAG(检索增强生成)的核心步骤!
  // 通过向量嵌入技术,找到与用户问题最相关的文档片段
  const vectorSearchResults =
    embeddingsCount !== 0
      ? await VectorDb.performSimilaritySearch({
          namespace: workspace.slug,               // 工作空间命名空间
          input: updatedMessage,                   // 用户消息(会被转换为向量)
          LLMConnector,                            // AI提供商(用于生成嵌入向量)
          similarityThreshold: workspace?.similarityThreshold, // 相似度阈值(0-1)
          topN: workspace?.topN,                   // 返回最相关的N个文档片段
          filterIdentifiers: pinnedDocIdentifiers, // 过滤已包含的置顶文档
          rerank: workspace?.vectorSearchMode === "rerank", // 是否使用重排序算法
        })
      : {
          // 如果没有向量化数据,返回空结果
          contextTexts: [],
          sources: [],
          message: null,
        };

  console.log(`[流式聊天] 向量搜索返回 ${vectorSearchResults.sources?.length || 0} 个结果`);

  // 🔥 检查向量搜索是否失败
  if (!!vectorSearchResults.message) {
    console.error(`[流式聊天] 向量搜索失败: ${vectorSearchResults.message}`);
    writeResponseChunk(response, {
      id: uuid,
      type: "abort",
      textResponse: null,
      sources: [],
      close: true,
      error: vectorSearchResults.message,
    });
    return;
  }

  // 🔥 第十步：填充来源窗口
  // 这个函数会从历史记录中回填相关文档,确保上下文连贯性
  const { fillSourceWindow } = require("../helpers/chat");
  const filledSources = fillSourceWindow({
    nDocs: workspace?.topN || 4,            // 文档数量限制
    searchResults: vectorSearchResults.sources, // 当前搜索结果
    history: rawHistory,                    // 原始聊天历史
    filterIdentifiers: pinnedDocIdentifiers, // 过滤置顶文档
  });

  // 🔥 第十一步：合并上下文和来源
  // 为什么contextTexts包含所有信息,但sources只包含当前搜索结果?
  // 设计原因:
  // 1. contextTexts - 用于AI理解,包含历史回填+当前搜索,确保答案准确
  // 2. sources - 只显示当前搜索,避免用户看到"不相关"的历史引用
  // 这样可以减少用户困惑,同时保持答案的高准确性
  contextTexts = [...contextTexts, ...filledSources.contextTexts];
  sources = [...sources, ...vectorSearchResults.sources];

  console.log(`[流式聊天] 最终上下文包含 ${contextTexts.length} 个文档片段`);
  console.log(`[流式聊天] 来源列表包含 ${sources.length} 个文档来源`);

  // 🔥 第十二步：查询模式空上下文检查
  // 如果是query模式且没有找到任何相关文档,提前返回,避免AI幻觉回答
  if (chatMode === "query" && contextTexts.length === 0) {
    console.log(`[流式聊天] 查询模式但无上下文,返回拒绝响应`);

    const textResponse =
      workspace?.queryRefusalResponse ??
      "抱歉,在这个工作空间中没有找到相关信息来回答您的问题。";

    // 发送拒绝响应
    writeResponseChunk(response, {
      id: uuid,
      type: "textResponse",
      textResponse,
      sources: [],
      close: true,
      error: null,
    });

    // 保存聊天记录(标记为不包含在历史中)
    await WorkspaceChats.new({
      workspaceId: workspace.id,
      prompt: message,
      response: {
        text: textResponse,
        sources: [],
        type: chatMode,
        attachments,
      },
      threadId: thread?.id || null,
      include: false,  // 不包含在聊天历史中
      user,
    });
    return;
  }

  // 🔥 第十三步：压缩并组装完整的提示词
  // 这一步非常关键!需要确保提示词在token限制内,同时为AI回答留出足够空间
  // 提示词组成:
  // 1. systemPrompt - 系统提示词(角色定义、行为规则等)
  // 2. userPrompt - 用户当前消息
  // 3. contextTexts - 文档上下文
  // 4. chatHistory - 聊天历史记录
  // 5. attachments - 附件(图片、文件等)
  console.log(`[流式聊天] 开始压缩和组装提示词...`);

  const messages = await LLMConnector.compressMessages(
    {
      systemPrompt: await chatPrompt(workspace, user),  // 系统提示词
      userPrompt: updatedMessage,                       // 用户消息
      contextTexts,                                      // 文档上下文
      chatHistory,                                       // 聊天历史
      attachments,                                       // 附件
    },
    rawHistory  // 原始历史记录(用于token计算)
  );

  console.log(`[流式聊天] 提示词组装完成,消息数量: ${messages.length}`);

  // 🔥 第十四步：调用AI提供商生成回答
  // 根据AI提供商是否支持流式响应,选择不同的调用方式

  // 🔥 分支1：非流式模式
  // 部分AI提供商不支持流式响应(如某些本地模型)
  // 这种情况下等待完整回答后一次性返回
  if (LLMConnector.streamingEnabled() !== true) {
    console.log(
      `\x1b[31m[流式已禁用]\x1b[0m ${LLMConnector.constructor.name} 不支持流式响应,将使用常规聊天方法。`
    );

    // 🔥 调用AI API获取完整回答
    const { textResponse, metrics: performanceMetrics } =
      await LLMConnector.getChatCompletion(messages, {
        temperature: workspace?.openAiTemp ?? LLMConnector.defaultTemp,  // 温度参数(控制随机性)
        user: user,  // 用户信息(部分提供商支持)
      });

    completeText = textResponse;  // 保存完整回答文本
    metrics = performanceMetrics;  // 保存性能指标

    // 🔥 发送完整回答(一次性)
    writeResponseChunk(response, {
      uuid,
      sources,
      type: "textResponseChunk",
      textResponse: completeText,
      close: true,  // 标记为结束
      error: false,
      metrics,
    });
  }
  // 🔥 分支2：流式模式 (推荐)
  // 大部分现代AI提供商都支持流式响应(OpenAI, Claude, Ollama等)
  // 流式响应可以实时显示AI生成的文本,用户体验更好
  else {
    console.log(`[流式聊天] 使用流式响应模式`);

    // 🔥 调用流式AI API
    // 这会返回一个异步生成器(AsyncGenerator),可以逐块接收响应
    const stream = await LLMConnector.streamGetChatCompletion(messages, {
      temperature: workspace?.openAiTemp ?? LLMConnector.defaultTemp,
      user: user,
    });

    // 🔥 处理流式响应
    // handleStream内部会循环读取stream,每收到一块文本就调用writeResponseChunk发送给前端
    // 这实现了打字机效果的核心逻辑
    completeText = await LLMConnector.handleStream(response, stream, {
      uuid,         // 消息唯一标识符
      sources,      // 文档来源列表
    });

    metrics = stream.metrics;  // 获取性能指标
  }

  console.log(`[流式聊天] AI回答完成,总字数: ${completeText?.length || 0}`);

  // 🔥 第十五步：保存聊天记录到数据库
  if (completeText?.length > 0) {
    console.log(`[流式聊天] 保存聊天记录到数据库...`);

    const { chat } = await WorkspaceChats.new({
      workspaceId: workspace.id,   // 工作空间ID
      prompt: message,              // 用户消息
      response: {
        text: completeText,         // AI完整回答
        sources,                    // 文档来源
        type: chatMode,             // 聊天模式(chat/query)
        attachments,                // 附件列表
        metrics,                    // 性能指标
      },
      threadId: thread?.id || null, // 线程ID(如果有)
      user,                         // 用户对象
    });

    console.log(`[流式聊天] 聊天记录已保存,chatId: ${chat.id}`);

    // 🔥 第十六步：发送最终完成消息
    writeResponseChunk(response, {
      uuid,
      type: "finalizeResponseStream",  // 🔥 最终响应类型
      close: true,                     // 标记流结束
      error: false,
      chatId: chat.id,                 // 聊天记录ID
      metrics,                         // 性能指标
    });
    return;
  }

  // 🔥 异常情况：AI回答为空
  // 仍然发送finalize消息告知前端流结束
  console.warn(`[流式聊天] 警告: AI回答为空`);
  writeResponseChunk(response, {
    uuid,
    type: "finalizeResponseStream",
    close: true,
    error: false,
    metrics,
  });
  return;
}

module.exports = {
  VALID_CHAT_MODE,
  streamChatWithWorkspace,
};
