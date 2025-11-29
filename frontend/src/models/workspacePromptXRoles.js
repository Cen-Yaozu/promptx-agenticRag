import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

const WorkspacePromptXRoles = {
  /**
   * 获取工作区PromptX配置
   * @param {number} workspaceId - 工作区ID
   * @returns {Promise<{config: Object|null, error: string|null}>}
   */
  getConfig: async function (workspaceId) {
    try {
      const response = await fetch(
        `${API_BASE}/workspaces/${workspaceId}/promptx-config`,
        {
          method: "GET",
          headers: baseHeaders(),
        }
      );

      const data = await response.json();
      if (!response.ok || !data.success) {
        return { config: null, error: data.error || '获取配置失败' };
      }

      return { config: data.data, error: null };
    } catch (error) {
      console.error('获取PromptX配置失败:', error);
      return { config: null, error: error.message };
    }
  },

  /**
   * 更新工作区PromptX配置
   * @param {number} workspaceId - 工作区ID
   * @param {Object} configData - 配置数据
   * @returns {Promise<{config: Object|null, error: string|null}>}
   */
  updateConfig: async function (workspaceId, configData = {}) {
    try {
      const response = await fetch(
        `${API_BASE}/workspaces/${workspaceId}/promptx-config`,
        {
          method: "POST",
          body: JSON.stringify(configData),
          headers: baseHeaders(),
        }
      );

      const data = await response.json();
      if (!response.ok || !data.success) {
        return { config: null, error: data.error || '更新配置失败' };
      }

      return { config: data.data, error: null };
    } catch (error) {
      console.error('更新PromptX配置失败:', error);
      return { config: null, error: error.message };
    }
  },

  /**
   * 获取工作区角色列表
   * @param {number} workspaceId - 工作区ID
   * @param {Object} options - 查询选项
   * @returns {Promise<{roles: Array|null, pagination: Object|null, error: string|null}>}
   */
  getRoles: async function (workspaceId, options = {}) {
    try {
      const queryParams = new URLSearchParams(options).toString();
      const url = `${API_BASE}/workspaces/${workspaceId}/promptx-roles${queryParams ? `?${queryParams}` : ''}`;

      const response = await fetch(url, {
        method: "GET",
        headers: baseHeaders(),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        return { roles: null, pagination: null, error: data.error || '获取角色列表失败' };
      }

      return {
        roles: data.data,
        pagination: data.pagination || null,
        error: null
      };
    } catch (error) {
      console.error('获取角色列表失败:', error);
      return { roles: null, pagination: null, error: error.message };
    }
  },

  /**
   * 更新或创建工作区角色配置
   * @param {number} workspaceId - 工作区ID
   * @param {Object} roleData - 角色数据
   * @returns {Promise<{role: Object|null, error: string|null}>}
   */
  updateRole: async function (workspaceId, roleData = {}) {
    try {
      const response = await fetch(
        `${API_BASE}/workspaces/${workspaceId}/promptx-roles`,
        {
          method: "POST",
          body: JSON.stringify(roleData),
          headers: baseHeaders(),
        }
      );

      const data = await response.json();
      if (!response.ok || !data.success) {
        return { role: null, error: data.error || '更新角色失败' };
      }

      return { role: data.data, error: null };
    } catch (error) {
      console.error('更新角色失败:', error);
      return { role: null, error: error.message };
    }
  },

  /**
   * 批量更新工作区角色配置
   * @param {number} workspaceId - 工作区ID
   * @param {Object} batchData - 批量操作数据
   * @returns {Promise<{result: Object|null, error: string|null}>}
   */
  batchUpdateRoles: async function (workspaceId, batchData = {}) {
    try {
      const response = await fetch(
        `${API_BASE}/workspaces/${workspaceId}/promptx-roles/batch`,
        {
          method: "POST",
          body: JSON.stringify(batchData),
          headers: baseHeaders(),
        }
      );

      const data = await response.json();
      if (!response.ok || !data.success) {
        return { result: null, error: data.error || '批量更新失败' };
      }

      return { result: data.data, error: null };
    } catch (error) {
      console.error('批量更新角色失败:', error);
      return { result: null, error: error.message };
    }
  },

  /**
   * 删除/禁用工作区角色
   * @param {number} workspaceId - 工作区ID
   * @param {string} roleId - 角色ID
   * @returns {Promise<{success: boolean, error: string|null}>}
   */
  deleteRole: async function (workspaceId, roleId) {
    try {
      const response = await fetch(
        `${API_BASE}/workspaces/${workspaceId}/promptx-roles/${roleId}`,
        {
          method: "DELETE",
          headers: baseHeaders(),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        return { success: false, error: data.error || '删除角色失败' };
      }

      return { success: true, error: null };
    } catch (error) {
      console.error('删除角色失败:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * 获取工作区审计日志
   * @param {number} workspaceId - 工作区ID
   * @param {Object} options - 查询选项
   * @returns {Promise<{logs: Array|null, pagination: Object|null, error: string|null}>}
   */
  getAuditLogs: async function (workspaceId, options = {}) {
    try {
      const queryParams = new URLSearchParams(options).toString();
      const url = `${API_BASE}/workspaces/${workspaceId}/promptx-audit${queryParams ? `?${queryParams}` : ''}`;

      const response = await fetch(url, {
        method: "GET",
        headers: baseHeaders(),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        return { logs: null, pagination: null, error: data.error || '获取审计日志失败' };
      }

      return {
        logs: data.data,
        pagination: data.pagination || null,
        error: null
      };
    } catch (error) {
      console.error('获取审计日志失败:', error);
      return { logs: null, pagination: null, error: error.message };
    }
  },

  /**
   * 获取可用的PromptX角色列表（通过MCP discover）
   * @param {number} workspaceId - 工作区ID
   * @returns {Promise<{roles: Array|null, error: string|null}>}
   */
  getAvailableRoles: async function (workspaceId) {
    try {
      const response = await fetch(
        `${API_BASE}/workspaces/${workspaceId}/promptx-available-roles`,
        {
          method: "GET",
          headers: baseHeaders(),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '获取可用角色失败');
      }

      return { roles: data.data, error: null };
    } catch (error) {
      console.error('获取可用角色失败:', error);
      return { roles: null, error: error.message };
    }
  },

  /**
   * 检查特定角色是否在工作区中授权
   * @param {number} workspaceId - 工作区ID
   * @param {string} roleId - 角色ID
   * @returns {Promise<{authorized: boolean, error: string|null}>}
   */
  checkRoleAuthorization: async function (workspaceId, roleId) {
    try {
      const { roles, error } = await this.getRoles(workspaceId);

      if (error) {
        return { authorized: false, error };
      }

      // 系统工具始终授权
      const systemTools = ['discover', 'project', 'toolx'];
      if (systemTools.includes(roleId)) {
        return { authorized: true, error: null };
      }

      const role = roles?.find(r => r.roleId === roleId && r.enabled);
      return { authorized: !!role, error: null };
    } catch (error) {
      console.error('检查角色授权失败:', error);
      return { authorized: false, error: error.message };
    }
  },
};

export default WorkspacePromptXRoles;