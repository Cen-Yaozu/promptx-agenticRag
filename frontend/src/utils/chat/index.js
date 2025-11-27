// ==================== 导入依赖模块 ====================
import { THREAD_RENAME_EVENT } from "@/components/Sidebar/ActiveWorkspaces/ThreadContainer"; // 线程重命名事件
import { emitAssistantMessageCompleteEvent } from "@/components/contexts/TTSProvider"; // TTS语音合成事件

// ==================== 常量定义 ====================
export const ABORT_STREAM_EVENT = "abort-chat-stream";  // 中断聊天流的自定义事件名

/**
 * 🔥 🔥 🔥 核心聊天响应处理函数！
 * 这是DeeChat前端处理服务器SSE响应的核心函数
 * 负责解析各种类型的聊天消息并更新UI状态
 *
 * @param {Object} chatResult - 服务器返回的聊天响应数据
 * @param {Function} setLoadingResponse - 设置加载状态的函数
 * @param {Function} setChatHistory - 设置聊天历史的函数
 * @param {Array} remHistory - 移除最后一条消息后的历史记录
 * @param {Array} _chatHistory - 当前聊天历史记录（会被修改）
 * @param {Function} setWebsocket - 设置WebSocket连接的函数
 */
export default function handleChat(
  chatResult,
  setLoadingResponse,
  setChatHistory,
  remHistory,
  _chatHistory,
  setWebsocket
) {
  // 🔥 解构聊天响应数据
  const {
    uuid,              // 唯一会话标识符
    textResponse,       // AI回答文本内容
    type,              // 响应类型：textResponse, textResponseChunk, abort等
    sources = [],      // 引用的文档来源列表
    error,             // 错误信息
    close,             // 是否关闭流
    animate = false,   // 是否启用动画
    chatId = null,     // 聊天记录ID
    action = null,     // 动作类型
    metrics = {},      // 性能指标数据
  } = chatResult;

  // 🔥 调试：打印每个响应
  console.log(`[聊天处理] 收到响应，type: ${type}, uuid: ${uuid}`);

  // ==================== 响应类型处理 ====================

  // 🔥 处理1：中断响应和状态响应
  // type为"abort"时表示聊天被中断，"statusResponse"表示状态消息
  if (type === "abort" || type === "statusResponse") {
    console.log(`[聊天处理] 处理${type}类型响应`);

    // 🔥 结束加载状态
    setLoadingResponse(false);

    // 🔥 更新聊天历史，添加中断/状态消息
    setChatHistory([
      ...remHistory,  // 保留之前的聊天记录
      {
        type,            // 响应类型
        uuid,            // 会话ID
        content: textResponse,  // 消息内容
        role: "assistant",      // AI角色
        sources,              // 文档来源
        closed: true,          // 标记为已关闭
        error,                 // 错误信息
        animate,              // 动画设置
        pending: false,        // 不再待处理
        metrics,              // 性能指标
      },
    ]);

    // 🔥 同时更新内部聊天历史记录
    _chatHistory.push({
      type,
      uuid,
      content: textResponse,
      role: "assistant",
      sources,
      closed: true,
      error,
      animate,
      pending: false,
      metrics,
    });
  }
  // 🔥 处理2：完整文本响应（非流式）
  // type为"textResponse"时表示一次性完整的AI回答
  else if (type === "textResponse") {
    console.log(`[聊天处理] 处理完整文本响应`);

    // 🔥 结束加载状态
    setLoadingResponse(false);

    // 🔥 更新聊天历史，添加完整AI回答
    setChatHistory([
      ...remHistory,  // 保留之前的聊天记录
      {
        uuid,            // 会话ID
        content: textResponse,  // 完整的AI回答内容
        role: "assistant",      // AI角色
        sources,              // 引用的文档来源
        closed: close,         // 是否关闭流
        error,                 // 错误信息
        animate: !close,       // 如果未关闭则启用动画
        pending: false,        // 不再待处理
        chatId,                // 聊天记录ID
        metrics,              // 性能指标
      },
    ]);

    // 🔥 更新内部聊天历史记录
    _chatHistory.push({
      uuid,
      content: textResponse,
      role: "assistant",
      sources,
      closed: close,
      error,
      animate: !close,
      pending: false,
      chatId,
      metrics,
    });

    // 🔥 触发TTS语音合成事件（如果启用）
    emitAssistantMessageCompleteEvent(chatId);
  }
  // 🔥 处理3：流式响应块
  // type为"textResponseChunk"时表示流式AI回答的一个片段
  // type为"finalizeResponseStream"时表示流式响应结束
  else if (type === "textResponseChunk" || type === "finalizeResponseStream") {
    console.log(`[聊天处理] 处理流式响应: ${type}`);

    // 🔥 查找要更新的聊天记录
    let chatIdx = _chatHistory.findIndex((chat) => chat.uuid === uuid);

    // 🔥 修复：如果通过uuid找不到，尝试查找pending状态的assistant消息
    // 这种情况发生在第一个流式响应到达时，占位符还没有uuid
    if (chatIdx === -1) {
      chatIdx = _chatHistory.findIndex(
        (chat) => chat.role === "assistant" && chat.pending === true && !chat.uuid
      );

      if (chatIdx !== -1) {
        console.log(`[聊天处理] 为占位符分配UUID: ${uuid}`);
        // 给占位符分配从后端接收到的uuid
        _chatHistory[chatIdx].uuid = uuid;
      }
    }

    if (chatIdx !== -1) {
      // 找到了对应的聊天记录，进行更新
      const existingHistory = { ..._chatHistory[chatIdx] };
      let updatedHistory;

      // 🔥 特殊处理：流式响应结束
      if (type === "finalizeResponseStream") {
        console.log(`[聊天处理] 流式响应结束，会话ID: ${uuid}`);

        // 🔥 构建最终的聊天记录
        updatedHistory = {
          ...existingHistory,       // 保留现有属性
          uuid,                      // 确保uuid存在
          closed: close,             // 标记为已关闭
          animate: false,            // 停止动画
          pending: false,            // 不再待处理
          chatId,                    // 聊天记录ID
          metrics: { ...existingHistory.metrics, ...metrics }, // 合并性能指标
        };

        // 🔥 更新上一条用户消息的chatId
        if (chatIdx > 0) {
          _chatHistory[chatIdx - 1] = { ..._chatHistory[chatIdx - 1], chatId };
        }

        emitAssistantMessageCompleteEvent(chatId); // 触发TTS事件
        setLoadingResponse(false);
      } else {
        // 🔥 处理流式文本块
        updatedHistory = {
          ...existingHistory,       // 保留现有属性
          uuid,                      // 确保uuid存在
          content: existingHistory.content + (textResponse || ""),  // 🔥 关键：追加文本片段
          sources: sources.length > 0 ? sources : existingHistory.sources, // 更新文档来源
          error,                     // 错误信息
          closed: close,             // 是否关闭
          animate: !close,           // 动画状态
          pending: false,            // 不再待处理
          chatId,                    // 聊天记录ID
          metrics: { ...existingHistory.metrics, ...metrics },         // 合并性能指标
        };
      }

      // 🔥 更新内部聊天历史记录
      _chatHistory[chatIdx] = updatedHistory;
    } else {
      // 🔥 如果找不到对应的聊天记录，创建一个新的
      console.log(`[聊天处理] 未找到现有记录，创建新聊天记录，会话ID: ${uuid}`);
      _chatHistory.push({
        uuid,
        sources,
        error,
        content: textResponse || "",
        role: "assistant",
        closed: close,
        animate: !close,
        pending: false,
        chatId,
        metrics,
      });
    }

    // 🔥 统一更新UI显示
    setChatHistory([..._chatHistory]);
  }
  // 🔥 处理4：其他特殊响应类型
  else if (type === "agentInitWebsocketConnection") {
    // 🔥 Agent WebSocket连接初始化
    console.log(`[聊天处理] 初始化Agent WebSocket连接`);
    console.log(`[聊天处理] 收到的完整响应数据:`, chatResult);
    console.log(`[聊天处理] websocketUUID字段:`, chatResult.websocketUUID);
    console.log(`[聊天处理] setSocketId函数类型:`, typeof setSocketId);

    const result = setSocketId(chatResult.websocketUUID);
    console.log(`[聊天处理] setSocketId调用结果:`, result);
    console.log(`[聊天处理] 准备调用setSocketId，参数:`, chatResult.websocketUUID);
  }
  // 🔥 处理5：停止生成响应
  else if (type === "stopGeneration") {
    console.log(`[聊天处理] 停止AI生成`);

    const chatIdx = _chatHistory.length - 1;
    const existingHistory = { ..._chatHistory[chatIdx] };

    // 🔥 更新最后一条聊天记录，标记为停止状态
    const updatedHistory = {
      ...existingHistory,
      content: existingHistory.content + "\n\n[生成已停止]", // 添加停止提示
      animate: false,                                      // 停止动画
      pending: false,                                      // 不再待处理
      closed: true,                                        // 标记为已关闭
    };

    _chatHistory[chatIdx] = updatedHistory;
    setChatHistory([..._chatHistory]);  // 更新UI显示
    setLoadingResponse(false);         // 结束加载状态
  }
  // 🔥 处理6：未知响应类型
  else {
    console.warn(`[聊天处理] 未知的响应类型: ${type}`, chatResult);
  }

  // 🔥 处理7：Action特殊操作
  // 通过响应中的'action'属性处理特殊操作
  if (action === "reset_chat") {
    // 🔥 聊天重置：保留重置消息，清空其他所有内容
    console.log(`[聊天处理] 重置聊天`);
    setChatHistory([_chatHistory.pop()]);
  }

  // 🔥 处理8：线程重命名
  // 如果聊天提示自动更新了线程，这里处理线程的更新
  if (action === "rename_thread") {
    if (!!chatResult?.thread?.slug && chatResult.thread.name) {
      console.log(`[聊天处理] 重命名线程: ${chatResult.thread.name}`);

      // 🔥 触发线程重命名事件
      window.dispatchEvent(
        new CustomEvent(THREAD_RENAME_EVENT, {
          detail: {
            threadSlug: chatResult.thread.slug,
            newName: chatResult.thread.name,
          },
        })
      );
    }
  }

  // 🔥 返回更新后的聊天历史（可选，某些场景可能需要）
  return _chatHistory;
}

// ==================== 工具函数 ====================

/**
 * 🔥 获取聊天提示词
 * 返回工作空间的AI系统提示词，如果未设置则使用默认提示词
 *
 * @param {Object} workspace - 工作空间配置
 * @returns {string} AI系统提示词
 */
export function chatPrompt(workspace) {
  return (
    workspace?.openAiPrompt ??
    "Given the following conversation, relevant context, and a follow up question, reply with an answer to the current question the user is asking. Return only your response to the question given the above information following the users instructions as needed."
  );
}

/**
 * 🔥 获取查询拒绝响应
 * 当工作空间没有数据时返回的默认响应
 *
 * @param {Object} workspace - 工作空间配置
 * @returns {string} 拒绝响应文本
 */
export function chatQueryRefusalResponse(workspace) {
  return (
    workspace?.queryRefusalResponse ??
    "There is no relevant information in this workspace to answer your query."
  );
}
