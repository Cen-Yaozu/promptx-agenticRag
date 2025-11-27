const LLMConfigManager = require('./llmConfigManager');

/**
 * DeeConfig LLM配置管理服务
 * 专门处理LLM配置的继承和同步，解决用户重复配置的问题
 *
 * 核心功能：
 * - 系统级默认LLM配置
 * - 工作区级LLM配置（可选覆盖）
 * - 配置继承机制
 * - 与现有updateENV的集成
 */

/**
 * 创建LLM配置管理服务实例
 * @param {Object} options - 配置选项
 * @returns {LLMConfigManager} 服务实例
 */
function createLLMConfigManager(options = {}) {
  const { logger = console } = options;
  return new LLMConfigManager(logger);
}

/**
 * 创建默认LLM配置管理服务实例
 * @param {Object} options - 配置选项
 * @returns {LLMConfigManager} 服务实例
 */
function createDefaultLLMConfigManager(options = {}) {
  return createLLMConfigManager(options);
}

/**
 * 初始化LLM配置管理服务
 * @param {Object} options - 初始化选项
 * @returns {Promise<LLMConfigManager>} 初始化完成的服务实例
 */
async function initializeLLMConfigManager(options = {}) {
  try {
    // 创建服务实例
    const service = createDefaultLLMConfigManager(options);

    console.log('✅ LLM配置管理服务初始化完成');
    return service;

  } catch (error) {
    console.error('❌ LLM配置管理服务初始化失败:', error.message);
    throw error;
  }
}

// 导出主要类和函数
module.exports = {
  // 主要服务类
  LLMConfigManager,

  // 工厂函数
  createLLMConfigManager,
  createDefaultLLMConfigManager,
  initializeLLMConfigManager,

  // 版本信息
  version: require('../../package.json').version || '1.0.0',

  // 默认导出（便于直接使用）
  default: initializeLLMConfigManager
};