const { PrismaClient } = require('@prisma/client');

class WorkspaceRoleAuth {
  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * 检查工作区是否启用了PromptX - 现在始终返回true
   * @param {number} workspaceId
   * @returns {Promise<boolean>}
   */
  async isPromptXEnabled(workspaceId) {
    // PromptX现在默认启用，不再需要检查配置
    return true;
  }

  /**
   * 获取工作区授权的角色列表
   * @param {number} workspaceId
   * @returns {Promise<string[]>}
   */
  async getAuthorizedRoles(workspaceId) {
    try {
      // 检查工作区配置
      const config = await this.prisma.workspace_promptx_configs.findUnique({
        where: { workspaceId }
      });

      // 如果启用所有角色，返回空数组（表示无限制）
      if (config?.enableAllRoles) {
        return [];
      }

      // 获取启用的角色
      const roles = await this.prisma.workspace_promptx_roles.findMany({
        where: {
          workspaceId,
          enabled: true
        },
        select: {
          roleId: true,
          customName: true
        }
      });

      return roles.map(role => role.roleId);
    } catch (error) {
      console.error('Error getting authorized roles:', error);
      return []; // 错误时返回空数组（无限制）
    }
  }

  /**
   * 检查角色是否在工作区中授权
   * @param {number} workspaceId
   * @param {string} roleId
   * @returns {Promise<boolean>}
   */
  async isRoleAuthorized(workspaceId, roleId) {
    try {
      // 系统工具始终允许
      const systemTools = ['discover', 'project', 'toolx'];
      if (systemTools.includes(roleId)) {
        return true;
      }

      // 移除全局PromptX启用检查 - 现在默认启用

      // 获取配置来检查enableAllRoles设置
      const config = await this.prisma.workspace_promptx_configs.findUnique({
        where: { workspaceId }
      });

      // 如果启用所有角色，但用户仍然可以明确禁用某些角色
      // 所以我们需要检查角色是否被明确禁用
      if (config?.enableAllRoles) {
        // 检查角色是否被明确禁用
        const role = await this.prisma.workspace_promptx_roles.findFirst({
          where: {
            workspaceId,
            roleId
          }
        });

        // 如果角色存在且被禁用，则返回false；否则返回true
        return !role || role.enabled;
      }

      // 检查特定角色授权（非enableAllRoles模式）
      const role = await this.prisma.workspace_promptx_roles.findFirst({
        where: {
          workspaceId,
          roleId,
          enabled: true
        }
      });

      return !!role;
    } catch (error) {
      console.error('Error checking role authorization:', error);
      return false;
    }
  }

  /**
   * 获取工作区PromptX配置
   * @param {number} workspaceId
   * @returns {Promise<Object|null>}
   */
  async getWorkspaceConfig(workspaceId) {
    try {
      const config = await this.prisma.workspace_promptx_configs.findUnique({
        where: { workspaceId },
        include: {
          workspace: {
            select: {
              name: true,
              slug: true
            }
          }
        }
      });

      return config;
    } catch (error) {
      console.error('Error getting workspace config:', error);
      return null;
    }
  }

  /**
   * 获取工作区的所有角色配置（包括自定义名称）
   * @param {number} workspaceId
   * @returns {Promise<Array>}
   */
  async getWorkspaceRoleConfigs(workspaceId) {
    try {
      const roles = await this.prisma.workspace_promptx_roles.findMany({
        where: { workspaceId },
        include: {
          addedBy_user: {
            select: { username: true }
          },
          updatedBy_user: {
            select: { username: true }
          }
        },
        orderBy: { addedAt: 'asc' }
      });

      return roles;
    } catch (error) {
      console.error('Error getting workspace role configs:', error);
      return [];
    }
  }

  /**
   * 记录配置更改审计日志
   * @param {number} workspaceId
   * @param {string} roleId
   * @param {string} action
   * @param {Object} oldValue
   * @param {Object} newValue
   * @param {number} performedBy
   * @param {string} ipAddress
   * @param {string} userAgent
   */
  async logConfigurationChange(workspaceId, roleId, action, oldValue = null, newValue = null, performedBy, ipAddress = null, userAgent = null) {
    try {
      await this.prisma.role_configuration_audit_logs.create({
        data: {
          workspaceId,
          roleId,
          action,
          oldValue: oldValue ? JSON.stringify(oldValue) : null,
          newValue: newValue ? JSON.stringify(newValue) : null,
          performedBy,
          ipAddress,
          userAgent
        }
      });
    } catch (error) {
      console.error('Error logging configuration change:', error);
      // 不抛出错误，审计日志失败不应影响主流程
    }
  }

  /**
   * 获取工作区审计日志
   * @param {number} workspaceId
   * @param {Object} options
   * @returns {Promise<Array>}
   */
  async getAuditLogs(workspaceId, options = {}) {
    try {
      const { action, fromDate, toDate, page = 1, limit = 20 } = options;

      const where = { workspaceId };

      if (action) {
        where.action = action;
      }

      if (fromDate || toDate) {
        where.performedAt = {};
        if (fromDate) {
          where.performedAt.gte = new Date(fromDate);
        }
        if (toDate) {
          where.performedAt.lte = new Date(toDate);
        }
      }

      const logs = await this.prisma.role_configuration_audit_logs.findMany({
        where,
        include: {
          performedBy_user: {
            select: { username: true }
          }
        },
        orderBy: { performedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      });

      return logs;
    } catch (error) {
      console.error('Error getting audit logs:', error);
      return [];
    }
  }

  /**
   * 关闭数据库连接
   */
  async disconnect() {
    await this.prisma.$disconnect();
  }
}

module.exports = WorkspaceRoleAuth;