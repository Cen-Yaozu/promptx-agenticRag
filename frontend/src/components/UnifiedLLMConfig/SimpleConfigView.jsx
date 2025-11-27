import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { CaretUpDown, X, Check, Triangle, Info } from "@phosphor-icons/react";
import ConfigManager from "@/utils/configManager";
import { AVAILABLE_LLM_PROVIDERS } from "@/pages/GeneralSettings/LLMPreference";
import showToast from "@/utils/toast";

/**
 * 简单模式配置视图组件
 * 提供统一的LLM配置界面，主要面向80%的用户
 */
const SimpleConfigView = ({
  initialConfig = null,
  onSaveComplete,
  onCancel,
  className = ""
}) => {
  const { t } = useTranslation();
  const configManager = useMemo(() => new ConfigManager(), []);

  // 状态管理
  const [currentConfig, setCurrentConfig] = useState(null);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [basePath, setBasePath] = useState('');
  const [tokenLimit, setTokenLimit] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errors, setErrors] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [showProviderSearch, setShowProviderSearch] = useState(false);
  const [showModelSearch, setShowModelSearch] = useState(false);
  const [availableModels, setAvailableModels] = useState([]);
  const [isModelsLoading, setIsModelsLoading] = useState(false);

  // 可用供应商列表
  const availableProviders = useMemo(() => {
    return AVAILABLE_LLM_PROVIDERS.map(provider => ({
      value: provider.value,
      name: provider.name,
      description: provider.description,
      logo: provider.logo,
      requiredConfig: provider.requiredConfig
    }));
  }, []);

  // 过滤后的供应商列表
  const filteredProviders = useMemo(() => {
    return availableProviders.filter(provider =>
      provider.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      provider.description.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [availableProviders, searchQuery]);

  // 过滤后的模型列表
  const filteredModels = useMemo(() => {
    console.log('[SimpleConfigView] 计算 filteredModels...', {
      availableModelsLength: availableModels.length,
      searchQuery,
      availableModels
    });
    const filtered = availableModels.filter(model =>
      typeof model === 'string' && model.toLowerCase().includes(searchQuery.toLowerCase())
    );
    console.log('[SimpleConfigView] filteredModels 结果:', filtered);
    return filtered;
  }, [availableModels, searchQuery]);

  // 当前选中的供应商对象
  const selectedProviderObject = useMemo(() => {
    return availableProviders.find(p => p.value === selectedProvider);
  }, [availableProviders, selectedProvider]);

  // 验证配置
  const validateConfig = useCallback(() => {
    const newErrors = {};

    if (!selectedProvider) {
      newErrors.provider = '请选择LLM供应商';
    }

    if (!selectedModel) {
      newErrors.model = '请选择LLM模型';
    }

    // 检查必需的配置项
    if (selectedProviderObject?.requiredConfig?.some(config =>
      config.toLowerCase().includes('key') && !apiKey
    )) {
      newErrors.apiKey = '此供应商需要API Key';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [selectedProvider, selectedModel, apiKey, selectedProviderObject]);

  // 获取供应商的可用模型
  const fetchProviderModels = useCallback(async (provider, useInputCredentials = true) => {
    if (!provider) return;

    setIsModelsLoading(true);
    try {
      let models = [];

      if (useInputCredentials && apiKey) {
        // 优先使用用户输入的凭据（用户正在主动配置时）
        models = await configManager.getProviderModels(provider, apiKey, basePath);
        console.log(`[SimpleConfigView] 使用用户输入凭据获取 ${provider} 模型:`, models);
      } else {
        // 否则尝试从系统配置中获取（供应商切换时）
        models = await configManager.getProviderModels(provider, null, null);
        console.log(`[SimpleConfigView] 从系统配置获取 ${provider} 模型:`, models);
      }

      setAvailableModels(models);
    } catch (error) {
      console.warn('获取模型列表失败:', error);
      setAvailableModels([]);
      // 不显示错误，因为有些供应商不支持动态获取模型
    } finally {
      setIsModelsLoading(false);
    }
  }, [configManager, apiKey, basePath]);

  // 处理供应商选择
  const handleProviderSelect = useCallback((provider) => {
    setSelectedProvider(provider);
    setSelectedModel(''); // 清空模型选择
    setAvailableModels([]); // 清空模型列表
    setSearchQuery(''); // 清空搜索
    setShowProviderSearch(false);

    // 供应商切换时，从系统配置获取已保存的模型列表
    // 不使用当前输入的API Key，因为它可能属于其他供应商
    fetchProviderModels(provider, false);

    validateConfig();
  }, [fetchProviderModels, validateConfig]);

  // 处理模型选择
  const handleModelSelect = useCallback((model) => {
    setSelectedModel(model);
    setShowModelSearch(false);
    setSearchQuery('');
    validateConfig();
  }, [validateConfig]);

  // 处理输入变化
  const handleInputChange = useCallback((field, value) => {
    switch (field) {
      case 'apiKey':
        setApiKey(value);
        // 当用户输入新的API Key时，使用它重新获取模型列表
        if (selectedProvider && value) {
          fetchProviderModels(selectedProvider, true);
        }
        break;
      case 'basePath':
        setBasePath(value);
        // 当用户修改Base Path时，使用当前API Key重新获取模型
        if (selectedProvider && apiKey) {
          fetchProviderModels(selectedProvider, true);
        }
        break;
      case 'tokenLimit':
        setTokenLimit(value);
        break;
      default:
        break;
    }
    validateConfig();
  }, [validateConfig, selectedProvider, apiKey, fetchProviderModels]);

  // 保存配置
  const handleSave = useCallback(async () => {
    if (!validateConfig()) {
      showToast('请修正配置错误', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const config = {
        provider: selectedProvider,
        model: selectedModel,
        syncMode: 'simple',
        apiKey: apiKey || undefined,
        basePath: basePath || undefined,
        tokenLimit: tokenLimit ? parseInt(tokenLimit) : undefined
      };

      const result = await configManager.setUnifiedConfig(config);

      if (result.success) {
        showToast('配置保存成功！', 'success');
        setCurrentConfig(config);
        if (onSaveComplete) {
          onSaveComplete(result);
        }
      } else {
        showToast(`保存失败: ${result.error}`, 'error');
        if (result.warnings?.length > 0) {
          result.warnings.forEach(warning => {
            showToast(warning, 'warning');
          });
        }
      }
    } catch (error) {
      showToast(`保存配置时发生错误: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  }, [selectedProvider, selectedModel, apiKey, basePath, tokenLimit, validateConfig, configManager, onSaveComplete]);

  // 取消操作
  const handleCancel = useCallback(() => {
    if (onCancel) {
      onCancel();
    }
  }, [onCancel]);

  // 加载当前配置 - 只在组件挂载时执行一次
  useEffect(() => {
    let isMounted = true;

    const loadCurrentConfig = async () => {
      if (!isMounted) return;

      setIsLoading(true);
      try {
        const config = await configManager.getUnifiedConfig();

        if (!isMounted) return;

        setCurrentConfig(config);

        if (config && config.provider) {
          setSelectedProvider(config.provider);

          // 设置 apiKey 和 basePath 状态
          if (config.apiKey) {
            setApiKey(config.apiKey);
          }
          if (config.basePath) {
            setBasePath(config.basePath);
          }

          // 直接调用模型加载，不依赖fetchProviderModels
          setIsModelsLoading(true);
          try {
            console.log('[SimpleConfigView] 开始获取模型列表...', {
              provider: config.provider,
              hasApiKey: !!config.apiKey,
              hasBasePath: !!config.basePath
            });
            const models = await configManager.getProviderModels(
              config.provider,
              config.apiKey,
              config.basePath
            );
            console.log('[SimpleConfigView] getProviderModels 返回:', models);
            console.log('[SimpleConfigView] models 类型:', typeof models, 'isArray:', Array.isArray(models));
            console.log('[SimpleConfigView] 模型数量:', models.length);

            // ConfigManager.getProviderModels 已经返回了处理好的字符串数组
            if (isMounted) {
              setAvailableModels(models);
              console.log('[SimpleConfigView] 已设置 availableModels 状态, 数量:', models.length);
            }
          } catch (error) {
            console.warn('获取模型列表失败:', error);
            if (isMounted) {
              setAvailableModels([]);
            }
          } finally {
            if (isMounted) {
              setIsModelsLoading(false);
            }
          }
        }

        if (config && config.model) {
          setSelectedModel(config.model);
        }
      } catch (error) {
        console.error('加载配置失败:', error);
        if (isMounted) {
          showToast('加载配置失败，使用默认设置', 'error');
          // 设置默认状态以防止崩溃
          setCurrentConfig({
            provider: null,
            model: null,
            syncMode: 'simple'
          });
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadCurrentConfig();

    // 清理函数
    return () => {
      isMounted = false;
    };
  }, []); // 空依赖数组，只在挂载时执行一次

  // 当供应商改变时，从系统配置获取模型（避免使用当前输入的API Key）
  useEffect(() => {
    if (selectedProvider) {
      // 供应商切换时，从系统配置获取已保存的配置
      // 这样可以避免使用属于其他供应商的API Key
      fetchProviderModels(selectedProvider, false);
    }
  }, [selectedProvider, fetchProviderModels]); // 移除 apiKey 依赖

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <div className="text-white">加载配置中...</div>
      </div>
    );
  }

  return (
    <div className={`bg-theme-bg-secondary rounded-lg p-6 ${className}`}>
      {/* 头部 */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-white mb-2">
          统一LLM配置
        </h3>
        <div className="flex items-start gap-2 text-sm text-gray-300">
          <Info size={16} className="mt-0.5 flex-shrink-0" />
          <p>
            简单模式：此配置将同时应用于聊天和Agent功能，为您提供一致的体验。
          </p>
        </div>
      </div>

      {/* 供应商选择 */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-white mb-2">
          LLM供应商 <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowProviderSearch(!showProviderSearch);
              setShowModelSearch(false);
              setSearchQuery('');
            }}
            className={`w-full bg-theme-settings-input-bg border ${errors.provider ? 'border-red-500' : 'border-transparent'} rounded-lg p-3 text-left flex items-center justify-between hover:border-primary-button transition-colors`}
          >
            <div className="flex items-center gap-3">
              {selectedProviderObject?.logo && (
                <img
                  src={selectedProviderObject.logo}
                  alt={selectedProviderObject.name}
                  className="w-8 h-8 rounded"
                />
              )}
              <div>
                <div className="text-white font-medium">
                  {selectedProviderObject?.name || '请选择供应商'}
                </div>
                <div className="text-xs text-gray-400">
                  {selectedProviderObject?.description || ''}
                </div>
              </div>
            </div>
            <CaretUpDown size={20} className="text-gray-400" />
          </button>

          {/* 供应商搜索下拉 */}
          {showProviderSearch && (
            <>
              <div
                className="fixed inset-0 bg-black bg-opacity-50 z-10"
                onClick={() => setShowProviderSearch(false)}
              />
              <div className="absolute top-full left-0 right-0 mt-2 bg-theme-settings-input-bg border border-primary-button rounded-lg shadow-lg z-20 max-h-64 overflow-y-auto">
                <div className="p-3 border-b border-gray-600">
                  <input
                    type="text"
                    placeholder="搜索供应商..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-transparent text-white placeholder-gray-400 outline-none"
                    autoFocus
                  />
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {filteredProviders.map((provider) => (
                    <button
                      key={provider.value}
                      type="button"
                      onClick={() => handleProviderSelect(provider.value)}
                      className={`w-full p-3 text-left flex items-center gap-3 hover:bg-theme-bg-primary transition-colors ${selectedProvider === provider.value ? 'bg-theme-bg-primary' : ''}`}
                    >
                      <img
                        src={provider.logo}
                        alt={provider.name}
                        className="w-8 h-8 rounded"
                      />
                      <div className="flex-1">
                        <div className="text-white font-medium">
                          {provider.name}
                        </div>
                        <div className="text-xs text-gray-400">
                          {provider.description}
                        </div>
                      </div>
                      {selectedProvider === provider.value && (
                        <Check size={20} className="text-green-500" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
        {errors.provider && (
          <div className="mt-2 flex items-center gap-2 text-red-500 text-sm">
            <Triangle size={16} />
            <span>{errors.provider}</span>
          </div>
        )}
      </div>

      {/* 模型选择 */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-white mb-2">
          LLM模型 <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowModelSearch(!showModelSearch);
              setShowProviderSearch(false);
              setSearchQuery('');
            }}
            className={`w-full bg-theme-settings-input-bg border ${errors.model ? 'border-red-500' : 'border-transparent'} rounded-lg p-3 text-left flex items-center justify-between hover:border-primary-button transition-colors`}
          >
            <div className="text-white">
              {selectedModel || '请选择模型'}
            </div>
            <CaretUpDown size={20} className="text-gray-400" />
          </button>

          {/* 模型搜索下拉 */}
          {showModelSearch && (
            <>
              <div
                className="fixed inset-0 bg-black bg-opacity-50 z-10"
                onClick={() => setShowModelSearch(false)}
              />
              <div className="absolute top-full left-0 right-0 mt-2 bg-theme-settings-input-bg border border-primary-button rounded-lg shadow-lg z-20 max-h-64 overflow-y-auto">
                <div className="p-3 border-b border-gray-600">
                  <input
                    type="text"
                    placeholder="搜索模型..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-transparent text-white placeholder-gray-400 outline-none"
                    autoFocus
                  />
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {isModelsLoading ? (
                    <div className="p-4 text-center text-gray-400">
                      加载模型列表中...
                    </div>
                  ) : filteredModels.length > 0 ? (
                    filteredModels.map((model) => (
                      <button
                        key={model}
                        type="button"
                        onClick={() => handleModelSelect(model)}
                        className={`w-full p-3 text-left hover:bg-theme-bg-primary transition-colors ${selectedModel === model ? 'bg-theme-bg-primary' : ''}`}
                      >
                        <div className="text-white">
                          {model}
                        </div>
                        {selectedModel === model && (
                          <Check size={20} className="text-green-500 float-right" />
                        )}
                      </button>
                    ))
                  ) : (
                    <div className="p-4 text-center text-gray-400">
                      没有找到可用的模型
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
        {errors.model && (
          <div className="mt-2 flex items-center gap-2 text-red-500 text-sm">
            <Triangle size={16} />
            <span>{errors.model}</span>
          </div>
        )}
      </div>

      {/* API Key */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-white mb-2">
          API Key {selectedProviderObject?.requiredConfig?.some(config => config.toLowerCase().includes('key')) && <span className="text-red-500">*</span>}
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => handleInputChange('apiKey', e.target.value)}
          placeholder="输入API Key..."
          className={`w-full bg-theme-settings-input-bg border ${errors.apiKey ? 'border-red-500' : 'border-transparent'} rounded-lg p-3 text-white placeholder-gray-400 outline-none focus:border-primary-button transition-colors`}
        />
        {errors.apiKey && (
          <div className="mt-2 flex items-center gap-2 text-red-500 text-sm">
            <Triangle size={16} />
            <span>{errors.apiKey}</span>
          </div>
        )}
      </div>

      {/* 可选参数 */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-white mb-4">可选参数</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-300 mb-2">
              自定义API地址
            </label>
            <input
              type="url"
              value={basePath}
              onChange={(e) => handleInputChange('basePath', e.target.value)}
              placeholder="https://api.example.com/v1"
              className="w-full bg-theme-settings-input-bg border border-transparent rounded-lg p-3 text-white placeholder-gray-400 outline-none focus:border-primary-button transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-2">
              Token限制
            </label>
            <input
              type="number"
              value={tokenLimit}
              onChange={(e) => handleInputChange('tokenLimit', e.target.value)}
              placeholder="4096"
              min="1"
              max="100000"
              className="w-full bg-theme-settings-input-bg border border-transparent rounded-lg p-3 text-white placeholder-gray-400 outline-none focus:border-primary-button transition-colors"
            />
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

export default SimpleConfigView;