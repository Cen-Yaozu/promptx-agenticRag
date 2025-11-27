const prisma = require('../../utils/prisma');

/**
 * 配置数据访问对象
 * 负责统一配置数据的数据库操作
 */
class ConfigDAO {
  constructor(dbClient = prisma) {
    this.db = dbClient;
  }

  /**
   * 获取单个配置项
   * @param {string} key - 配置键
   * @param {string} category - 配置分类 (system, workspace, llm, embedding, etc.)
   * @param {number} workspaceId - 工作区ID (仅对workspace类型配置有效)
   * @returns {Promise<Object|null>} 配置对象或null
   */
  async getConfig(key, category = 'system', workspaceId = null) {
    try {
      let whereClause = {
        key,
        category
      };

      // 如果是workspace类型配置，需要指定workspaceId
      if (category === 'workspace' && workspaceId) {
        whereClause.workspaceId = workspaceId;
      }

      // 对于非workspace类型的配置，workspaceId应该为null
      if (category !== 'workspace') {
        whereClause.workspaceId = null;
      }

      const config = await this.db.unified_config.findFirst({
        where: whereClause,
        include: {
          workspace: category === 'workspace' ? {
            select: {
              id: true,
              name: true
            }
          } : false
        }
      });

      return config || null;
    } catch (error) {
      console.error(`获取配置失败 [${category}:${key}]:`, error.message);
      throw new Error(`获取配置失败: ${error.message}`);
    }
  }

  /**
   * 获取多个配置项
   * @param {Object} filters - 过滤条件
   * @returns {Promise<Array>} 配置列表
   */
  async getConfigs(filters = {}) {
    try {
      const { category, workspaceId, isEncrypted, keys } = filters;

      let whereClause = {};

      if (category) {
        whereClause.category = category;
      }

      if (workspaceId !== undefined) {
        whereClause.workspaceId = workspaceId;
      }

      if (isEncrypted !== undefined) {
        whereClause.isEncrypted = isEncrypted;
      }

      if (keys && Array.isArray(keys)) {
        whereClause.key = {
          in: keys
        };
      }

      const configs = await this.db.unified_config.findMany({
        where: whereClause,
        include: {
          workspace: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: [
          { category: 'asc' },
          { key: 'asc' }
        ]
      });

      return configs;
    } catch (error) {
      console.error('获取配置列表失败:', error.message);
      throw new Error(`获取配置列表失败: ${error.message}`);
    }
  }

  /**
   * 创建或更新配置项
   * @param {Object} configData - 配置数据
   * @returns {Promise<Object>} 更新后的配置对象
   */
  async upsertConfig(configData) {
    const {
      key,
      category = 'system',
      workspaceId = null,
      value,
      valueType = 'string',
      isEncrypted = false,
      description = null
    } = configData;

    try {
      const config = await this.db.unified_config.upsert({
        where: {
          key_category_workspaceId: {
            key,
            category,
            workspaceId
          }
        },
        update: {
          value,
          valueType,
          isEncrypted,
          description,
          updatedAt: new Date()
        },
        create: {
          key,
          category,
          workspaceId,
          value,
          valueType,
          isEncrypted,
          description
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

      return config;
    } catch (error) {
      console.error(`保存配置失败 [${category}:${key}]:`, error.message);
      throw new Error(`保存配置失败: ${error.message}`);
    }
  }

  /**
   * 批量保存配置项
   * @param {Array} configList - 配置列表
   * @returns {Promise<Array>} 保存结果列表
   */
  async batchUpsertConfigs(configList) {
    const results = [];

    try {
      // 使用事务确保批量操作的原子性
      await this.db.$transaction(async (tx) => {
        for (const configData of configList) {
          const {
            key,
            category = 'system',
            workspaceId = null,
            value,
            valueType = 'string',
            isEncrypted = false,
            description = null
          } = configData;

          const config = await tx.unified_config.upsert({
            where: {
              key_category_workspaceId: {
                key,
                category,
                workspaceId
              }
            },
            update: {
              value,
              valueType,
              isEncrypted,
              description,
              updatedAt: new Date()
            },
            create: {
              key,
              category,
              workspaceId,
              value,
              valueType,
              isEncrypted,
              description
            }
          });

          results.push(config);
        }
      });

      return results;
    } catch (error) {
      console.error('批量保存配置失败:', error.message);
      throw new Error(`批量保存配置失败: ${error.message}`);
    }
  }

  /**
   * 删除配置项
   * @param {string} key - 配置键
   * @param {string} category - 配置分类
   * @param {number} workspaceId - 工作区ID
   * @returns {Promise<boolean>} 删除是否成功
   */
  async deleteConfig(key, category, workspaceId = null) {
    try {
      const result = await this.db.unified_config.deleteMany({
        where: {
          key,
          category,
          workspaceId: category === 'workspace' ? workspaceId : null
        }
      });

      return result.count > 0;
    } catch (error) {
      console.error(`删除配置失败 [${category}:${key}]:`, error.message);
      throw new Error(`删除配置失败: ${error.message}`);
    }
  }

  /**
   * 根据分类获取所有配置
   * @param {string} category - 配置分类
   * @param {number} workspaceId - 工作区ID (可选)
   * @returns {Promise<Array>} 配置列表
   */
  async getConfigsByCategory(category, workspaceId = null) {
    return this.getConfigs({ category, workspaceId });
  }

  /**
   * 获取所有加密配置
   * @param {string} category - 配置分类 (可选)
   * @returns {Promise<Array>} 加密配置列表
   */
  async getEncryptedConfigs(category = null) {
    return this.getConfigs({
      category,
      isEncrypted: true
    });
  }

  /**
   * 检查配置是否存在
   * @param {string} key - 配置键
   * @param {string} category - 配置分类
   * @param {number} workspaceId - 工作区ID
   * @returns {Promise<boolean>} 配置是否存在
   */
  async configExists(key, category, workspaceId = null) {
    try {
      const count = await this.db.unified_config.count({
        where: {
          key,
          category,
          workspaceId: category === 'workspace' ? workspaceId : null
        }
      });

      return count > 0;
    } catch (error) {
      console.error(`检查配置存在性失败 [${category}:${key}]:`, error.message);
      return false;
    }
  }

  /**
   * 获取配置统计信息
   * @returns {Promise<Object>} 统计信息
   */
  async getConfigStats() {
    try {
      const stats = await this.db.unified_config.groupBy({
        by: ['category', 'isEncrypted'],
        _count: {
          id: true
        }
      });

      // 格式化统计结果
      const formattedStats = {};
      stats.forEach(stat => {
        const category = stat.category;
        if (!formattedStats[category]) {
          formattedStats[category] = {
            total: 0,
            encrypted: 0,
            plain: 0
          };
        }

        formattedStats[category].total += stat._count.id;
        if (stat.isEncrypted) {
          formattedStats[category].encrypted += stat._count.id;
        } else {
          formattedStats[category].plain += stat._count.id;
        }
      });

      return formattedStats;
    } catch (error) {
      console.error('获取配置统计失败:', error.message);
      return {};
    }
  }

  /**
   * 清理指定分类的所有配置
   * @param {string} category - 配置分类
   * @param {number} workspaceId - 工作区ID (可选)
   * @returns {Promise<number>} 删除的配置数量
   */
  async clearConfigsByCategory(category, workspaceId = null) {
    try {
      const result = await this.db.unified_config.deleteMany({
        where: {
          category,
          workspaceId: workspaceId !== undefined ? workspaceId : undefined
        }
      });

      return result.count;
    } catch (error) {
      console.error(`清理配置失败 [${category}]:`, error.message);
      throw new Error(`清理配置失败: ${error.message}`);
    }
  }

  /**
   * 从现有system_settings表迁移数据到unified_config表
   * @param {Array} settings - system_settings表中的数据
   * @returns {Promise<number>} 迁移的配置数量
   */
  async migrateFromSystemSettings(settings = []) {
    let migratedCount = 0;

    try {
      await this.db.$transaction(async (tx) => {
        for (const setting of settings) {
          await tx.unified_config.upsert({
            where: {
              key_category_workspaceId: {
                key: setting.label,
                category: 'system',
                workspaceId: null
              }
            },
            update: {
              value: setting.value,
              updatedAt: new Date()
            },
            create: {
              key: setting.label,
              category: 'system',
              workspaceId: null,
              value: setting.value,
              valueType: 'string',
              isEncrypted: false
            }
          });

          migratedCount++;
        }
      });

      console.log(`成功迁移 ${migratedCount} 个配置项到统一配置表`);
      return migratedCount;
    } catch (error) {
      console.error('迁移配置失败:', error.message);
      throw new Error(`迁移配置失败: ${error.message}`);
    }
  }
}

module.exports = ConfigDAO;