import { useState, useEffect } from "react";
import { Tooltip } from "react-tooltip";
import { Robot, Chat } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

// Agent 模式切换事件名
export const AGENT_MODE_TOGGLE_EVENT = "agent_mode_toggle";

/**
 * Agent 模式切换按钮组件
 * 允许用户在普通对话模式和 Agent 模式之间切换
 */
export default function AgentModeToggle() {
  const { t } = useTranslation();
  // 🔥 默认开启Agent模式，方便测试
  const [isAgentMode, setIsAgentMode] = useState(true);

  const toggleMode = () => {
    const newMode = !isAgentMode;
    setIsAgentMode(newMode);

    // 触发自定义事件通知其他组件模式已改变
    window.dispatchEvent(
      new CustomEvent(AGENT_MODE_TOGGLE_EVENT, {
        detail: { isAgentMode: newMode }
      })
    );
  };

  // 🔥 移除了监听提交事件的逻辑
  // Agent 模式现在由 ChatContainer 中的按钮状态直接控制
  // 不再需要通过事件来传递 isAgentMode 状态

  return (
    <div
      id="agent-mode-toggle"
      data-tooltip-id="tooltip-agent-mode"
      data-tooltip-content={
        isAgentMode
          ? "🤖 Agent 模式已开启 - 支持网页搜索、文件操作等高级功能"
          : "💬 普通对话模式 - 简单AI问答"
      }
      aria-label={isAgentMode ? "Agent Mode" : "Normal Mode"}
      onClick={toggleMode}
      className={`flex justify-center items-center cursor-pointer rounded-lg px-2 py-1 transition-all ${
        isAgentMode
          ? "bg-blue-500/30 border-2 border-blue-500/70 shadow-lg shadow-blue-500/20"
          : "opacity-60 hover:opacity-100 border border-gray-500/30"
      }`}
    >
      {isAgentMode ? (
        <Robot
          color={isAgentMode ? "var(--theme-primary)" : "var(--theme-sidebar-footer-icon-fill)"}
          className="w-[20px] h-[20px] pointer-events-none"
          weight="fill"
        />
      ) : (
        <Chat
          color="var(--theme-sidebar-footer-icon-fill)"
          className="w-[20px] h-[20px] pointer-events-none"
          weight="regular"
        />
      )}
      <Tooltip
        id="tooltip-agent-mode"
        place="top"
        delayShow={300}
        className="tooltip !text-xs z-99"
      />
    </div>
  );
}

/**
 * Hook to check if agent mode is active
 */
export function useAgentMode() {
  // 🔥 默认开启Agent模式，方便测试
  const [isAgentMode, setIsAgentMode] = useState(true);

  useEffect(() => {
    if (!window) return;

    const handleToggle = (event) => {
      setIsAgentMode(event.detail.isAgentMode);
    };

    window.addEventListener(AGENT_MODE_TOGGLE_EVENT, handleToggle);
    return () => window.removeEventListener(AGENT_MODE_TOGGLE_EVENT, handleToggle);
  }, []);

  return isAgentMode;
}
