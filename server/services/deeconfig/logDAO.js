const prisma = require('../../utils/prisma');

/**
 * 配置变更日志数据访问对象
 * 负责配置变更记录的数据库操作
 */
class LogDAO {
  constructor(dbClient = prisma) {
    this.db = dbClient;
  }

  /**
   * 记录配置变更日志
   * @param {Object} logData - 日志数据
   * @returns {Promise<Object>} 创建的日志记录
   */
  async createLog(logData) {
    const {
      configKey,
      category,
      workspaceId,
      userId,
      action, // 'create', 'update', 'delete'
      oldValue,
      newValue,
      valueType = 'string',
      isEncrypted = false,
      source = 'api', // 'api', 'migration', 'system'
      description = null,
      metadata = null
    } = logData;

    try {
      const log = await this.db.config_change_log.create({
        data: {
          configKey,
          category,
          workspaceId,
          userId,
          action,
          oldValue,
          newValue,
          valueType,
          isEncrypted,
          source,
          description,
          metadata: metadata ? JSON.stringify(metadata) : null
        }
      });

      return log;
    } catch (error) {
      console.error(`创建配置日志失败 [${category}:${configKey}]:`, error.message);
      throw new Error(`创建配置日志失败: ${error.message}`);
    }
  }

  /**
   * 批量记录配置变更日志
   * @param {Array} logList - 日志列表
   * @returns {Promise<Array>} 创建的日志记录列表
   */
  async batchCreateLogs(logList) {
    const results = [];

    try {
      await this.db.$transaction(async (tx) => {
        for (const logData of logList) {
          const log = await tx.config_change_log.create({
            data: {
              ...logData,
              metadata: logData.metadata ? JSON.stringify(logData.metadata) : null
            }
          });

          results.push(log);
        }
      });

      return results;
    } catch (error) {
      console.error('批量创建配置日志失败:', error.message);
      throw new Error(`批量创建配置日志失败: ${error.message}`);
    }
  }

  /**
   * 获取配置变更日志
   * @param {Object} filters - 过滤条件
   * @param {Object} pagination - 分页参数
   * @returns {Promise<Object>} 日志列表和总数
   */
  async getLogs(filters = {}, pagination = {}) {
    const {
      configKey,
      category,
      workspaceId,
      userId,
      action,
      source,
      startDate,
      endDate
    } = filters;

    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = pagination;

    try {
      let whereClause = {};

      if (configKey) {
        whereClause.configKey = configKey;
      }

      if (category) {
        whereClause.category = category;
      }

      if (workspaceId !== undefined) {
        whereClause.workspaceId = workspaceId;
      }

      if (userId) {
        whereClause.userId = userId;
      }

      if (action) {
        whereClause.action = action;
      }

      if (source) {
        whereClause.source = source;
      }

      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) {
          whereClause.createdAt.gte = new Date(startDate);
        }
        if (endDate) {
          whereClause.createdAt.lte = new Date(endDate);
        }
      }

      const skip = (page - 1) * limit;

      const [logs, total] = await Promise.all([
        this.db.config_change_log.findMany({
          where: whereClause,
          skip,
          take: limit,
          orderBy: {
            [sortBy]: sortOrder
          },
          include: {
            workspace: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }),
        this.db.config_change_log.count({ where: whereClause })
      ]);

      // 处理metadata字段
      const processedLogs = logs.map(log => ({
        ...log,
        metadata: log.metadata ? JSON.parse(log.metadata) : null
      }));

      return {
        logs: processedLogs,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      console.error('获取配置日志失败:', error.message);
      throw new Error(`获取配置日志失败: ${error.message}`);
    }
  }

  /**
   * 获取单个配置的变更历史
   * @param {string} configKey - 配置键
   * @param {string} category - 配置分类
   * @param {number} workspaceId - 工作区ID (可选)
   * @param {number} limit - 返回记录数限制
   * @returns {Promise<Array>} 变更历史列表
   */
  async getConfigHistory(configKey, category, workspaceId = null, limit = 50) {
    try {
      const logs = await this.db.config_change_log.findMany({
        where: {
          configKey,
          category,
          workspaceId: category === 'workspace' ? workspaceId : null
        },
        take: limit,
        orderBy: {
          createdAt: 'desc'
        },
        include: {
          workspace: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });

      // 处理metadata字段
      return logs.map(log => ({
        ...log,
        metadata: log.metadata ? JSON.parse(log.metadata) : null
      }));
    } catch (error) {
      console.error(`获取配置历史失败 [${category}:${configKey}]:`, error.message);
      throw new Error(`获取配置历史失败: ${error.message}`);
    }
  }

  /**
   * 获取用户操作历史
   * @param {number} userId - 用户ID
   * @param {Object} pagination - 分页参数
   * @returns {Promise<Object>} 操作历史列表和总数
   */
  async getUserHistory(userId, pagination = {}) {
    return this.getLogs({ userId }, pagination);
  }

  /**
   * 获取工作区配置变更历史
   * @param {number} workspaceId - 工作区ID
   * @param {Object} pagination - 分页参数
   * @returns {Promise<Object>} 变更历史列表和总数
   */
  async getWorkspaceHistory(workspaceId, pagination = {}) {
    return this.getLogs({ workspaceId }, pagination);
  }

  /**
   * 获取配置统计信息
   * @param {Object} filters - 过滤条件
   * @returns {Promise<Object>} 统计信息
   */
  async getLogStats(filters = {}) {
    const {
      category,
      workspaceId,
      userId,
      startDate,
      endDate
    } = filters;

    try {
      let whereClause = {};

      if (category) {
        whereClause.category = category;
      }

      if (workspaceId !== undefined) {
        whereClause.workspaceId = workspaceId;
      }

      if (userId) {
        whereClause.userId = userId;
      }

      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) {
          whereClause.createdAt.gte = new Date(startDate);
        }
        if (endDate) {
          whereClause.createdAt.lte = new Date(endDate);
        }
      }

      // 按操作类型统计
      const actionStats = await this.db.config_change_log.groupBy({
        by: ['action'],
        where: whereClause,
        _count: {
          id: true
        }
      });

      // 按分类统计
      const categoryStats = await this.db.config_change_log.groupBy({
        by: ['category'],
        where: whereClause,
        _count: {
          id: true
        }
      });

      // 按用户统计
      const userStats = await this.db.config_change_log.groupBy({
        by: ['userId'],
        where: whereClause,
        _count: {
          id: true
        }
      });

      // 按日期统计（最近7天）
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const dailyStats = await this.db.config_change_log.groupBy({
        by: ['createdAt'],
        where: {
          ...whereClause,
          createdAt: {
            gte: sevenDaysAgo
          }
        },
        _count: {
          id: true
        }
      });

      return {
        actionStats: actionStats.reduce((acc, stat) => {
          acc[stat.action] = stat._count.id;
          return acc;
        }, {}),
        categoryStats: categoryStats.reduce((acc, stat) => {
          acc[stat.category] = stat._count.id;
          return acc;
        }, {}),
        userStats: userStats.reduce((acc, stat) => {
          acc[stat.userId] = stat._count.id;
          return acc;
        }, {}),
        dailyStats: dailyStats.map(stat => ({
          date: stat.createdAt.toISOString().split('T')[0],
          count: stat._count.id
        }))
      };
    } catch (error) {
      console.error('获取日志统计失败:', error.message);
      return {};
    }
  }

  /**
   * 检查配置是否可以被回滚
   * @param {string} configKey - 配置键
   * @param {string} category - 配置分类
   * @param {number} workspaceId - 工作区ID
   * @returns {Promise<boolean>} 是否可以回滚
   */
  async canRollback(configKey, category, workspaceId = null) {
    try {
      const logCount = await this.db.config_change_log.count({
        where: {
          configKey,
          category,
          workspaceId: category === 'workspace' ? workspaceId : null,
          action: 'update'
        }
      });

      return logCount > 0;
    } catch (error) {
      console.error(`检查回滚可能性失败 [${category}:${configKey}]:`, error.message);
      return false;
    }
  }

  /**
   * 获取最近的配置值
   * @param {string} configKey - 配置键
   * @param {string} category - 配置分类
   * @param {number} workspaceId - 工作区ID
   * @param {number} logId - 要回滚到的日志ID
   * @returns {Promise<Object|null>} 旧值信息
   */
  async getOldValue(configKey, category, workspaceId, logId) {
    try {
      const log = await this.db.config_change_log.findFirst({
        where: {
          id: logId,
          configKey,
          category,
          workspaceId: category === 'workspace' ? workspaceId : null
        }
      });

      if (!log) {
        return null;
      }

      return {
        value: log.oldValue,
        valueType: log.valueType,
        isEncrypted: log.isEncrypted,
        changedAt: log.createdAt,
        changedBy: log.userId
      };
    } catch (error) {
      console.error(`获取旧值失败 [${category}:${configKey}]:`, error.message);
      return null;
    }
  }

  /**
   * 清理过期日志
   * @param {number} days - 保留天数
   * @returns {Promise<number>} 删除的日志数量
   */
  async cleanupOldLogs(days = 90) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const result = await this.db.config_change_log.deleteMany({
        where: {
          createdAt: {
            lt: cutoffDate
          }
        }
      });

      return result.count;
    } catch (error) {
      console.error('清理过期日志失败:', error.message);
      throw new Error(`清理过期日志失败: ${error.message}`);
    }
  }

  /**
   * 获取最近的配置变更
   * @param {number} limit - 返回记录数限制
   * @param {Object} filters - 过滤条件
   * @returns {Promise<Array>} 最近的配置变更列表
   */
  async getRecentChanges(limit = 10, filters = {}) {
    const { category, workspaceId } = filters;

    try {
      const logs = await this.db.config_change_log.findMany({
        where: {
          ...(category && { category }),
          ...(workspaceId !== undefined && { workspaceId })
        },
        take: limit,
        orderBy: {
          createdAt: 'desc'
        },
        include: {
          workspace: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });

      return logs.map(log => ({
        ...log,
        metadata: log.metadata ? JSON.parse(log.metadata) : null
      }));
    } catch (error) {
      console.error('获取最近变更失败:', error.message);
      return [];
    }
  }
}

module.exports = LogDAO;