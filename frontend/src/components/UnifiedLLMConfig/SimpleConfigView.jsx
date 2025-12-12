import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { CaretUpDown, X, Check, Triangle, Info } from "@phosphor-icons/react";
import ConfigManager from "@/utils/configManager";
import { AVAILABLE_LLM_PROVIDERS } from "@/pages/GeneralSettings/LLMPreference";
import showToast from "@/utils/toast";
import System from "@/models/system";

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
  const [isTestingConnection, setIsTestingConnection] = useState(false);

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

    // 移除自动获取模型列表，让用户主动触发
    console.log('[SimpleConfigView] 供应商已选择:', provider);

    validateConfig();
  }, [validateConfig]);

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
        // 移除自动验证，让用户主动触发
        break;
      case 'basePath':
        setBasePath(value);
        // 移除自动验证，让用户主动触发
        break;
      case 'tokenLimit':
        setTokenLimit(value);
        break;
      default:
        break;
    }
    validateConfig();
  }, [validateConfig]);

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

  // 测试连接并获取模型列表
  const handleTestConnection = useCallback(async () => {
    if (!selectedProvider) {
      showToast('请先选择LLM供应商', 'error');
      return;
    }

    setIsTestingConnection(true);
    setIsModelsLoading(true);
    try {
      console.log('[SimpleConfigView] 开始测试连接...', {
        provider: selectedProvider,
        apiKey: apiKey ? `${apiKey.substring(0, 10)}...` : 'null',
        basePath: basePath || 'null',
        hasApiKey: !!apiKey,
        hasBasePath: !!basePath
      });

      // 直接调用 System.customModels 来获取完整的响应信息
      const response = await System.customModels(selectedProvider, apiKey, basePath);
      
      console.log('[SimpleConfigView] API 响应:', response);

      // 检查是否有错误
      if (response.error) {
        throw new Error(response.error);
      }

      const models = response?.models || [];
      
      // 处理模型数据：支持字符串数组和对象数组两种格式
      const validModels = Array.isArray(models)
        ? models
            .map(model => {
              // 如果是字符串,直接返回
              if (typeof model === 'string') {
                return model.trim();
              }
              // 如果是对象,提取 id 字段
              if (typeof model === 'object' && model !== null && model.id) {
                return String(model.id).trim();
              }
              return null;
            })
            .filter(model => model && model.length > 0)
        : [];

      console.log('[SimpleConfigView] 处理后的模型列表:', validModels);
      setAvailableModels(validModels);
      
      if (validModels.length > 0) {
        showToast(`连接成功！获取到 ${validModels.length} 个模型`, 'success');
      } else {
        showToast('连接成功，但未获取到模型列表', 'warning');
      }
    } catch (error) {
      console.error('[SimpleConfigView] 连接测试失败:', error);
      showToast(`连接失败: ${error.message}`, 'error');
      setAvailableModels([]);
    } finally {
      setIsTestingConnection(false);
      setIsModelsLoading(false);
    }
  }, [selectedProvider, apiKey, basePath, configManager]);

  // 获取模型列表（不测试连接，只获取模型）
  const handleGetModels = useCallback(async () => {
    if (!selectedProvider) {
      showToast('请先选择LLM供应商', 'error');
      return;
    }

    setIsModelsLoading(true);
    try {
      console.log('[SimpleConfigView] 开始获取模型列表...', {
        provider: selectedProvider,
        apiKey: apiKey ? `${apiKey.substring(0, 10)}...` : 'null',
        basePath: basePath || 'null',
        hasApiKey: !!apiKey,
        hasBasePath: !!basePath
      });

      // 直接调用 System.customModels 来获取模型列表
      const response = await System.customModels(selectedProvider, apiKey, basePath);
      
      console.log('[SimpleConfigView] 获取模型 API 响应:', response);

      // 检查是否有错误
      if (response.error) {
        throw new Error(response.error);
      }

      const models = response?.models || [];
      
      // 处理模型数据：支持字符串数组和对象数组两种格式
      const validModels = Array.isArray(models)
        ? models
            .map(model => {
              // 如果是字符串,直接返回
              if (typeof model === 'string') {
                return model;
              }
              // 如果是对象,提取id字段
              if (typeof model === 'object' && model !== null) {
                return model.id || model.name || model.model || null;
              }
              return null;
            })
            .filter(Boolean) // 过滤掉null/undefined值
        : [];

      console.log('[SimpleConfigView] 处理后的模型列表:', validModels);
      setAvailableModels(validModels);

      if (validModels.length > 0) {
        showToast(`成功获取到 ${validModels.length} 个模型`, 'success');
      } else {
        showToast('未获取到模型列表', 'warning');
      }
    } catch (error) {
      console.error('[SimpleConfigView] 获取模型失败:', error);
      showToast(`获取模型失败: ${error.message}`, 'error');
      setAvailableModels([]);
    } finally {
      setIsModelsLoading(false);
    }
  }, [selectedProvider, apiKey, basePath]);

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

          // 不再自动获取模型列表，让用户主动触发
          console.log('[SimpleConfigView] 配置加载完成，供应商:', config.provider);
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

  // 移除自动获取模型的 useEffect，改为用户主动触发

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
        {/* 显示模型获取状态 */}
        {availableModels.length > 0 && !isModelsLoading && (
          <div className="mt-2 text-sm text-green-400">
            ✓ 已获取到 {availableModels.length} 个可用模型
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
      <div className="flex gap-3 justify-between">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={!selectedProvider || isTestingConnection}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isTestingConnection ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                测试连接中...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                测试连接
              </>
            )}
          </button>
          
          <button
            type="button"
            onClick={handleGetModels}
            disabled={!selectedProvider || isModelsLoading}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isModelsLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                获取模型中...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                获取模型
              </>
            )}
          </button>
        </div>
        
        <div className="flex gap-3">
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
    </div>
  );
};

export default SimpleConfigView;