const fs = require('fs').promises;
const path = require('path');
const { updateENV } = require('../../utils/helpers/updateENV');

/**
 * 配置同步管理器
 * 负责配置在多个层次之间的同步：数据库、环境变量、.env文件、工作区配置
 */
class SyncManager {
  constructor(dbClient, logger, options = {}) {
    this.db = dbClient;
    this.logger = logger;

    // 同步选项
    this.options = {
      // 是否自动同步到环境变量
      autoSyncToEnv: options.autoSyncToEnv !== false,
      // 是否自动同步到.env文件
      autoSyncToEnvFile: options.autoSyncToEnvFile !== false,
      // .env文件路径
      envFilePath: options.envFilePath || '.env',
      // 同步重试次数
      maxRetries: options.maxRetries || 3,
      // 同步超时时间
      syncTimeout: options.syncTimeout || 5000,
      // 批量同步大小
      batchSize: options.batchSize || 50
    };

    // 同步状态
    this.syncStatus = {
      isSyncing: false,
      lastSyncTime: null,
      pendingSyncs: new Set(),
      failedSyncs: new Map()
    };

    // 配置映射关系
    this.configMappings = new Map();
    this.initConfigMappings();
  }

  /**
   * 初始化配置映射关系
   */
  initConfigMappings() {
    // LLM Provider 配置映射
    this.configMappings.set('llm_provider', 'LLM_PROVIDER');
    this.configMappings.set('open_ai_key', 'OPEN_AI_KEY');
    this.configMappings.set('anthropic_api_key', 'ANTHROPIC_API_KEY');
    this.configMappings.set('gemini_api_key', 'GEMINI_API_KEY');
    this.configMappings.set('azure_openai_endpoint', 'AZURE_OPENAI_ENDPOINT');
    this.configMappings.set('azure_openai_key', 'AZURE_OPENAI_KEY');

    // 向量数据库配置映射
    this.configMappings.set('vector_db', 'VECTOR_DB');
    this.configMappings.set('chroma_endpoint', 'CHROMA_ENDPOINT');
    this.configMappings.set('chroma_api_key', 'CHROMA_API_KEY');
    this.configMappings.set('pinecone_api_key', 'PINECONE_API_KEY');
    this.configMappings.set('pinecone_index', 'PINECONE_INDEX');

    // 嵌入模型配置映射
    this.configMappings.set('embedding_provider', 'EMBEDDING_ENGINE');
    this.configMappings.set('embedding_model', 'EMBEDDING_MODEL_PREF');
    this.configMappings.set('openai_embedding_key', 'GENERIC_OPEN_AI_EMBEDDING_API_KEY');

    // 系统配置映射
    this.configMappings.set('storage_dir', 'STORAGE_DIR');
    this.configMappings.set('auth_token', 'AUTH_TOKEN');
    this.configMappings.set('jwt_secret', 'JWT_SECRET');
    this.configMappings.set('disable_telemetry', 'DISABLE_TELEMETRY');

    // Agent 配置映射
    this.configMappings.set('agent_search_provider', 'AGENT_SEARCH_PROVIDER');
    this.configMappings.set('agent_google_search_key', 'AGENT_GSE_KEY');
    this.configMappings.set('agent_serpapi_key', 'AGENT_SERPAPI_API_KEY');
  }

  /**
   * 同步配置到所有目标
   * @param {Array} configs - 配置列表
   * @param {Object} context - 同步上下文
   * @returns {Promise<Object>} 同步结果
   */
  async syncConfigs(configs, context = {}) {
    const { userId, source = 'api' } = context;

    try {
      this.syncStatus.isSyncing = true;
      this.logger.info('开始配置同步', {
        configCount: configs.length,
        userId,
        source
      });

      const syncResults = {
        total: configs.length,
        successful: 0,
        failed: 0,
        details: []
      };

      // 批量处理配置
      const batches = this.createBatches(configs, this.options.batchSize);

      for (const batch of batches) {
        const batchResult = await this.syncBatch(batch, context);
        syncResults.successful += batchResult.successful;
        syncResults.failed += batchResult.failed;
        syncResults.details.push(...batchResult.details);
      }

      // 更新同步状态
      this.syncStatus.lastSyncTime = new Date();
      this.syncStatus.isSyncing = false;

      this.logger.info('配置同步完成', {
        total: syncResults.total,
        successful: syncResults.successful,
        failed: syncResults.failed
      });

      return syncResults;
    } catch (error) {
      this.syncStatus.isSyncing = false;
      this.logger.error('配置同步失败', {
        error: error.message,
        configCount: configs.length
      });
      throw new Error(`配置同步失败: ${error.message}`);
    }
  }

  /**
   * 同步单个配置批次
   * @param {Array} batch - 配置批次
   * @param {Object} context - 同步上下文
   * @returns {Promise<Object>} 批次同步结果
   */
  async syncBatch(batch, context) {
    const result = {
      successful: 0,
      failed: 0,
      details: []
    };

    for (const config of batch) {
      try {
        const syncResult = await this.syncSingleConfig(config, context);
        if (syncResult.success) {
          result.successful++;
        } else {
          result.failed++;
        }
        result.details.push(syncResult);
      } catch (error) {
        result.failed++;
        result.details.push({
          config: config.key,
          success: false,
          error: error.message
        });
      }
    }

    return result;
  }

  /**
   * 同步单个配置
   * @param {Object} config - 配置对象
   * @param {Object} context - 同步上下文
   * @returns {Promise<Object>} 同步结果
   */
  async syncSingleConfig(config, context) {
    const { key, category, value, workspaceId } = config;
    const envKey = this.configMappings.get(key);

    const syncResult = {
      config: key,
      category,
      success: true,
      targets: []
    };

    try {
      // 1. 同步到环境变量
      if (this.options.autoSyncToEnv && envKey && category === 'system') {
        const envResult = await this.syncToEnvironment(envKey, value);
        syncResult.targets.push({
          type: 'environment',
          key: envKey,
          success: envResult.success,
          error: envResult.error
        });
      }

      // 2. 同步到.env文件
      if (this.options.autoSyncToEnvFile && envKey && category === 'system') {
        const envFileResult = await this.syncToEnvFile(envKey, value);
        syncResult.targets.push({
          type: 'env_file',
          key: envKey,
          success: envFileResult.success,
          error: envFileResult.error
        });
      }

      // 3. 同步到工作区配置 (如果是工作区配置)
      if (category === 'workspace' && workspaceId) {
        const workspaceResult = await this.syncToWorkspace(config);
        syncResult.targets.push({
          type: 'workspace',
          workspaceId,
          success: workspaceResult.success,
          error: workspaceResult.error
        });
      }

      // 检查整体是否成功
      syncResult.success = syncResult.targets.every(target => target.success);

      return syncResult;
    } catch (error) {
      syncResult.success = false;
      syncResult.error = error.message;
      return syncResult;
    }
  }

  /**
   * 同步到环境变量
   * @param {string} envKey - 环境变量键
   * @param {string} value - 值
   * @returns {Promise<Object>} 同步结果
   */
  async syncToEnvironment(envKey, value) {
    try {
      if (value === null || value === undefined || value === '') {
        delete process.env[envKey];
        this.logger.debug('删除环境变量', { key: envKey });
      } else {
        process.env[envKey] = String(value);
        this.logger.debug('设置环境变量', { key: envKey });
      }

      return { success: true };
    } catch (error) {
      this.logger.error('同步环境变量失败', {
        key: envKey,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * 同步到.env文件
   * @param {string} envKey - 环境变量键
   * @param {string} value - 值
   * @returns {Promise<Object>} 同步结果
   */
  async syncToEnvFile(envKey, value) {
    try {
      // 使用现有的updateENV函数
      const updateData = {};
      updateData[envKey] = value;

      const result = await updateENV(updateData);

      if (result.success) {
        this.logger.debug('更新.env文件成功', { key: envKey });
        return { success: true };
      } else {
        this.logger.error('更新.env文件失败', {
          key: envKey,
          error: result.error
        });
        return { success: false, error: result.error };
      }
    } catch (error) {
      this.logger.error('同步.env文件失败', {
        key: envKey,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * 同步到工作区配置
   * @param {Object} config - 配置对象
   * @returns {Promise<Object>} 同步结果
   */
  async syncToWorkspace(config) {
    try {
      const { key, workspaceId, value, category } = config;

      // 这里可以添加工作区特定的同步逻辑
      // 例如同步到工作区的配置缓存、通知工作区用户等

      this.logger.debug('同步工作区配置', {
        workspaceId,
        key,
        category
      });

      return { success: true };
    } catch (error) {
      this.logger.error('同步工作区配置失败', {
        workspaceId: config.workspaceId,
        key: config.key,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * 从环境变量加载配置到数据库
   * @param {Object} options - 加载选项
   * @returns {Promise<Object>} 加载结果
   */
  async loadFromEnvironment(options = {}) {
    const { force = false, category = 'system' } = options;

    try {
      this.logger.info('开始从环境变量加载配置');

      const loadedConfigs = [];

      // 遍历所有映射的配置
      for (const [configKey, envKey] of this.configMappings.entries()) {
        const envValue = process.env[envKey];

        if (envValue !== undefined) {
          loadedConfigs.push({
            key: configKey,
            category,
            value: envValue,
            valueType: this.detectValueType(envValue),
            isEncrypted: this.isEncryptedValue(configKey)
          });
        }
      }

      if (loadedConfigs.length > 0) {
        // 保存到数据库
        const ConfigDAO = require('./configDAO');
        const configDAO = new ConfigDAO(this.db);

        const saveResult = await configDAO.batchUpsertConfigs(loadedConfigs);

        this.logger.info('从环境变量加载配置完成', {
          loadedCount: loadedConfigs.length,
          savedCount: saveResult.length
        });

        return {
          success: true,
          loadedCount: loadedConfigs.length,
          savedCount: saveResult.length,
          configs: loadedConfigs
        };
      } else {
        this.logger.info('未发现需要从环境变量加载的配置');
        return {
          success: true,
          loadedCount: 0,
          savedCount: 0,
          configs: []
        };
      }
    } catch (error) {
      this.logger.error('从环境变量加载配置失败', {
        error: error.message
      });
      throw new Error(`从环境变量加载配置失败: ${error.message}`);
    }
  }

  /**
   * 从数据库同步到环境变量
   * @param {Object} options - 同步选项
   * @returns {Promise<Object>} 同步结果
   */
  async syncToEnvironment(options = {}) {
    const { category = 'system', workspaceId = null } = options;

    try {
      this.logger.info('开始从数据库同步到环境变量');

      const ConfigDAO = require('./configDAO');
      const configDAO = new ConfigDAO(this.db);

      // 获取数据库中的配置
      const configs = await configDAO.getConfigs({
        category,
        workspaceId
      });

      const envConfigs = configs.filter(config =>
        this.configMappings.has(config.key)
      );

      if (envConfigs.length > 0) {
        // 构建同步数据
        const syncData = envConfigs.map(config => ({
          key: config.key,
          category: config.category,
          value: config.value,
          workspaceId: config.workspaceId
        }));

        // 执行同步
        const syncResult = await this.syncConfigs(syncData, {
          source: 'database_sync'
        });

        this.logger.info('数据库到环境变量同步完成', {
          totalConfigs: envConfigs.length,
          successful: syncResult.successful,
          failed: syncResult.failed
        });

        return {
          success: syncResult.failed === 0,
          totalConfigs: envConfigs.length,
          successful: syncResult.successful,
          failed: syncResult.failed,
          details: syncResult.details
        };
      } else {
        this.logger.info('未发现需要同步到环境变量的配置');
        return {
          success: true,
          totalConfigs: 0,
          successful: 0,
          failed: 0,
          details: []
        };
      }
    } catch (error) {
      this.logger.error('数据库到环境变量同步失败', {
        error: error.message
      });
      throw new Error(`数据库到环境变量同步失败: ${error.message}`);
    }
  }

  /**
   * 检测值类型
   * @param {any} value - 值
   * @returns {string} 值类型
   */
  detectValueType(value) {
    if (value === null || value === undefined) {
      return 'string';
    }

    if (typeof value === 'boolean') {
      return 'boolean';
    }

    if (typeof value === 'number') {
      return 'number';
    }

    if (typeof value === 'string') {
      // 尝试解析为布尔值
      if (['true', 'false'].includes(value.toLowerCase())) {
        return 'boolean';
      }

      // 尝试解析为数字
      if (!isNaN(value) && !isNaN(parseFloat(value))) {
        return 'number';
      }

      // 尝试解析为JSON
      try {
        JSON.parse(value);
        return 'json';
      } catch {
        // 不是JSON
      }
    }

    return 'string';
  }

  /**
   * 检查配置是否应该加密
   * @param {string} configKey - 配置键
   * @returns {boolean} 是否应该加密
   */
  isEncryptedValue(configKey) {
    const sensitiveKeys = ['key', 'secret', 'password', 'token', 'credential'];
    return sensitiveKeys.some(keyword =>
      configKey.toLowerCase().includes(keyword)
    );
  }

  /**
   * 创建批次
   * @param {Array} items - 项目列表
   * @param {number} batchSize - 批次大小
   * @returns {Array>} 批次列表
   */
  createBatches(items, batchSize) {
    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * 添加配置映射
   * @param {string} configKey - 配置键
   * @param {string} envKey - 环境变量键
   */
  addConfigMapping(configKey, envKey) {
    this.configMappings.set(configKey, envKey);
    this.logger.debug('添加配置映射', { configKey, envKey });
  }

  /**
   * 移除配置映射
   * @param {string} configKey - 配置键
   */
  removeConfigMapping(configKey) {
    const removed = this.configMappings.delete(configKey);
    if (removed) {
      this.logger.debug('移除配置映射', { configKey });
    }
    return removed;
  }

  /**
   * 获取同步状态
   * @returns {Object} 同步状态
   */
  getSyncStatus() {
    return {
      ...this.syncStatus,
      configMappings: Array.from(this.configMappings.entries()),
      options: this.options
    };
  }

  /**
   * 重置同步状态
   */
  resetSyncStatus() {
    this.syncStatus = {
      isSyncing: false,
      lastSyncTime: null,
      pendingSyncs: new Set(),
      failedSyncs: new Map()
    };
  }

  /**
   * 验证同步配置
   * @returns {Object} 验证结果
   */
  validateSyncConfiguration() {
    const issues = [];

    // 检查配置映射
    if (this.configMappings.size === 0) {
      issues.push('没有配置任何映射关系');
    }

    // 检查.env文件可写性
    if (this.options.autoSyncToEnvFile) {
      try {
        const envPath = path.resolve(this.options.envFilePath);
        fs.access(envPath, fs.constants.W_OK);
      } catch (error) {
        issues.push(`.env文件不可写: ${error.message}`);
      }
    }

    // 检查同步选项
    if (this.options.batchSize <= 0 || this.options.batchSize > 1000) {
      issues.push('批次大小应该在1-1000之间');
    }

    if (this.options.maxRetries < 0 || this.options.maxRetries > 10) {
      issues.push('重试次数应该在0-10之间');
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * 同步单个配置的重试机制
   * @param {Object} config - 配置对象
   * @param {Object} context - 同步上下文
   * @param {number} retryCount - 重试次数
   * @returns {Promise<Object>} 同步结果
   */
  async syncSingleConfigWithRetry(config, context, retryCount = 0) {
    try {
      return await this.syncSingleConfig(config, context);
    } catch (error) {
      if (retryCount < this.options.maxRetries) {
        this.logger.warn('配置同步重试', {
          config: config.key,
          retryCount: retryCount + 1,
          error: error.message
        });

        // 指数退避
        const delay = Math.pow(2, retryCount) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));

        return this.syncSingleConfigWithRetry(config, context, retryCount + 1);
      } else {
        throw error;
      }
    }
  }
}

module.exports = SyncManager;