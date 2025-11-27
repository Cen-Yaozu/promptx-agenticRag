import System from "@/models/system";
import { AVAILABLE_LLM_PROVIDERS } from "@/pages/GeneralSettings/LLMPreference";

/**
 * 配置验证器
 */
class ConfigValidator {
  validate(config) {
    const errors = [];

    // 必需参数验证
    if (!config.provider) {
      errors.push("Provider is required");
    }

    if (!config.model) {
      errors.push("Model is required");
    }

    if (!config.syncMode || !['simple', 'advanced'].includes(config.syncMode)) {
      errors.push("Sync mode must be 'simple' or 'advanced'");
    }

    // 供应商验证
    const validProviders = AVAILABLE_LLM_PROVIDERS.map(p => p.value);
    if (config.provider && !validProviders.includes(config.provider)) {
      errors.push(`Invalid provider: ${config.provider}. Must be one of: ${validProviders.join(', ')}`);
    }

    // 高级模式特定验证
    if (config.syncMode === 'advanced') {
      if (config.agentProvider && !validProviders.includes(config.agentProvider)) {
        errors.push(`Invalid agent provider: ${config.agentProvider}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  sanitizeConfig(config) {
    // 移除敏感信息用于日志记录
    const sanitized = { ...config };
    if (sanitized.apiKey) {
      sanitized.apiKey = this.maskApiKey(sanitized.apiKey);
    }
    return sanitized;
  }

  maskApiKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
      return '';
    }
    if (apiKey.length <= 8) {
      return '*'.repeat(apiKey.length);
    }
    return apiKey.substring(0, 4) + '*'.repeat(apiKey.length - 8) + apiKey.substring(apiKey.length - 4);
  }
}

/**
 * 配置冲突检测器
 */
class ConflictDetector {
  detect(newConfig, currentConfig) {
    const conflicts = [];

    if (!currentConfig) {
      return conflicts;
    }

    // 检测供应商不匹配
    if (this.hasProviderMismatch(newConfig, currentConfig)) {
      conflicts.push({
        type: 'provider_mismatch',
        severity: 'medium',
        message: 'Chat和Agent使用了不同的供应商',
        suggestedAction: '建议使用同步模式确保配置一致性，或确保不同供应商的配置都正确'
      });
    }

    // 检测模型不匹配
    if (this.hasModelMismatch(newConfig, currentConfig)) {
      conflicts.push({
        type: 'model_mismatch',
        severity: 'low',
        message: 'Chat和Agent使用了不同的模型',
        suggestedAction: '请确认这是预期行为，不同模型可能产生不同的结果'
      });
    }

    // 检测API Key缺失
    if (this.hasMissingApiKey(newConfig)) {
      conflicts.push({
        type: 'api_key_missing',
        severity: 'high',
        message: '缺少必需的API Key',
        suggestedAction: '请提供有效的API Key以使用该服务'
      });
    }

    return conflicts.sort((a, b) => this.getSeverityWeight(b.severity) - this.getSeverityWeight(a.severity));
  }

  hasProviderMismatch(newConfig, currentConfig) {
    if (!newConfig || !currentConfig?.workspaceConfig) return false;

    const { agentProvider, agentModel } = currentConfig.workspaceConfig;
    return newConfig.syncMode === 'simple' &&
           agentProvider &&
           agentProvider !== newConfig.provider;
  }

  hasModelMismatch(newConfig, currentConfig) {
    if (!newConfig || !currentConfig?.workspaceConfig) return false;

    const { agentProvider, agentModel } = currentConfig.workspaceConfig;
    return newConfig.syncMode === 'simple' &&
           agentProvider === newConfig.provider &&
           agentModel &&
           agentModel !== newConfig.model;
  }

  hasMissingApiKey(newConfig) {
    if (!newConfig || !newConfig.provider) return true;

    const providerConfig = AVAILABLE_LLM_PROVIDERS.find(p => p.value === newConfig.provider);
    if (!providerConfig) return true;

    // 检查是否有必需的配置项缺失
    return providerConfig.requiredConfig.some(configKey => {
      // 简单检查，实际实现中需要更复杂的逻辑
      return !newConfig.apiKey && configKey.toLowerCase().includes('key');
    });
  }

  getSeverityWeight(severity) {
    switch (severity) {
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
      default: return 0;
    }
  }
}

/**
 * 配置同步引擎
 */
class SyncEngine {
  buildUpdateData(config, configManager) {
    if (config.syncMode === 'simple') {
      return this.buildSimpleModeUpdateData(config, configManager);
    } else {
      return this.buildAdvancedModeUpdateData(config, configManager);
    }
  }

  buildSimpleModeUpdateData(config, configManager) {
    // 简单模式：统一配置，同步到所有层
    if (!config || !config.provider) {
      throw new Error('Config provider is required for simple mode');
    }

    const modelKey = configManager.getProviderConfigKey(config.provider, 'ModelPref');
    const baseConfig = {
      // 系统级配置
      LLMProvider: config.provider,
      [modelKey]: config.model
    };

    console.log('[SyncEngine] 构建简单模式更新数据:', {
      provider: config.provider,
      model: config.model,
      modelKey,
      hasApiKey: !!config.apiKey,
      hasBasePath: !!config.basePath,
      basePath: config.basePath
    });

    // 添加API Key（如果提供）
    if (config.apiKey) {
      const apiKeyKey = configManager.getProviderConfigKey(config.provider, 'Key');
      baseConfig[apiKeyKey] = config.apiKey;
      console.log('[SyncEngine] 添加API Key,键名:', apiKeyKey);
    }

    // 添加 Base Path（如果提供）- 对于 generic-openai 等需要自定义端点的提供商
    if (config.basePath) {
      const basePathKey = configManager.getProviderConfigKey(config.provider, 'BasePath');
      baseConfig[basePathKey] = config.basePath;
      console.log('[SyncEngine] 添加Base Path,键名:', basePathKey, '值:', config.basePath);
    }

    console.log('[SyncEngine] 最终更新数据:', baseConfig);

    return baseConfig;
  }

  buildAdvancedModeUpdateData(config, configManager) {
    // 高级模式:分离配置
    if (!config || !config.provider) {
      throw new Error('Config provider is required for advanced mode');
    }

    const baseConfig = {
      // 系统级配置 - 使用主要配置
      LLMProvider: config.provider,
      [configManager.getProviderConfigKey(config.provider, 'ModelPref')]: config.model
    };

    // 添加API Key（如果提供）
    if (config.apiKey) {
      baseConfig[configManager.getProviderConfigKey(config.provider, 'Key')] = config.apiKey;
    }

    // 添加 Base Path（如果提供）
    if (config.basePath) {
      baseConfig[configManager.getProviderConfigKey(config.provider, 'BasePath')] = config.basePath;
    }

    return baseConfig;
  }
}

/**
 * 配置缓存管理器
 */
class ConfigCache {
  constructor() {
    this.cache = new Map();
    this.ttl = 5 * 60 * 1000; // 5分钟过期
    this.cacheKey = 'unified_config_cache';
  }

  get(config) {
    // 检查内存缓存
    if (this.cache.has(this.cacheKey)) {
      const item = this.cache.get(this.cacheKey);
      if (!this.isExpired(item)) {
        return item.data;
      }
    }

    // 检查localStorage缓存
    try {
      const cached = localStorage.getItem(this.cacheKey);
      if (cached) {
        const item = JSON.parse(cached);
        if (!this.isExpired(item)) {
          this.cache.set(this.cacheKey, item);
          return item.data;
        }
      }
    } catch (error) {
      console.warn('Failed to read config cache from localStorage:', error);
    }

    return null;
  }

  set(data) {
    const item = {
      data,
      timestamp: Date.now()
    };

    // 内存缓存
    this.cache.set(this.cacheKey, item);

    // localStorage缓存
    try {
      localStorage.setItem(this.cacheKey, JSON.stringify(item));
    } catch (error) {
      console.warn('Failed to write config cache to localStorage:', error);
    }
  }

  clear() {
    this.cache.delete(this.cacheKey);
    try {
      localStorage.removeItem(this.cacheKey);
    } catch (error) {
      console.warn('Failed to clear config cache from localStorage:', error);
    }
  }

  isExpired(item) {
    return !item || Date.now() - item.timestamp > this.ttl;
  }
}

/**
 * DeeConfig API适配器
 * 使用我们新创建的LLM配置继承API
 */
class DeeConfigAPIAdapter {
  constructor() {
    this.baseURL = '/api/deeconfig';
  }

  async updateSystem(updateData) {
    try {
      // 从updateData中提取配置信息
      const config = this.extractConfigFromUpdateData(updateData);

      const response = await fetch(`${this.baseURL}/system`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Failed to update system config');
      }

      return result;
    } catch (error) {
      console.error('[DeeConfigAPIAdapter] updateSystem failed:', error);
      return { error: error.message || 'Failed to update system' };
    }
  }

  async getSystemConfig() {
    try {
      const response = await fetch(`${this.baseURL}/system`);
      const result = await response.json();

      if (!result.success) {
        console.warn('[DeeConfigAPIAdapter] Failed to get system config:', result.message);
        return {
          provider: null,
          model: null,
          apiKey: null,
          basePath: null
        };
      }

      return result.data || {
        provider: null,
        model: null,
        apiKey: null,
        basePath: null
      };
    } catch (error) {
      console.error('[DeeConfigAPIAdapter] getSystemConfig failed:', error);
      return {
        provider: null,
        model: null,
        apiKey: null,
        basePath: null
      };
    }
  }

  async getWorkspaceConfig(workspaceId = null) {
    try {
      // 如果没有提供workspaceId，尝试从URL或全局状态获取
      if (!workspaceId) {
        workspaceId = this.getCurrentWorkspaceId();
      }

      if (!workspaceId) {
        return {
          chatProvider: null,
          chatModel: null,
          agentProvider: null,
          agentModel: null
        };
      }

      const response = await fetch(`${this.baseURL}/workspaces/${workspaceId}`);
      const result = await response.json();

      if (!result.success) {
        console.warn('[DeeConfigAPIAdapter] Failed to get workspace config:', result.message);
        return {
          chatProvider: null,
          chatModel: null,
          agentProvider: null,
          agentModel: null
        };
      }

      const config = result.data || {};

      // 将统一的工作区配置转换为chat/agent分离的格式
      return {
        chatProvider: config.provider || null,
        chatModel: config.model || null,
        agentProvider: config.provider || null,  // 目前使用统一的provider
        agentModel: config.model || null,      // 目前使用统一的model
        inherited: config.inherited || false,
        source: config.source || 'none'
      };
    } catch (error) {
      console.error('[DeeConfigAPIAdapter] getWorkspaceConfig failed:', error);
      return {
        chatProvider: null,
        chatModel: null,
        agentProvider: null,
        agentModel: null
      };
    }
  }

  /**
   * 从系统更新数据中提取LLM配置
   */
  extractConfigFromUpdateData(updateData) {
    const config = {};

    // 检测LLM提供商
    if (updateData.LLMProvider) {
      config.provider = updateData.LLMProvider;
    }

    // 根据提供商提取对应的模型配置
    if (updateData.OpenAiModelPref) {
      config.model = updateData.OpenAiModelPref;
      config.apiKey = updateData.OpenAiKey;
    } else if (updateData.AnthropicModelPref) {
      config.model = updateData.AnthropicModelPref;
      config.apiKey = updateData.AnthropicApiKey;
    } else if (updateData.GeminiLLMModelPref) {
      config.model = updateData.GeminiLLMModelPref;
      config.apiKey = updateData.GeminiLLMApiKey;
    } else if (updateData.OllamaLLMModelPref) {
      config.model = updateData.OllamaLLMModelPref;
      config.basePath = updateData.OllamaLLMBasePath;
    } else if (updateData.LMStudioModelPref) {
      config.model = updateData.LMStudioModelPref;
      config.basePath = updateData.LMStudioBasePath;
    } else if (updateData.GenericOpenAiModelPref) {
      config.model = updateData.GenericOpenAiModelPref;
      config.apiKey = updateData.GenericOpenAiKey;
      config.basePath = updateData.GenericOpenAiBasePath;
    }

    return config;
  }

  /**
   * 获取当前工作区ID（从URL或全局状态）
   */
  getCurrentWorkspaceId() {
    // 尝试从URL获取workspace ID
    const urlParams = new URLSearchParams(window.location.search);
    const workspaceId = urlParams.get('workspace');

    if (workspaceId) {
      return parseInt(workspaceId);
    }

    // 尝试从全局状态获取（如果有）
    if (window.currentWorkspace?.id) {
      return window.currentWorkspace.id;
    }

    // 尝试从localStorage获取
    try {
      const saved = localStorage.getItem('currentWorkspace');
      if (saved) {
        const workspace = JSON.parse(saved);
        return workspace.id;
      }
    } catch (error) {
      console.warn('Failed to get workspace from localStorage:', error);
    }

    return null;
  }
}

/**
 * 统一配置管理器
 */
class ConfigManager {
  constructor() {
    this.systemAPI = new DeeConfigAPIAdapter();  // 使用新的DeeConfig API
    this.validator = new ConfigValidator();
    this.conflictDetector = new ConflictDetector();
    this.syncEngine = new SyncEngine();
    this.cache = new ConfigCache();
  }

  /**
   * 统一配置设置接口
   * @param {Object} config - 配置对象
   * @returns {Promise<Object>} 设置结果
   */
  async setUnifiedConfig(config) {
    const startTime = Date.now();

    try {
      // 1. 参数验证
      const validation = this.validator.validate(config);
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      // 2. 获取当前配置
      const currentConfig = await this.getUnifiedConfig();

      // 3. 冲突检测
      const conflicts = this.conflictDetector.detect(config, currentConfig);

      // 4. 构建更新数据
      const updateData = this.syncEngine.buildUpdateData(config, this);

      console.log('[ConfigManager] 准备保存配置:', {
        config,
        updateData,
        keys: Object.keys(updateData)
      });

      // 5. 批量更新配置
      const response = await this.systemAPI.updateSystem(updateData);

      console.log('[ConfigManager] 保存响应:', response);

      // 6. 清除缓存
      this.cache.clear();

      const result = {
        success: !response.error,
        error: response.error,
        warnings: conflicts.map(c => c.message),
        appliedChanges: {
          systemSettings: Object.keys(updateData),
          workspaceSettings: [] // 系统级更新暂时不影响工作空间
        },
        conflicts,
        duration: Date.now() - startTime
      };

      // 记录操作日志
      this.trackConfigOperation('set_unified_config', config, result);

      return result;
    } catch (error) {
      const result = {
        success: false,
        error: error.message,
        warnings: [],
        appliedChanges: {
          systemSettings: [],
          workspaceSettings: []
        },
        conflicts: [],
        duration: Date.now() - startTime
      };

      this.trackConfigOperation('set_unified_config', config, result);

      return result;
    }
  }

  /**
   * 统一配置获取接口
   * @returns {Promise<Object>} 当前配置状态
   */
  async getUnifiedConfig() {
    const startTime = Date.now();

    try {
      // 1. 检查缓存
      const cachedConfig = this.cache.get();
      if (cachedConfig) {
        return {
          ...cachedConfig,
          fromCache: true,
          duration: Date.now() - startTime
        };
      }

      // 2. 并行获取系统和配置信息
      const [systemConfig, workspaceConfig] = await Promise.all([
        this.systemAPI.getSystemConfig(),
        this.systemAPI.getWorkspaceConfig()
      ]);

      // 3. 聚合配置状态
      const unifiedConfig = this.aggregateConfigs(systemConfig, workspaceConfig);

      // 4. 检测冲突
      const conflicts = this.conflictDetector.detect(null, unifiedConfig);

      // 5. 生成建议
      const recommendations = this.generateRecommendations(unifiedConfig, conflicts);

      const result = {
        ...unifiedConfig,
        conflicts,
        recommendations,
        fromCache: false,
        duration: Date.now() - startTime
      };

      // 6. 更新缓存
      this.cache.set(result);

      return result;
    } catch (error) {
      console.error('ConfigManager.getUnifiedConfig error:', error);
      throw new Error(`Failed to get unified config: ${error.message}`);
    }
  }

  /**
   * 聚合多层配置
   */
  aggregateConfigs(systemConfig, workspaceConfig) {
    return {
      provider: systemConfig?.provider || null,
      model: systemConfig?.model || null,
      apiKey: systemConfig?.apiKey || null,
      basePath: systemConfig?.basePath || null,
      syncMode: this.determineSyncMode(systemConfig, workspaceConfig),
      isCurrentlySynced: this.checkIfSynced(systemConfig, workspaceConfig),

      // 详细配置
      systemConfig: systemConfig || {
        provider: null,
        model: null,
        apiKey: null,
        basePath: null
      },
      workspaceConfig: workspaceConfig || {
        chatProvider: null,
        chatModel: null,
        agentProvider: null,
        agentModel: null
      }
    };
  }

  /**
   * 确定当前同步模式
   */
  determineSyncMode(systemConfig, workspaceConfig) {
    // 如果工作空间没有独立的Agent配置，则为简单模式
    if (!workspaceConfig?.agentProvider ||
        workspaceConfig?.agentProvider === systemConfig?.provider) {
      return 'simple';
    }
    return 'advanced';
  }

  /**
   * 检查配置是否同步
   */
  checkIfSynced(systemConfig, workspaceConfig) {
    if (!systemConfig || !workspaceConfig) return true;

    return systemConfig?.provider === workspaceConfig?.chatProvider &&
           systemConfig?.model === workspaceConfig?.chatModel &&
           systemConfig?.provider === workspaceConfig?.agentProvider &&
           systemConfig?.model === workspaceConfig?.agentModel;
  }

  /**
   * 生成配置建议
   */
  generateRecommendations(config, conflicts) {
    const recommendations = [];

    if (conflicts.length > 0) {
      recommendations.push("发现配置冲突，建议检查并解决冲突项");
    }

    if (!config.provider) {
      recommendations.push("建议配置默认LLM供应商以获得最佳体验");
    }

    if (!config.model) {
      recommendations.push("建议配置默认LLM模型以获得最佳体验");
    }

    if (config.syncMode === 'advanced' && !config.workspaceConfig?.agentProvider) {
      recommendations.push("高级模式下建议为Agent功能配置专用LLM");
    }

    return recommendations;
  }

  /**
   * 获取供应商特定的配置键名
   */
  getProviderConfigKey(provider, suffix) {
    const providerKeyMap = {
      'openai': 'OpenAi',
      'azure': 'AzureOpenAi',
      'anthropic': 'AnthropicApi',
      'gemini': 'GeminiLLM',
      'ollama': 'OllamaLLM',
      'lmstudio': 'LMStudio',
      'localai': 'LocalAi',
      'togetherai': 'TogetherAi',
      'fireworksai': 'FireworksAiLLM',
      'mistral': 'Mistral',
      'perplexity': 'Perplexity',
      'openrouter': 'OpenRouter',
      'groq': 'Groq',
      'koboldcpp': 'KoboldCPP',
      'textgenwebui': 'TextGenWebUI',
      'cohere': 'Cohere',
      'litellm': 'LiteLLM',
      'bedrock': 'AwsBedrockLLM',
      'deepseek': 'DeepSeek',
      'apipie': 'ApipieLLM',
      'xai': 'XAi',
      'zai': 'ZAi',
      'nvidia-nim': 'NvidiaNimLLM',
      'ppio': 'PPIO',
      'generic-openai': 'GenericOpenAi'
    };

    const prefix = providerKeyMap[provider] || provider;
    return `${prefix}${suffix}`;
  }

  /**
   * 配置操作监控
   */
  trackConfigOperation(operation, config, result) {
    try {
      const event = {
        timestamp: Date.now(),
        operation,
        provider: config?.provider || null,
        model: config?.model || null,
        syncMode: config?.syncMode || 'simple',
        success: result?.success || false,
        error: result?.error || null,
        duration: result?.duration || 0,
        conflictsCount: result?.conflicts?.length || 0
      };

      // 发送到监控系统（如果存在）
      if (window.analytics) {
        window.analytics.track('config_operation', event);
      }

      // 本地日志记录
      console.log('ConfigManager:', {
        operation,
        config: this.validator.sanitizeConfig(config),
        result: {
          success: result.success,
          error: result.error,
          duration: result.duration
        }
      });
    } catch (error) {
      console.warn('Failed to track config operation:', error);
    }
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * 获取可用的供应商列表
   */
  getAvailableProviders() {
    return AVAILABLE_LLM_PROVIDERS.map(provider => ({
      value: provider.value,
      name: provider.name,
      description: provider.description,
      logo: provider.logo,
      requiredConfig: provider.requiredConfig
    }));
  }

  /**
   * 获取供应商的可用模型
   */
  async getProviderModels(provider, apiKey = null, basePath = null) {
    try {
      console.log(`[ConfigManager] 正在获取 ${provider} 的模型列表...`, {
        provider,
        hasApiKey: !!apiKey,
        basePath
      });

      // 使用System.customModels获取模型列表（保持与原有逻辑兼容）
      const response = await System.customModels(provider, apiKey, basePath);

      console.log(`[ConfigManager] System.customModels 响应:`, response);

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

      console.log(`[ConfigManager] 有效模型列表:`, validModels);

      return validModels;
    } catch (error) {
      console.error(`[ConfigManager] 获取 ${provider} 模型失败:`, error);
      return [];
    }
  }
}

export default ConfigManager;
export { ConfigValidator, ConflictDetector, SyncEngine, ConfigCache };