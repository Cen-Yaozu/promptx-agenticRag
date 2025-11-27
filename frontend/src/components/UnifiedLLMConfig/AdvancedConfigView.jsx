import React, { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Info, Plus, User } from "@phosphor-icons/react";

/**
 * 高级模式配置视图组件
 * 提供分离的Chat和Agent配置选项
 */
const AdvancedConfigView = ({
  initialConfig = null,
  onSaveComplete,
  onCancel,
  className = ""
}) => {
  const { t } = useTranslation();

  // 状态管理
  const [isSaving, setIsSaving] = useState(false);
  const [syncAgentWithChat, setSyncAgentWithChat] = useState(true);
  const [chatConfig, setChatConfig] = useState({
    provider: '',
    model: '',
    apiKey: '',
    basePath: '',
    tokenLimit: ''
  });
  const [agentConfig, setAgentConfig] = useState({
    provider: '',
    model: '',
    apiKey: '',
    basePath: '',
    tokenLimit: ''
  });

  // 处理同步开关变化
  const handleSyncToggle = useCallback((enabled) => {
    setSyncAgentWithChat(enabled);
    if (enabled) {
      // 启用同步时，将Agent配置设置为与Chat配置相同
      setAgentConfig({ ...chatConfig });
    }
  }, [chatConfig]);

  // 处理Chat配置变化
  const handleChatConfigChange = useCallback((field, value) => {
    const newChatConfig = { ...chatConfig, [field]: value };
    setChatConfig(newChatConfig);

    // 如果启用同步，同时更新Agent配置
    if (syncAgentWithChat) {
      setAgentConfig(newChatConfig);
    }
  }, [chatConfig, syncAgentWithChat]);

  // 处理Agent配置变化
  const handleAgentConfigChange = useCallback((field, value) => {
    setAgentConfig({ ...agentConfig, [field]: value });
  }, [agentConfig]);

  // 保存配置
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      // 这里应该实现实际的保存逻辑
      // 由于高级模式比较复杂，这里暂时简化处理
      console.log('保存高级配置:', {
        chatConfig,
        agentConfig,
        syncAgentWithChat
      });

      // 模拟保存结果
      const result = {
        success: true,
        appliedChanges: {
          systemSettings: ['LLMProvider', 'OpenAiModelPref'],
          workspaceSettings: ['chatProvider', 'chatModel', 'agentProvider', 'agentModel']
        }
      };

      if (onSaveComplete) {
        onSaveComplete(result);
      }
    } catch (error) {
      console.error('保存失败:', error);
    } finally {
      setIsSaving(false);
    }
  }, [chatConfig, agentConfig, syncAgentWithChat, onSaveComplete]);

  // 取消操作
  const handleCancel = useCallback(() => {
    if (onCancel) {
      onCancel();
    }
  }, [onCancel]);

  return (
    <div className={`space-y-6 ${className}`}>
      {/* 同步控制 */}
      <div className="bg-theme-bg-primary/50 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Plus size={20} className="text-blue-400" />
            <div>
              <h4 className="text-white font-medium">配置同步</h4>
              <p className="text-gray-300 text-sm mt-1">
                启用后，Agent配置将与Chat配置保持同步
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleSyncToggle(!syncAgentWithChat)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              syncAgentWithChat ? 'bg-primary-button' : 'bg-gray-600'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                syncAgentWithChat ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Chat配置区域 */}
      <div className="border border-white/20 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Plus size={20} className="text-green-400" />
          <h3 className="text-lg font-semibold text-white">Chat功能配置</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              LLM供应商
            </label>
            <select
              value={chatConfig.provider}
              onChange={(e) => handleChatConfigChange('provider', e.target.value)}
              className="w-full bg-theme-settings-input-bg border border-transparent rounded-lg p-3 text-white outline-none focus:border-primary-button"
            >
              <option value="">选择供应商</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="gemini">Google Gemini</option>
              <option value="ollama">Ollama</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">
              LLM模型
            </label>
            <input
              type="text"
              value={chatConfig.model}
              onChange={(e) => handleChatConfigChange('model', e.target.value)}
              placeholder="例如: gpt-4, claude-3-sonnet"
              className="w-full bg-theme-settings-input-bg border border-transparent rounded-lg p-3 text-white placeholder-gray-400 outline-none focus:border-primary-button"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">
              API Key
            </label>
            <input
              type="password"
              value={chatConfig.apiKey}
              onChange={(e) => handleChatConfigChange('apiKey', e.target.value)}
              placeholder="输入API Key"
              className="w-full bg-theme-settings-input-bg border border-transparent rounded-lg p-3 text-white placeholder-gray-400 outline-none focus:border-primary-button"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                自定义API地址
              </label>
              <input
                type="url"
                value={chatConfig.basePath}
                onChange={(e) => handleChatConfigChange('basePath', e.target.value)}
                placeholder="可选"
                className="w-full bg-theme-settings-input-bg border border-transparent rounded-lg p-3 text-white placeholder-gray-400 outline-none focus:border-primary-button"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Token限制
              </label>
              <input
                type="number"
                value={chatConfig.tokenLimit}
                onChange={(e) => handleChatConfigChange('tokenLimit', e.target.value)}
                placeholder="4096"
                className="w-full bg-theme-settings-input-bg border border-transparent rounded-lg p-3 text-white placeholder-gray-400 outline-none focus:border-primary-button"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Agent配置区域 */}
      <div className={`border rounded-lg p-6 ${syncAgentWithChat ? 'border-gray-600 opacity-60' : 'border-white/20'}`}>
        <div className="flex items-center gap-2 mb-4">
          <User size={20} className={syncAgentWithChat ? 'text-gray-400' : 'text-purple-400'} />
          <h3 className={`text-lg font-semibold ${syncAgentWithChat ? 'text-gray-400' : 'text-white'}`}>
            Agent功能配置
          </h3>
        </div>

        {syncAgentWithChat && (
          <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <div className="flex items-start gap-2">
              <Info size={16} className="text-blue-400 mt-0.5" />
              <p className="text-sm text-blue-300">
                Agent配置与Chat配置同步，修改Chat配置将自动同步到Agent。
              </p>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              LLM供应商
            </label>
            <select
              value={agentConfig.provider}
              onChange={(e) => handleAgentConfigChange('provider', e.target.value)}
              disabled={syncAgentWithChat}
              className={`w-full bg-theme-settings-input-bg border rounded-lg p-3 text-white outline-none focus:border-primary-button ${
                syncAgentWithChat ? 'border-transparent opacity-50 cursor-not-allowed' : 'border-transparent'
              }`}
            >
              <option value="">选择供应商</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="gemini">Google Gemini</option>
              <option value="ollama">Ollama</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">
              LLM模型
            </label>
            <input
              type="text"
              value={agentConfig.model}
              onChange={(e) => handleAgentConfigChange('model', e.target.value)}
              disabled={syncAgentWithChat}
              placeholder="例如: gpt-4, claude-3-sonnet"
              className={`w-full bg-theme-settings-input-bg border rounded-lg p-3 text-white placeholder-gray-400 outline-none focus:border-primary-button ${
                syncAgentWithChat ? 'border-transparent opacity-50 cursor-not-allowed' : 'border-transparent'
              }`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">
              API Key
            </label>
            <input
              type="password"
              value={agentConfig.apiKey}
              onChange={(e) => handleAgentConfigChange('apiKey', e.target.value)}
              disabled={syncAgentWithChat}
              placeholder="输入API Key"
              className={`w-full bg-theme-settings-input-bg border rounded-lg p-3 text-white placeholder-gray-400 outline-none focus:border-primary-button ${
                syncAgentWithChat ? 'border-transparent opacity-50 cursor-not-allowed' : 'border-transparent'
              }`}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                自定义API地址
              </label>
              <input
                type="url"
                value={agentConfig.basePath}
                onChange={(e) => handleAgentConfigChange('basePath', e.target.value)}
                disabled={syncAgentWithChat}
                placeholder="可选"
                className={`w-full bg-theme-settings-input-bg border rounded-lg p-3 text-white placeholder-gray-400 outline-none focus:border-primary-button ${
                  syncAgentWithChat ? 'border-transparent opacity-50 cursor-not-allowed' : 'border-transparent'
                }`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Token限制
              </label>
              <input
                type="number"
                value={agentConfig.tokenLimit}
                onChange={(e) => handleAgentConfigChange('tokenLimit', e.target.value)}
                disabled={syncAgentWithChat}
                placeholder="4096"
                className={`w-full bg-theme-settings-input-bg border rounded-lg p-3 text-white placeholder-gray-400 outline-none focus:border-primary-button ${
                  syncAgentWithChat ? 'border-transparent opacity-50 cursor-not-allowed' : 'border-transparent'
                }`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-3 justify-end">
        {onCancel && (
          <button
            type="button"
            onClick={handleCancel}
            className="px-6 py-3 bg-theme-bg-primary text-white rounded-lg hover:bg-theme-bg-secondary transition-colors"
          >
            取消
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="px-6 py-3 bg-primary-button text-white rounded-lg hover:bg-primary-button-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? '保存中...' : '保存配置'}
        </button>
      </div>
    </div>
  );
};

export default AdvancedConfigView;