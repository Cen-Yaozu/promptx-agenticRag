import { useState, useEffect } from "react";
import { Tooltip } from "react-tooltip";
import { Robot, Chat } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

// Agent 模式切换事件名
export const AGENT_MODE_TOGGLE_EVENT = "agent_mode_toggle";
export const AGENT_MODE_SUBMIT_EVENT = "agent_mode_submit";

/**
 * Agent 模式切换按钮组件
 * 允许用户在普通对话模式和 Agent 模式之间切换
 */
export default function AgentModeToggle() {
  const { t } = useTranslation();
  const [isAgentMode, setIsAgentMode] = useState(false);

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

  // 监听提交事件,如果是 Agent 模式则自动添加 @agent 前缀
  useEffect(() => {
    if (!window) return;

    const handleSubmit = (event) => {
      if (isAgentMode) {
        event.detail.isAgentMode = true;
      }
    };

    window.addEventListener(AGENT_MODE_SUBMIT_EVENT, handleSubmit);
    return () => window.removeEventListener(AGENT_MODE_SUBMIT_EVENT, handleSubmit);
  }, [isAgentMode]);

  return (
    <div
      id="agent-mode-toggle"
      data-tooltip-id="tooltip-agent-mode"
      data-tooltip-content={
        isAgentMode
          ? t("chat_window.agent_mode_active") || "Agent 模式 (带工具)"
          : t("chat_window.normal_mode_active") || "普通对话模式"
      }
      aria-label={isAgentMode ? "Agent Mode" : "Normal Mode"}
      onClick={toggleMode}
      className={`flex justify-center items-center cursor-pointer rounded-lg px-2 py-1 transition-all ${
        isAgentMode
          ? "bg-blue-500/20 border border-blue-500/50"
          : "opacity-60 hover:opacity-100"
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
  const [isAgentMode, setIsAgentMode] = useState(false);

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
