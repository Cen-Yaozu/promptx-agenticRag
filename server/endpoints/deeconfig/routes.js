const express = require('express');
const router = express.Router();
const controller = require('./controller');

/**
 * LLM配置管理API路由
 * 提供LLM配置继承和同步的RESTful API接口
 */

// 中间件：请求日志
router.use((req, res, next) => {
  console.log(`[LLM Config API] ${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });
  next();
});

// 中间件：错误处理
router.use((error, req, res, next) => {
  console.error('[LLM Config API Error]', error);
  res.status(500).json({
    success: false,
    message: '服务器内部错误',
    error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    timestamp: new Date().toISOString()
  });
});

/**
 * @route GET /api/deeconfig/health
 * @desc 健康检查
 * @access Public
 */
router.get('/health', controller.healthCheck);

/**
 * @route GET /api/deeconfig/stats
 * @desc 获取LLM配置统计信息
 * @access Public
 */
router.get('/stats', controller.getLLMConfigStats);

/**
 * @route GET /api/deeconfig/system
 * @desc 获取系统默认LLM配置
 * @access Public
 */
router.get('/system', controller.getSystemLLMConfig);

/**
 * @route POST /api/deeconfig/system
 * @desc 设置系统默认LLM配置
 * @access Public
 * @body {string} provider - LLM供应商
 * @body {string} model - 模型名称
 * @body {string} apiKey - API密钥 (可选)
 * @body {string} basePath - 基础路径 (可选)
 */
router.post('/system', controller.setSystemLLMConfig);

/**
 * @route GET /api/deeconfig/workspaces/:workspaceId
 * @desc 获取工作区的LLM配置（支持继承机制）
 * @access Public
 * @param {number} workspaceId - 工作区ID
 */
router.get('/workspaces/:workspaceId', controller.getWorkspaceLLMConfig);

/**
 * @route PUT /api/deeconfig/workspaces/:workspaceId
 * @desc 设置工作区LLM配置
 * @access Public
 * @param {number} workspaceId - 工作区ID
 * @body {string} provider - LLM供应商
 * @body {string} model - 模型名称
 * @body {string} apiKey - API密钥 (可选)
 * @body {string} basePath - 基础路径 (可选)
 */
router.put('/workspaces/:workspaceId', controller.setWorkspaceLLMConfig);

/**
 * @route POST /api/deeconfig/workspaces/:workspaceId
 * @desc 设置工作区LLM配置 (PUT的别名)
 * @access Public
 */
router.post('/workspaces/:workspaceId', controller.setWorkspaceLLMConfig);

/**
 * @route DELETE /api/deeconfig/workspaces/:workspaceId
 * @desc 删除工作区LLM配置（恢复继承系统配置）
 * @access Public
 * @param {number} workspaceId - 工作区ID
 */
router.delete('/workspaces/:workspaceId', controller.deleteWorkspaceLLMConfig);

/**
 * @route POST /api/deeconfig/unified
 * @desc 从前端统一配置设置LLM配置
 * @access Public
 * @body {Object} config - LLM配置对象
 * @body {string} syncMode - 同步模式 ('simple' | 'advanced')
 * @body {number} workspaceId - 工作区ID (高级模式时必需)
 */
router.post('/unified', controller.setFromUnifiedConfig);

/**
 * @route GET /api/deeconfig/workspaces/:workspaceId/config
 * @desc 获取工作区的LLM配置（支持继承机制）- 别名路由
 * @access Public
 * @param {number} workspaceId - 工作区ID
 */
router.get('/workspaces/:workspaceId/config', controller.getWorkspaceLLMConfig);

/**
 * @route GET /api/deeconfig/workspaces
 * @desc 获取多个工作区的LLM配置（支持继承机制）
 * @access Public
 * @query {string} workspaceIds - 工作区ID列表，逗号分隔
 */
router.get('/workspaces', async (req, res) => {
  try {
    const { workspaceIds } = req.query;

    if (!workspaceIds) {
      return res.status(400).json({
        success: false,
        message: '缺少workspaceIds参数',
        timestamp: new Date().toISOString()
      });
    }

    const idArray = workspaceIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));

    // 调用批量获取接口
    req.body = { workspaceIds: idArray };
    await controller.getBatchWorkspaceLLMConfigs(req, res);

  } catch (error) {
    console.error('获取工作区配置失败:', error);
    res.status(500).json({
      success: false,
      message: '获取工作区配置失败',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route POST /api/deeconfig/workspaces/batch
 * @desc 批量获取多个工作区的LLM配置
 * @access Public
 * @body {Array<number>} workspaceIds - 工作区ID数组
 */
router.post('/workspaces/batch', controller.getBatchWorkspaceLLMConfigs);

/**
 * @route GET /api/deeconfig/workspace/:workspaceId
 * @desc 获取工作区的LLM配置（支持继承机制）- 别名路由
 * @access Public
 * @param {number} workspaceId - 工作区ID
 */
router.get('/workspace/:workspaceId', controller.getWorkspaceLLMConfig);

/**
 * @route PUT /api/deeconfig/workspace/:workspaceId
 * @desc 设置工作区LLM配置 - 别名路由
 * @access Public
 * @param {number} workspaceId - 工作区ID
 * @body {string} provider - LLM供应商
 * @body {string} model - 模型名称
 * @body {string} apiKey - API密钥 (可选)
 * @body {string} basePath - 基础路径 (可选)
 */
router.put('/workspace/:workspaceId', controller.setWorkspaceLLMConfig);

/**
 * @route POST /api/deeconfig/workspace/:workspaceId
 * @desc 设置工作区LLM配置 - 别名路由
 * @access Public
 */
router.post('/workspace/:workspaceId', controller.setWorkspaceLLMConfig);

/**
 * @route DELETE /api/deeconfig/workspace/:workspaceId
 * @desc 删除工作区LLM配置 - 别名路由
 * @access Public
 * @param {number} workspaceId - 工作区ID
 */
router.delete('/workspace/:workspaceId', controller.deleteWorkspaceLLMConfig);

// 404 处理
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API路径不存在: ${req.method} ${req.originalUrl}`,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;