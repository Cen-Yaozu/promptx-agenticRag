const { initializeLLMConfigManager } = require('../../services/deeconfig');

/**
 * LLM配置管理API控制器
 * 提供LLM配置继承和同步的HTTP接口
 */

// 初始化服务实例（在实际使用中应该通过依赖注入）
let llmConfigManager = null;

/**
 * 获取LLM配置管理服务实例
 * @returns {Promise<LLMConfigManager>} 服务实例
 */
async function getLLMConfigManager() {
  if (!llmConfigManager) {
    llmConfigManager = await initializeLLMConfigManager();
  }
  return llmConfigManager;
}

/**
 * 获取用户ID（从请求中提取）
 * @param {Object} req - Express请求对象
 * @returns {number} 用户ID
 */
function getUserId(req) {
  return req.user?.id || req.userId || 1; // 默认用户ID，生产环境中应该从认证系统获取
}

/**
 * 获取工作区ID（从请求中提取）
 * @param {Object} req - Express请求对象
 * @returns {number|null} 工作区ID
 */
function getWorkspaceId(req) {
  const workspaceId = req.params.workspaceId || req.query.workspaceId || req.body.workspaceId;
  return workspaceId ? parseInt(workspaceId) : null;
}

/**
 * 标准化成功响应
 * @param {any} data - 响应数据
 * @param {string} message - 成功消息
 * @returns {Object} 标准化响应
 */
function successResponse(data = null, message = '操作成功') {
  return {
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  };
}

/**
 * 标准化错误响应
 * @param {string} message - 错误消息
 * @param {number} code - 错误代码
 * @param {any} details - 错误详情
 * @returns {Object} 标准化错误响应
 */
function errorResponse(message, code = 500, details = null) {
  return {
    success: false,
    message,
    code,
    details,
    timestamp: new Date().toISOString()
  };
}

/**
 * 获取工作区的LLM配置（支持继承机制）
 */
async function getWorkspaceLLMConfig(req, res) {
  try {
    const workspaceId = getWorkspaceId(req);
    const service = await getLLMConfigManager();

    const config = await service.getWorkspaceLLMConfig(workspaceId);

    res.json(successResponse(config));
  } catch (error) {
    console.error('获取工作区LLM配置失败:', error);
    res.status(500).json(
      errorResponse('获取工作区LLM配置失败', 500, error.message)
    );
  }
}

/**
 * 获取系统默认LLM配置
 */
async function getSystemLLMConfig(req, res) {
  try {
    const service = await getLLMConfigManager();

    const config = await service.getSystemLLMConfig();

    res.json(successResponse(config));
  } catch (error) {
    console.error('获取系统LLM配置失败:', error);
    res.status(500).json(
      errorResponse('获取系统LLM配置失败', 500, error.message)
    );
  }
}

/**
 * 设置系统默认LLM配置
 */
async function setSystemLLMConfig(req, res) {
  try {
    const { provider, model, apiKey, basePath } = req.body;
    const userId = getUserId(req);
    const service = await getLLMConfigManager();

    const config = { provider, model, apiKey, basePath };
    const result = await service.setSystemLLMConfig(config, userId);

    if (result.success) {
      res.json(successResponse(result, '系统LLM配置更新成功'));
    } else {
      res.status(400).json(
        errorResponse('系统LLM配置更新失败', 400, result.error)
      );
    }
  } catch (error) {
    console.error('设置系统LLM配置失败:', error);
    res.status(500).json(
      errorResponse('设置系统LLM配置失败', 500, error.message)
    );
  }
}

/**
 * 设置工作区LLM配置
 */
async function setWorkspaceLLMConfig(req, res) {
  try {
    const workspaceId = getWorkspaceId(req);
    const { provider, model, apiKey, basePath } = req.body;
    const userId = getUserId(req);
    const service = await getLLMConfigManager();

    const config = { provider, model, apiKey, basePath };
    const result = await service.setWorkspaceLLMConfig(workspaceId, config, userId);

    if (result.success) {
      res.json(successResponse(result, '工作区LLM配置更新成功'));
    } else {
      res.status(400).json(
        errorResponse('工作区LLM配置更新失败', 400, result.error)
      );
    }
  } catch (error) {
    console.error('设置工作区LLM配置失败:', error);
    res.status(500).json(
      errorResponse('设置工作区LLM配置失败', 500, error.message)
    );
  }
}

/**
 * 删除工作区LLM配置（恢复继承系统配置）
 */
async function deleteWorkspaceLLMConfig(req, res) {
  try {
    const workspaceId = getWorkspaceId(req);
    const service = await getLLMConfigManager();

    const result = await service.deleteWorkspaceLLMConfig(workspaceId);

    if (result.success) {
      res.json(successResponse(result, '工作区LLM配置删除成功，已恢复继承系统配置'));
    } else {
      res.status(400).json(
        errorResponse('工作区LLM配置删除失败', 400, result.error)
      );
    }
  } catch (error) {
    console.error('删除工作区LLM配置失败:', error);
    res.status(500).json(
      errorResponse('删除工作区LLM配置失败', 500, error.message)
    );
  }
}

/**
 * 从前端统一配置设置LLM配置
 */
async function setFromUnifiedConfig(req, res) {
  try {
    const { config, syncMode, workspaceId } = req.body;
    const userId = getUserId(req);
    const service = await getLLMConfigManager();

    const options = {
      syncMode: syncMode || 'simple',
      workspaceId: workspaceId || null,
      userId
    };

    const result = await service.setFromUnifiedConfig(config, options);

    if (result.success) {
      const message = syncMode === 'simple'
        ? '系统默认LLM配置更新成功'
        : `工作区 ${workspaceId} LLM配置更新成功`;

      res.json(successResponse(result, message));
    } else {
      res.status(400).json(
        errorResponse('LLM配置更新失败', 400, result.error)
      );
    }
  } catch (error) {
    console.error('从统一配置设置LLM失败:', error);
    res.status(500).json(
      errorResponse('LLM配置更新失败', 500, error.message)
    );
  }
}

/**
 * 获取LLM配置统计信息
 */
async function getLLMConfigStats(req, res) {
  try {
    const service = await getLLMConfigManager();
    const stats = await service.getConfigStats();

    res.json(successResponse(stats));
  } catch (error) {
    console.error('获取LLM配置统计失败:', error);
    res.status(500).json(
      errorResponse('获取LLM配置统计失败', 500, error.message)
    );
  }
}

/**
 * 健康检查
 */
async function healthCheck(req, res) {
  try {
    const service = await getLLMConfigManager();

    // 简单的健康检查：验证服务是否可以获取系统配置
    const systemConfig = await service.getSystemLLMConfig();

    res.json(successResponse({
      service: 'llm-config-manager',
      healthy: true,
      hasSystemConfig: !!systemConfig?.provider,
      timestamp: new Date().toISOString()
    }, 'LLM配置管理服务健康'));
  } catch (error) {
    console.error('健康检查失败:', error);
    res.status(503).json(
      errorResponse('LLM配置管理服务不健康', 503, error.message)
    );
  }
}

/**
 * 批量获取多个工作区的LLM配置
 */
async function getBatchWorkspaceLLMConfigs(req, res) {
  try {
    const { workspaceIds } = req.body;

    if (!Array.isArray(workspaceIds) || workspaceIds.length === 0) {
      return res.status(400).json(
        errorResponse('workspaceIds必须是非空数组', 400)
      );
    }

    const service = await getLLMConfigManager();
    const results = {};

    // 并行获取多个工作区的配置
    const promises = workspaceIds.map(async (id) => {
      try {
        const config = await service.getWorkspaceLLMConfig(id);
        return { id, success: true, config };
      } catch (error) {
        return { id, success: false, error: error.message };
      }
    });

    const resolvedResults = await Promise.all(promises);

    // 组织结果
    resolvedResults.forEach(result => {
      results[result.id] = result.success ? result.config : { error: result.error };
    });

    res.json(successResponse({
      results,
      total: workspaceIds.length,
      successful: resolvedResults.filter(r => r.success).length,
      failed: resolvedResults.filter(r => !r.success).length
    }));
  } catch (error) {
    console.error('批量获取工作区LLM配置失败:', error);
    res.status(500).json(
      errorResponse('批量获取工作区LLM配置失败', 500, error.message)
    );
  }
}

module.exports = {
  getWorkspaceLLMConfig,
  getSystemLLMConfig,
  setSystemLLMConfig,
  setWorkspaceLLMConfig,
  deleteWorkspaceLLMConfig,
  setFromUnifiedConfig,
  getLLMConfigStats,
  healthCheck,
  getBatchWorkspaceLLMConfigs
};