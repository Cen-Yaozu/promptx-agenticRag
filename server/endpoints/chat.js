// ==================== 导入依赖模块 ====================
const { v4: uuidv4 } = require("uuid");                                      // UUID生成器
const { reqBody, userFromSession, multiUserMode } = require("../utils/http"); // HTTP工具函数
const { validatedRequest } = require("../utils/middleware/validatedRequest"); // 请求验证中间件
const { Telemetry } = require("../models/telemetry");                        // 遥测数据模型
const { streamChatWithWorkspace } = require("../utils/chats/stream");        // 🔥 核心聊天处理函数
const {
  ROLES,
  flexUserRoleValid,
} = require("../utils/middleware/multiUserProtected");                       // 多用户权限中间件
const { EventLogs } = require("../models/eventLogs");                        // 事件日志模型
const {
  validWorkspaceAndThreadSlug,
  validWorkspaceSlug,
} = require("../utils/middleware/validWorkspace");                           // 工作空间验证中间件
const { writeResponseChunk } = require("../utils/helpers/chat/responses");   // SSE响应写入工具
const { WorkspaceThread } = require("../models/workspaceThread");            // 工作空间线程模型
const { User } = require("../models/user");                                  // 用户模型
const truncate = require("truncate");                                        // 文本截断工具
const { getModelTag } = require("./utils");                                  // 获取模型标签工具

/**
 * 🔥 聊天API端点注册函数
 * 这个函数注册了DeeChat的核心聊天API路由
 *
 * @param {Express.Application} app - Express应用实例
 */
function chatEndpoints(app) {
  if (!app) return;

  /**
   * 🔥 🔥 🔥 工作空间流式聊天API端点
   * 这是DeeChat后端最重要的API之一!
   *
   * 路由: POST /workspace/:slug/stream-chat
   * 中间件:
   *   - validatedRequest: 验证请求格式
   *   - flexUserRoleValid: 验证用户权限(所有角色都可访问)
   *   - validWorkspaceSlug: 验证工作空间slug是否有效
   *
   * 请求体:
   *   {
   *     message: string,        // 用户消息内容
   *     attachments: Array      // 附件列表(可选)
   *   }
   *
   * 响应: SSE流式响应
   *   Content-Type: text/event-stream
   *   格式: data: {JSON}\n\n
   */
  app.post(
    "/workspace/:slug/stream-chat",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      try {
        // 🔥 步骤1: 获取用户和请求数据
        const user = await userFromSession(request, response);  // 从session获取当前用户
        const { message, attachments = [], isAgentMode = false } = reqBody(request); // 提取请求体数据，包含Agent模式状态
        const workspace = response.locals.workspace;            // 从中间件获取工作空间对象

        // 🔥 步骤2: 验证消息内容
        if (!message?.length) {
          response.status(400).json({
            id: uuidv4(),
            type: "abort",
            textResponse: null,
            sources: [],
            close: true,
            error: !message?.length ? "Message is empty." : null,
          });
          return;
        }

        // 🔥 步骤3: 设置SSE响应头
        // 这些响应头告诉浏览器这是一个服务器推送事件流
        response.setHeader("Cache-Control", "no-cache");          // 禁用缓存
        response.setHeader("Content-Type", "text/event-stream");  // SSE内容类型
        response.setHeader("Access-Control-Allow-Origin", "*");   // 允许跨域
        response.setHeader("Connection", "keep-alive");           // 保持连接
        response.flushHeaders();                                   // 立即发送响应头

        // 🔥 步骤4: 检查用户聊天配额(多用户模式)
        // 防止滥用,限制每个用户24小时内的聊天次数
        if (multiUserMode(response) && !(await User.canSendChat(user))) {
          writeResponseChunk(response, {
            id: uuidv4(),
            type: "abort",
            textResponse: null,
            sources: [],
            close: true,
            error: `您已达到24小时聊天配额限制(${user.dailyMessageLimit}次),请稍后再试。`,
          });
          return;
        }

        // 🔥 🔥 🔥 步骤5: 核心处理 - 调用流式聊天函数
        // 这是整个后端流程的核心入口!
        await streamChatWithWorkspace(
          response,             // Express响应对象(用于SSE流式输出)
          workspace,            // 工作空间配置对象
          message,              // 用户消息内容
          workspace?.chatMode,  // 聊天模式: "chat"(普通对话) 或 "query"(文档查询)
          user,                 // 用户对象
          null,                 // 线程对象(null表示工作空间级别聊天)
          attachments,          // 附件列表
          isAgentMode           // 🔥 Agent模式状态，由前端按钮控制
        );

        // 🔥 步骤6: 记录遥测数据
        // 用于统计分析和监控系统使用情况
        await Telemetry.sendTelemetry("sent_chat", {
          multiUserMode: multiUserMode(response),
          LLMSelection: process.env.LLM_PROVIDER || "openai",         // AI提供商
          Embedder: process.env.EMBEDDING_ENGINE || "inherit",        // 嵌入引擎
          VectorDbSelection: process.env.VECTOR_DB || "lancedb",      // 向量数据库
          multiModal: Array.isArray(attachments) && attachments?.length !== 0, // 是否多模态
          TTSSelection: process.env.TTS_PROVIDER || "native",         // 语音合成
          LLMModel: getModelTag(),                                     // 模型标签
        });

        // 🔥 步骤7: 记录事件日志
        // 用于审计和追踪用户操作
        await EventLogs.logEvent(
          "sent_chat",
          {
            workspaceName: workspace?.name,
            chatModel: workspace?.chatModel || "System Default",
          },
          user?.id
        );

        // 🔥 步骤8: 结束响应
        response.end();
      } catch (e) {
        // 🔥 错误处理: 捕获所有异常并返回错误消息
        console.error("聊天API错误:", e);
        writeResponseChunk(response, {
          id: uuidv4(),
          type: "abort",
          textResponse: null,
          sources: [],
          close: true,
          error: e.message,
        });
        response.end();
      }
    }
  );

  app.post(
    "/workspace/:slug/thread/:threadSlug/stream-chat",
    [
      validatedRequest,
      flexUserRoleValid([ROLES.all]),
      validWorkspaceAndThreadSlug,
    ],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const { message, attachments = [], isAgentMode = false } = reqBody(request);
        const workspace = response.locals.workspace;
        const thread = response.locals.thread;

        if (!message?.length) {
          response.status(400).json({
            id: uuidv4(),
            type: "abort",
            textResponse: null,
            sources: [],
            close: true,
            error: !message?.length ? "Message is empty." : null,
          });
          return;
        }

        response.setHeader("Cache-Control", "no-cache");
        response.setHeader("Content-Type", "text/event-stream");
        response.setHeader("Access-Control-Allow-Origin", "*");
        response.setHeader("Connection", "keep-alive");
        response.flushHeaders();

        if (multiUserMode(response) && !(await User.canSendChat(user))) {
          writeResponseChunk(response, {
            id: uuidv4(),
            type: "abort",
            textResponse: null,
            sources: [],
            close: true,
            error: `You have met your maximum 24 hour chat quota of ${user.dailyMessageLimit} chats. Try again later.`,
          });
          return;
        }

        await streamChatWithWorkspace(
          response,
          workspace,
          message,
          workspace?.chatMode,
          user,
          thread,
          attachments,
          isAgentMode  // 🔥 Agent模式状态，由前端按钮控制
        );

        // If thread was renamed emit event to frontend via special `action` response.
        await WorkspaceThread.autoRenameThread({
          thread,
          workspace,
          user,
          newName: truncate(message, 22),
          onRename: (thread) => {
            writeResponseChunk(response, {
              action: "rename_thread",
              thread: {
                slug: thread.slug,
                name: thread.name,
              },
            });
          },
        });

        await Telemetry.sendTelemetry("sent_chat", {
          multiUserMode: multiUserMode(response),
          LLMSelection: process.env.LLM_PROVIDER || "openai",
          Embedder: process.env.EMBEDDING_ENGINE || "inherit",
          VectorDbSelection: process.env.VECTOR_DB || "lancedb",
          multiModal: Array.isArray(attachments) && attachments?.length !== 0,
          TTSSelection: process.env.TTS_PROVIDER || "native",
          LLMModel: getModelTag(),
        });

        await EventLogs.logEvent(
          "sent_chat",
          {
            workspaceName: workspace.name,
            thread: thread.name,
            chatModel: workspace?.chatModel || "System Default",
          },
          user?.id
        );
        response.end();
      } catch (e) {
        console.error(e);
        writeResponseChunk(response, {
          id: uuidv4(),
          type: "abort",
          textResponse: null,
          sources: [],
          close: true,
          error: e.message,
        });
        response.end();
      }
    }
  );
}

module.exports = { chatEndpoints };
