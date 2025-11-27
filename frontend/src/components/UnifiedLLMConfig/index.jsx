import React, { useState, useCallback } from "react";
import SimpleConfigView from "./SimpleConfigView";
import AdvancedConfigView from "./AdvancedConfigView";
import ConfigStatus from "./ConfigStatus";

/**
 * 统一LLM配置主组件
 * 提供简单模式和高级模式两种配置界面
 */
const UnifiedLLMConfig = ({
  mode = "simple", // 'simple' | 'advanced'
  initialConfig = null,
  onSaveComplete,
  onCancel,
  showStatus = true,
  className = ""
}) => {
  const [currentMode, setCurrentMode] = useState(mode);
  const [lastSaveResult, setLastSaveResult] = useState(null);

  // 处理模式切换
  const handleModeChange = useCallback((newMode) => {
    setCurrentMode(newMode);
  }, []);

  // 处理保存完成
  const handleSaveComplete = useCallback((result) => {
    setLastSaveResult(result);
    if (onSaveComplete) {
      onSaveComplete(result);
    }
  }, [onSaveComplete]);

  // 处理取消
  const handleCancel = useCallback(() => {
    if (onCancel) {
      onCancel();
    }
  }, [onCancel]);

  return (
    <div className={`w-full max-w-4xl mx-auto ${className}`}>
      {/* 标题区域 */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white mb-2">
          LLM配置管理
        </h2>
        <p className="text-gray-300">
          配置您的语言模型供应商和设置，支持聊天和Agent功能。
        </p>
      </div>

      {/* 状态显示 */}
      {showStatus && (
        <div className="mb-6">
          <ConfigStatus lastSaveResult={lastSaveResult} />
        </div>
      )}

      {/* 模式切换 */}
      <div className="mb-6">
        <div className="flex gap-2 p-1 bg-theme-settings-input-bg rounded-lg">
          <button
            type="button"
            onClick={() => handleModeChange('simple')}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              currentMode === 'simple'
                ? 'bg-primary-button text-white'
                : 'text-gray-300 hover:text-white'
            }`}
          >
            简单模式
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('advanced')}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              currentMode === 'advanced'
                ? 'bg-primary-button text-white'
                : 'text-gray-300 hover:text-white'
            }`}
          >
            高级模式
          </button>
        </div>

        {/* 模式内容 */}
        <div className="mt-6">
          {currentMode === 'simple' ? (
            <div className="bg-theme-bg-secondary rounded-lg p-6">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-white mb-2">
                  简单模式
                </h3>
                <p className="text-gray-300 text-sm">
                  快速配置LLM，适用于大多数用户。配置将同时应用于聊天和Agent功能。
                </p>
              </div>
              <SimpleConfigView
                initialConfig={initialConfig}
                onSaveComplete={handleSaveComplete}
                onCancel={onCancel}
              />
            </div>
          ) : (
            <div className="bg-theme-bg-secondary rounded-lg p-6">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-white mb-2">
                  高级模式
                </h3>
                <p className="text-gray-300 text-sm">
                  分别为聊天和Agent功能配置不同的LLM，提供更精细的控制。
                </p>
              </div>
              <AdvancedConfigView
                initialConfig={initialConfig}
                onSaveComplete={handleSaveComplete}
                onCancel={onCancel}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UnifiedLLMConfig;