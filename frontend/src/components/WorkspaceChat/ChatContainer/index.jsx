// ==================== 导入依赖模块 ====================
import { useState, useEffect, useContext } from "react";                     // React核心hooks：状态管理、副作用、上下文
import ChatHistory from "./ChatHistory";                                      // 聊天历史记录组件
import { CLEAR_ATTACHMENTS_EVENT, DndUploaderContext } from "./DnDWrapper";  // 文件拖拽上传相关：清除事件和上下文
import PromptInput, {
  PROMPT_INPUT_EVENT,
  PROMPT_INPUT_ID,
} from "./PromptInput";                                                     // 聊天输入框组件和相关常量
import Workspace from "@/models/workspace";                                  // 工作空间数据模型
import handleChat, { ABORT_STREAM_EVENT } from "@/utils/chat";               // 聊天处理函数和中断流事件
import { isMobile } from "react-device-detect";                             // 设备检测工具
import { SidebarMobileHeader } from "../../Sidebar";                        // 移动端侧边栏头部
import { useParams } from "react-router-dom";                               // React Router：获取URL参数
import { v4 } from "uuid";                                                   // UUID生成器
import handleSocketResponse, {
  websocketURI,
  AGENT_SESSION_END,
  AGENT_SESSION_START,
} from "@/utils/chat/agent";                                                // WebSocket Agent处理相关
import DnDFileUploaderWrapper from "./DnDWrapper";                          // 文件拖拽上传包装组件
import SpeechRecognition, {
  useSpeechRecognition,
} from "react-speech-recognition";                                         // 语音识别功能
import { ChatTooltips } from "./ChatTooltips";                              // 聊天提示组件
import { MetricsProvider } from "./ChatHistory/HistoricalMessage/Actions/RenderMetrics"; // 指标数据提供者

// ==================== 聊天容器组件 ====================
/**
 * 聊天容器组件：DeeChat的核心聊天界面
 * 负责管理聊天状态、处理用户输入、与AI进行对话
 *
 * @param {Object} workspace - 当前工作空间配置信息
 * @param {Array} knownHistory - 已知的聊天历史记录（可选）
 */
export default function ChatContainer({ workspace, knownHistory = [] }) {
  // ==================== 状态管理 ====================
  const { threadSlug = null } = useParams();                    // 从URL获取对话线程标识符
  const [message, setMessage] = useState("");                    // 当前输入框的消息内容
  const [loadingResponse, setLoadingResponse] = useState(false); // 是否正在等待AI响应
  const [chatHistory, setChatHistory] = useState(knownHistory); // 聊天历史记录状态
  const [socketId, setSocketId] = useState(null);               // WebSocket连接ID（用于Agent功能）
  const [websocket, setWebsocket] = useState(null);              // WebSocket连接实例
  const { files, parseAttachments } = useContext(DndUploaderContext); // 文件拖拽上传上下文

  // ==================== 事件处理函数 ====================

  /**
   * 处理输入框内容变化
   * @param {Object} event - 输入框变化事件
   */
  const handleMessageChange = (event) => {
    setMessage(event.target.value);
  };

  /**
   * 语音识别Hook配置
   * clearTranscriptOnListen: 开始监听时清除之前的转录文本
   */
  const { listening, resetTranscript } = useSpeechRecognition({
    clearTranscriptOnListen: true,
  });

  /**
   * 🔥 关键函数：同步设置消息状态和输入框内容
   * 使用事件系统来更新PromptInput组件，避免直接props传递导致的频繁重渲染
   *
   * @param {string} messageContent - 要设置的消息内容
   * @param {'replace' | 'append'} writeMode - 写入模式：替换当前文本或追加到现有文本（默认：replace）
   */
  function setMessageEmit(messageContent = "", writeMode = "replace") {
    // 更新组件内部状态
    if (writeMode === "append") {
      setMessage((prev) => prev + messageContent);  // 追加模式：在现有文本后添加
    } else {
      setMessage(messageContent ?? "");            // 替换模式：完全替换现有文本
    }

    // 🔥 关键：通过自定义事件同步更新PromptInput组件
    // 这种方式避免了props传递导致的组件重渲染，提高性能
    window.dispatchEvent(
      new CustomEvent(PROMPT_INPUT_EVENT, {
        detail: { messageContent, writeMode },
      })
    );
  }

  /**
   * 🔥 核心函数：处理用户提交消息
   * 这是用户点击发送按钮或按回车键时触发的主要函数
   *
   * @param {Object} event - 表单提交事件
   */
  const handleSubmit = async (event) => {
    event.preventDefault();  // 防止表单默认提交行为

    // 验证消息内容是否为空
    if (!message || message === "") return false;

    // 🔥 构建新的聊天历史记录
    // 包含用户消息和一个待处理的AI响应占位符
    const prevChatHistory = [
      ...chatHistory,  // 保留之前的聊天记录
      {
        content: message,                    // 用户消息内容
        role: "user",                        // 消息角色：用户
        attachments: parseAttachments(),     // 解析附件文件
      },
      {
        content: "",                         // AI回答内容（初始为空，将实时填充）
        role: "assistant",                   // 消息角色：AI助手
        pending: true,                       // 标记为待处理状态
        userMessage: message,                // 保存原始用户消息（用于AI回答的上下文）
        animate: true,                       // 启用打字动画效果
      },
    ];

    // 如果正在语音识别，停止录音
    if (listening) {
      endSTTSession();
    }

    // 🔥 更新聊天历史状态，立即显示用户消息和AI占位符
    setChatHistory(prevChatHistory);

    // 清空输入框
    setMessageEmit("");

    // 🔥 设置加载状态，触发聊天处理流程
    // 这个状态变化会触发useEffect中的fetchReply函数
    setLoadingResponse(true);
  };

  /**
   * 结束语音识别会话
   * 停止麦克风录音并清除转录文本
   */
  function endSTTSession() {
    SpeechRecognition.stopListening();  // 停止语音识别
    resetTranscript();                 // 清除转录文本缓存
  }

  /**
   * 🔥 重新生成AI回答
   * 用户点击"重新生成"按钮时调用此函数
   *
   * @param {string} chatId - 要重新生成的聊天消息ID
   */
  const regenerateAssistantMessage = (chatId) => {
    // 获取最后一条用户消息（移除当前的AI回答）
    const updatedHistory = chatHistory.slice(0, -1);
    const lastUserMessage = updatedHistory.slice(-1)[0];

    // 删除要重新生成的聊天记录
    Workspace.deleteChats(workspace.slug, [chatId])
      .then(() => {
        // 🔥 重新发送用户的最后一条消息给AI
        return sendCommand({
          text: lastUserMessage.content,        // 用户消息内容
          autoSubmit: true,                     // 自动提交
          history: updatedHistory,              // 使用更新后的历史记录
          attachments: lastUserMessage?.attachments, // 保留附件
        });
      })
      .catch((e) => console.error("重新生成失败:", e));
  };

  /**
   * 🔥 核心命令发送函数：向LLM发送命令或消息
   * 这个函数非常灵活，可以支持多种发送模式
   *
   * @param {Object} options - 发送命令的配置选项
   * @param {string} options.text - 要发送给LLM的文本内容
   * @param {boolean} options.autoSubmit - 是否自动提交（true=立即发送给AI，false=只填充到输入框）
   * @param {Array} options.history - 覆盖当前聊天历史的预设历史记录
   * @param {Array} options.attachments - 要发送给LLM的附件文件
   * @param {'replace' | 'append'} options.writeMode - 写入模式：替换或追加
   * @returns {Promise<void>}
   */
  const sendCommand = async ({
    text = "",
    autoSubmit = false,
    history = [],
    attachments = [],
    writeMode = "replace",
  } = {}) => {
    // 🔥 模式1：不自动提交，只填充到输入框
    if (!autoSubmit) {
      setMessageEmit(text, writeMode);
      return;
    }

    // 🔥 模式2：自动提交模式
    // 如果是追加模式，需要将当前输入框的内容与新文本合并
    if (writeMode === "append") {
      // 获取当前输入框的实际值（注意：不能用state中的message，因为还没更新）
      const currentText = document.getElementById(PROMPT_INPUT_ID)?.value;
      text = currentText + text;  // 合并文本
    }

    // 验证最终文本是否为空
    if (!text || text === "") return false;

    let prevChatHistory;

    // 🔥 根据是否有预设历史记录来构建聊天历史
    if (history.length > 0) {
      // 使用预设的历史记录链
      prevChatHistory = [
        ...history,  // 预设历史记录
        {
          content: "",           // AI回答占位符
          role: "assistant",      // AI角色
          pending: true,         // 待处理状态
          userMessage: text,     // 保存用户消息
          attachments,           // 附件
          animate: true,         // 启用动画
        },
      ];
    } else {
      // 使用当前聊天历史记录
      prevChatHistory = [
        ...chatHistory,  // 现有历史记录
        {
          content: text,        // 用户消息
          role: "user",         // 用户角色
          attachments,         // 附件
        },
        {
          content: "",           // AI回答占位符
          role: "assistant",     // AI角色
          pending: true,         // 待处理状态
          userMessage: text,     // 保存用户消息
          animate: true,         // 启用动画
        },
      ];
    }

    // 🔥 更新状态，触发AI响应流程
    setChatHistory(prevChatHistory);   // 更新聊天历史
    setMessageEmit("");                // 清空输入框
    setLoadingResponse(true);          // 触发聊天处理
  };

  // ==================== 核心聊天处理Effect ====================
/**
 * 🔥 这是整个聊天功能的核心副作用Effect！
 * 当loadingResponse状态变为true时，触发实际的AI聊天处理
 * 监听loadingResponse、chatHistory、workspace的变化
 */
useEffect(() => {
  /**
   * 🔥 核心聊天处理函数：处理AI响应请求
   * 这个函数负责与后端建立SSE连接，接收AI的流式回答
   */
  async function fetchReply() {
    // 获取最后一条待处理的消息
    const promptMessage =
      chatHistory.length > 0 ? chatHistory[chatHistory.length - 1] : null;

    // 获取除了最后一条消息之外的历史记录
    const remHistory = chatHistory.length > 0 ? chatHistory.slice(0, -1) : [];

    // 创建历史记录的副本，用于传递给聊天处理函数
    var _chatHistory = [...remHistory];

    // 🔥 Agent模式处理：如果有活跃的WebSocket连接，消息通过Agent处理
    if (!!websocket) {
      if (!promptMessage || !promptMessage?.userMessage) return false;

      // 清除附件显示
      window.dispatchEvent(new CustomEvent(CLEAR_ATTACHMENTS_EVENT));

      // 通过WebSocket发送用户反馈给Agent
      websocket.send(
        JSON.stringify({
          type: "awaitingFeedback",
          feedback: promptMessage?.userMessage,
        })
      );
      return;
    }

    // 🔥 普通AI模式处理
    // 验证是否有有效的用户消息
    if (!promptMessage || !promptMessage?.userMessage) return false;

    // 🔥 处理附件：
    // 如果是编辑或重新生成模式，历史记录中已经包含附件
    // 否则解析当前状态中的附件
    const attachments = promptMessage?.attachments ?? parseAttachments();

    // 清除附件显示区域
    window.dispatchEvent(new CustomEvent(CLEAR_ATTACHMENTS_EVENT));

    // 🔥 🔥 🔥 核心：调用工作空间的流式聊天API
    // 这是整个DeeChat聊天功能的核心入口点！
    await Workspace.multiplexStream({
      workspaceSlug: workspace.slug,  // 工作空间标识
      threadSlug,                     // 对话线程标识（可选）
      prompt: promptMessage.userMessage, // 用户消息内容
      chatHandler: (chatResult) =>     // 🔥 关键：SSE流式响应处理回调
        handleChat(
          chatResult,              // 流式数据块
          setLoadingResponse,      // 设置加载状态
          setChatHistory,          // 更新聊天历史
          remHistory,              // 移除最后一条消息的历史
          _chatHistory,            // 当前聊天历史
          setSocketId              // 设置WebSocket ID（用于Agent功能）
        ),
      attachments,                  // 附件文件
    });
    return;
  }

  // 只有当loadingResponse为true时才执行fetchReply
  // 这样确保只有在用户发送消息后才开始AI处理
  loadingResponse === true && fetchReply();
}, [loadingResponse, chatHistory, workspace]); // 依赖项：状态变化时重新执行Effect

  // ==================== WebSocket Agent处理Effect ====================
/**
 * 🔥 WebSocket Agent连接管理
 * 当socketId状态变化时，建立或管理Agent WebSocket连接
 * Agent功能是DeeChat的高级功能，允许AI执行复杂的任务流程
 */
useEffect(() => {
  /**
   * 🔥 处理WebSocket连接的函数
   * 负责建立、管理和关闭Agent WebSocket连接
   */
  function handleWSS() {
    try {
      // 如果没有socketId或已有连接，不重复建立连接
      if (!socketId || !!websocket) return;

      // 🔥 建立WebSocket连接到Agent服务端点
      const socket = new WebSocket(
        `${websocketURI()}/api/agent-invocation/${socketId}`
      );
      socket.supportsAgentStreaming = false;  // 标记是否支持流式Agent响应

      // 🔥 监听中断事件：用户主动中断Agent会话
      window.addEventListener(ABORT_STREAM_EVENT, () => {
        window.dispatchEvent(new CustomEvent(AGENT_SESSION_END));  // 通知其他组件Agent会话结束
        websocket.close();  // 关闭WebSocket连接
      });

      // 🔥 监听WebSocket消息：接收Agent的实时响应
      socket.addEventListener("message", (event) => {
        setLoadingResponse(true);  // 设置加载状态

        try {
          // 🔥 处理Agent响应消息
          handleSocketResponse(socket, event, setChatHistory);
        } catch (e) {
          console.error("解析Agent响应失败:", e);
          // 解析失败时结束Agent会话
          window.dispatchEvent(new CustomEvent(AGENT_SESSION_END));
          socket.close();
        }
        setLoadingResponse(false);  // 结束加载状态
      });

      // 🔥 监听WebSocket关闭事件：Agent会话结束
      socket.addEventListener("close", (_event) => {
        window.dispatchEvent(new CustomEvent(AGENT_SESSION_END));  // 通知其他组件

        // 🔥 添加Agent会话完成消息到聊天历史
        setChatHistory((prev) => [
          ...prev.filter((msg) => !!msg.content),  // 保留有内容的消息
          {
            uuid: v4(),
            type: "statusResponse",
            content: "Agent session complete.",      // 会话完成提示
            role: "assistant",
            sources: [],
            closed: true,
            error: null,
            animate: false,
            pending: false,
          },
        ]);

        // 🔥 清理连接状态
        setLoadingResponse(false);
        setWebsocket(null);
        setSocketId(null);
      });

      // 🔥 设置WebSocket实例到状态
      setWebsocket(socket);

      // 🔥 触发Agent会话开始事件
      window.dispatchEvent(new CustomEvent(AGENT_SESSION_START));
      window.dispatchEvent(new CustomEvent(CLEAR_ATTACHMENTS_EVENT));

    } catch (e) {
      // 🔥 WebSocket连接失败处理
      console.error("WebSocket连接失败:", e);

      // 添加错误消息到聊天历史
      setChatHistory((prev) => [
        ...prev.filter((msg) => !!msg.content),
        {
          uuid: v4(),
          type: "abort",
          content: e.message,          // 错误信息
          role: "assistant",
          sources: [],
          closed: true,
          error: e.message,
          animate: false,
          pending: false,
        },
      ]);

      // 清理状态
      setLoadingResponse(false);
      setWebsocket(null);
      setSocketId(null);
    }
  }

  handleWSS();  // 执行WebSocket处理
}, [socketId]);  // 依赖项：socketId变化时重新建立连接

  // ==================== 组件渲染 ====================
return (
    <div
      style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}  // 移动端全高，桌面端减去边距
      className="transition-all duration-500 relative md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll no-scroll z-[2]"
    >
      {/* 移动端侧边栏头部 */}
      {isMobile && <SidebarMobileHeader />}

      {/* 🔥 文件拖拽上传包装器：支持拖拽文件到聊天区域 */}
      <DnDFileUploaderWrapper>
        {/* 🔥 指标数据提供者：为聊天消息提供性能和交互指标 */}
        <MetricsProvider>
          {/* 🔥 聊天历史记录组件：显示所有对话消息 */}
          <ChatHistory
            history={chatHistory}                              // 聊天历史数据
            workspace={workspace}                              // 工作空间信息
            sendCommand={sendCommand}                          // 发送命令函数
            updateHistory={setChatHistory}                     // 更新历史记录函数
            regenerateAssistantMessage={regenerateAssistantMessage} // 重新生成回答函数
            hasAttachments={files.length > 0}                 // 是否有附件
          />
        </MetricsProvider>

        {/* 🔥 消息输入框组件：用户输入消息的界面 */}
        <PromptInput
          submit={handleSubmit}           // 提交处理函数
          onChange={handleMessageChange}  // 输入变化处理函数
          isStreaming={loadingResponse}  // 是否正在流式响应
          sendCommand={sendCommand}      // 发送命令函数
          attachments={files}            // 附件文件列表
        />
      </DnDFileUploaderWrapper>

      {/* 🔥 聊天提示组件：显示操作提示和快捷键信息 */}
      <ChatTooltips />
    </div>
  );
}
