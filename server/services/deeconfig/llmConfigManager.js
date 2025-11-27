const prisma = require('../../utils/prisma');
const { getBaseLLMProviderModel } = require('../../utils/helpers');

/**
 * 简化的LLM配置管理器
 * 专门处理LLM配置的继承和同步
 */
class LLMConfigManager {
  constructor(logger = console) {
    this.logger = logger;
    this.configCache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5分钟缓存
  }

  /**
   * 获取工作区的LLM配置（支持继承机制）
   * @param {number} workspaceId - 工作区ID
   * @returns {Promise<Object>} LLM配置对象
   */
  async getWorkspaceLLMConfig(workspaceId) {
    try {
      // 检查缓存
      const cacheKey = `workspace_${workspaceId}`;
      if (this.configCache.has(cacheKey)) {
        const cached = this.configCache.get(cacheKey);
        if (!this.isCacheExpired(cached)) {
          return cached.config;
        }
      }

      // 1. 尝试获取工作区级配置
      const workspaceConfig = await this.getWorkspaceLLMConfigDirect(workspaceId);

      if (workspaceConfig && this.isValidConfig(workspaceConfig)) {
        // 工作区有独立配置
        const result = {
          ...workspaceConfig,
          source: 'workspace',
          inherited: false
        };

        this.updateCache(cacheKey, result);
        return result;
      }

      // 2. 获取系统默认配置
      const systemConfig = await this.getSystemLLMConfig();

      if (systemConfig && this.isValidConfig(systemConfig)) {
        const result = {
          ...systemConfig,
          source: 'system',
          inherited: true
        };

        this.updateCache(cacheKey, result);
        return result;
      }

      // 3. 都没有配置，返回null
      const result = {
        provider: null,
        model: null,
        apiKey: null,
        basePath: null,
        source: 'none',
        inherited: false
      };

      this.updateCache(cacheKey, result);
      return result;

    } catch (error) {
      this.logger.error(`获取工作区LLM配置失败 [workspaceId: ${workspaceId}]:`, error.message);
      throw new Error(`获取工作区LLM配置失败: ${error.message}`);
    }
  }

  /**
   * 直接获取工作区级配置（不考虑继承）
   * @param {number} workspaceId - 工作区ID
   * @returns {Promise<Object|null>} 工作区配置或null
   */
  async getWorkspaceLLMConfigDirect(workspaceId) {
    try {
      // 查询系统设置中的工作区LLM配置
      const { SystemSettings } = require('../../models/systemSettings');

      const workspaceLLMProvider = await SystemSettings.get({
        label: `workspace_${workspaceId}_llm_provider`
      });

      const workspaceLLMModel = await SystemSettings.get({
        label: `workspace_${workspaceId}_llm_model`
      });

      const workspaceLLMApiKey = await SystemSettings.get({
        label: `workspace_${workspaceId}_llm_api_key`
      });

      const workspaceLLMBasePath = await SystemSettings.get({
        label: `workspace_${workspaceId}_llm_base_path`
      });

      // 如果没有provider配置，说明工作区没有独立配置
      if (!workspaceLLMProvider?.value) {
        return null;
      }

      return {
        provider: workspaceLLMProvider.value,
        model: workspaceLLMModel?.value || null,
        apiKey: workspaceLLMApiKey?.value || null,
        basePath: workspaceLLMBasePath?.value || null
      };

    } catch (error) {
      this.logger.error(`获取工作区直接LLM配置失败 [workspaceId: ${workspaceId}]:`, error.message);
      return null;
    }
  }

  /**
   * 获取系统默认LLM配置
   * @returns {Promise<Object|null>} 系统配置或null
   */
  async getSystemLLMConfig() {
    try {
      // 从环境变量读取系统配置
      const provider = process.env.LLM_PROVIDER;
      const model = getBaseLLMProviderModel({ provider });

      if (!provider || !model) {
        return null;
      }

      // 根据provider获取对应的配置
      const config = {
        provider,
        model
      };

      // 获取API Key
      switch (provider) {
        case 'openai':
          config.apiKey = process.env.OPEN_AI_KEY;
          break;
        case 'anthropic':
          config.apiKey = process.env.ANTHROPIC_API_KEY;
          break;
        case 'gemini':
          config.apiKey = process.env.GEMINI_API_KEY;
          break;
        case 'ollama':
          config.basePath = process.env.OLLAMA_BASE_PATH;
          break;
        case 'lmstudio':
          config.basePath = process.env.LMSTUDIO_BASE_PATH;
          break;
        case 'generic-openai':
          config.apiKey = process.env.GENERIC_OPEN_AI_API_KEY;
          config.basePath = process.env.GENERIC_OPEN_AI_BASE_PATH;
          break;
        // 添加更多provider的支持...
      }

      return config;

    } catch (error) {
      this.logger.error('获取系统LLM配置失败:', error.message);
      return null;
    }
  }

  /**
   * 设置系统默认LLM配置
   * @param {Object} config - LLM配置
   * @param {number} userId - 用户ID
   * @returns {Promise<Object>} 设置结果
   */
  async setSystemLLMConfig(config, userId = null) {
    try {
      if (!this.isValidConfig(config)) {
        throw new Error('无效的LLM配置');
      }

      // 构建环境变量更新数据
      const envUpdates = this.buildEnvUpdates(config);

      // 调用现有的updateENV函数
      const { updateENV } = require('../../utils/helpers/updateENV');
      const result = await updateENV(envUpdates, false, userId);

      if (result.error) {
        throw new Error(result.error);
      }

      // 清除缓存
      this.clearCache();

      this.logger.info('系统LLM配置更新成功', {
        provider: config.provider,
        model: config.model,
        userId
      });

      return { success: true, updatedKeys: Object.keys(envUpdates) };

    } catch (error) {
      this.logger.error('设置系统LLM配置失败:', error.message);
      throw new Error(`设置系统LLM配置失败: ${error.message}`);
    }
  }

  /**
   * 设置工作区LLM配置
   * @param {number} workspaceId - 工作区ID
   * @param {Object} config - LLM配置
   * @param {number} userId - 用户ID
   * @returns {Promise<Object>} 设置结果
   */
  async setWorkspaceLLMConfig(workspaceId, config, userId = null) {
    try {
      if (!this.isValidConfig(config)) {
        throw new Error('无效的LLM配置');
      }

      const { SystemSettings } = require('../../models/systemSettings');

      // 构建工作区配置数据
      const workspaceUpdates = {
        [`workspace_${workspaceId}_llm_provider`]: config.provider,
        [`workspace_${workspaceId}_llm_model`]: config.model || null
      };

      if (config.apiKey) {
        workspaceUpdates[`workspace_${workspaceId}_llm_api_key`] = config.apiKey;
      }

      if (config.basePath) {
        workspaceUpdates[`workspace_${workspaceId}_llm_base_path`] = config.basePath;
      }

      // 保存到SystemSettings
      const result = await SystemSettings._updateSettings(workspaceUpdates);

      if (!result.success) {
        throw new Error('保存工作区LLM配置失败');
      }

      // 清除相关缓存
      this.clearCache();

      this.logger.info('工作区LLM配置更新成功', {
        workspaceId,
        provider: config.provider,
        model: config.model,
        userId
      });

      return { success: true, updatedKeys: Object.keys(workspaceUpdates) };

    } catch (error) {
      this.logger.error(`设置工作区LLM配置失败 [workspaceId: ${workspaceId}]:`, error.message);
      throw new Error(`设置工作区LLM配置失败: ${error.message}`);
    }
  }

  /**
   * 删除工作区LLM配置（恢复继承系统配置）
   * @param {number} workspaceId - 工作区ID
   * @returns {Promise<Object>} 删除结果
   */
  async deleteWorkspaceLLMConfig(workspaceId) {
    try {
      const { SystemSettings } = require('../../models/systemSettings');

      // 删除工作区相关的配置项
      const keysToDelete = [
        `workspace_${workspaceId}_llm_provider`,
        `workspace_${workspaceId}_llm_model`,
        `workspace_${workspaceId}_llm_api_key`,
        `workspace_${workspaceId}_llm_base_path`
      ];

      for (const key of keysToDelete) {
        await SystemSettings.delete({ label: key });
      }

      // 清除缓存
      this.clearCache();

      this.logger.info('工作区LLM配置删除成功', { workspaceId });

      return { success: true, deletedKeys: keysToDelete };

    } catch (error) {
      this.logger.error(`删除工作区LLM配置失败 [workspaceId: ${workspaceId}]:`, error.message);
      throw new Error(`删除工作区LLM配置失败: ${error.message}`);
    }
  }

  /**
   * 根据前端统一配置设置LLM配置
   * @param {Object} unifiedConfig - 前端统一配置
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 设置结果
   */
  async setFromUnifiedConfig(unifiedConfig, options = {}) {
    const {
      syncMode = 'simple', // 'simple' | 'advanced'
      workspaceId = null,    // 工作区ID（高级模式）
      userId = null
    } = options;

    try {
      if (syncMode === 'simple') {
        // 简单模式：设置系统默认配置
        return await this.setSystemLLMConfig(unifiedConfig, userId);
      } else {
        // 高级模式：设置工作区配置
        if (!workspaceId) {
          throw new Error('高级模式下必须指定工作区ID');
        }
        return await this.setWorkspaceLLMConfig(workspaceId, unifiedConfig, userId);
      }

    } catch (error) {
      this.logger.error('从统一配置设置LLM失败:', error.message);
      throw error;
    }
  }

  /**
   * 验证配置是否有效
   * @param {Object} config - 配置对象
   * @returns {boolean} 是否有效
   */
  isValidConfig(config) {
    return config &&
           config.provider &&
           typeof config.provider === 'string' &&
           config.provider.length > 0;
  }

  /**
   * 构建环境变量更新数据
   * @param {Object} config - LLM配置
   * @returns {Object} 环境变量更新数据
   */
  buildEnvUpdates(config) {
    const updates = {
      LLMProvider: config.provider
    };

    // 根据provider设置对应的模型和密钥
    switch (config.provider) {
      case 'openai':
        updates.OpenAiModelPref = config.model;
        if (config.apiKey) updates.OpenAiKey = config.apiKey;
        break;
      case 'anthropic':
        updates.AnthropicModelPref = config.model;
        if (config.apiKey) updates.AnthropicApiKey = config.apiKey;
        break;
      case 'gemini':
        updates.GeminiLLMModelPref = config.model;
        if (config.apiKey) updates.GeminiLLMApiKey = config.apiKey;
        break;
      case 'ollama':
        updates.OllamaLLMModelPref = config.model;
        if (config.basePath) updates.OllamaLLMBasePath = config.basePath;
        break;
      case 'lmstudio':
        updates.LMStudioModelPref = config.model;
        if (config.basePath) updates.LMStudioBasePath = config.basePath;
        break;
      case 'generic-openai':
        updates.GenericOpenAiModelPref = config.model;
        if (config.apiKey) updates.GenericOpenAiKey = config.apiKey;
        if (config.basePath) updates.GenericOpenAiBasePath = config.basePath;
        break;
      // 添加更多provider的支持...
    }

    return updates;
  }

  /**
   * 更新缓存
   * @param {string} key - 缓存键
   * @param {Object} config - 配置对象
   */
  updateCache(key, config) {
    this.configCache.set(key, {
      config,
      timestamp: Date.now()
    });
  }

  /**
   * 检查缓存是否过期
   * @param {Object} cached - 缓存项
   * @returns {boolean} 是否过期
   */
  isCacheExpired(cached) {
    return !cached || Date.now() - cached.timestamp > this.cacheTTL;
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.configCache.clear();
  }

  /**
   * 获取配置统计信息
   * @returns {Promise<Object>} 统计信息
   */
  async getConfigStats() {
    try {
      // 统计有独立配置的工作区数量
      const { SystemSettings } = require('../../models/systemSettings');

      const workspaceConfigs = await SystemSettings.where({
        label: {
          startsWith: 'workspace_'
        }
      });

      const workspaceIds = new Set();
      workspaceConfigs.forEach(config => {
        const match = config.label.match(/workspace_(\d+)_llm_provider/);
        if (match) {
          workspaceIds.add(parseInt(match[1]));
        }
      });

      // 获取系统配置状态
      const systemConfig = await this.getSystemLLMConfig();

      return {
        systemConfig: systemConfig ? {
          provider: systemConfig.provider,
          model: systemConfig.model
        } : null,
        workspaceCount: workspaceIds.size,
        workspacesWithConfig: Array.from(workspaceIds)
      };

    } catch (error) {
      this.logger.error('获取配置统计失败:', error.message);
      return {
        systemConfig: null,
        workspaceCount: 0,
        workspacesWithConfig: []
      };
    }
  }
}

module.exports = LLMConfigManager;