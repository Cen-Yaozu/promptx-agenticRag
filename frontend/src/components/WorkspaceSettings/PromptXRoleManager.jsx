import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { Check, X, Power, Wrench, WarningCircle, ArrowClockwise, MagnifyingGlass, Funnel } from "@phosphor-icons/react";
import WorkspacePromptXRoles from "@/models/workspacePromptXRoles";

/**
 * PromptX角色管理组件
 * 允许工作区管理员配置可用的PromptX角色
 */
const PromptXRoleManager = ({ workspaceId: propWorkspaceId }) => {
  const { t } = useTranslation();
  const { slug } = useParams();
  const [workspaceId, setWorkspaceId] = useState(propWorkspaceId || null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState(null);
  const [roles, setRoles] = useState([]);
  const [availableRoles, setAvailableRoles] = useState([]);
  const [filteredRoles, setFilteredRoles] = useState([]);
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // 监听workspace prop的变化，更新workspaceId
  useEffect(() => {
    if (propWorkspaceId) {
      setWorkspaceId(propWorkspaceId);
    } else if (slug) {
      console.log('PromptXRoleManager: Workspace ID not provided, using slug for debugging');
      // 临时使用slug，但实际应该从workspace对象获取正确的数字ID
      setWorkspaceId(parseInt(slug, 10) || null);
    }
  }, [propWorkspaceId, slug]);

  // 获取PromptX可用角色列表
  const fetchAvailableRoles = async () => {
    if (!workspaceId) return;

    try {
      const { roles, error } = await WorkspacePromptXRoles.getAvailableRoles(workspaceId);

      if (error) {
        throw new Error(error);
      }

      console.log('前端获取到的角色数据:', roles);
      console.log('角色数量:', roles?.length || 0);
      setAvailableRoles(roles || []);
      setFilteredRoles(roles || []);
    } catch (err) {
      console.error('获取可用角色失败:', err);
      setError('获取可用角色失败: ' + err.message);
      // 不使用硬编码角色，设置为空数组
      setAvailableRoles([]);
    }
  };

  // 获取工作区配置和角色设置
  const fetchWorkspaceConfig = async () => {
    if (!workspaceId) return;

    setLoading(true);
    setError(null);

    try {
      // 获取工作区PromptX配置 - 如果失败则使用默认配置
      let configData = { data: { enabled: true, enableAllRoles: false, autoSwitchEnabled: false, defaultRoleId: null } };
      try {
        const configResponse = await fetch(`/api/workspaces/${workspaceId}/promptx-config`);
        if (configResponse.ok) {
          configData = await configResponse.json();
        }
      } catch (configError) {
        console.log('获取PromptX配置失败，使用默认配置:', configError.message);
      }
      setConfig(configData.data);

      // 获取工作区角色设置
      const rolesResponse = await fetch(`/api/workspaces/${workspaceId}/promptx-roles`);
      if (!rolesResponse.ok) {
        throw new Error('获取角色设置失败');
      }
      const rolesData = await rolesResponse.json();
      setRoles(rolesData.data || []);

      // 获取可用角色（现在通过MCP discover获取真实数据）
      await fetchAvailableRoles();
    } catch (err) {
      console.error('获取工作区配置失败:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (workspaceId) {
      fetchWorkspaceConfig();
    }
  }, [workspaceId]);

  // 筛选和搜索逻辑
  useEffect(() => {
    let filtered = availableRoles;

    // 按状态筛选
    if (filter === 'enabled') {
      filtered = filtered.filter(role => {
        const roleConfig = roles.find(r => r.roleId === role.id);
        return roleConfig?.enabled;
      });
    } else if (filter === 'disabled') {
      filtered = filtered.filter(role => {
        const roleConfig = roles.find(r => r.roleId === role.id);
        return !roleConfig?.enabled;
      });
    }

    // 按搜索词筛选
    if (searchTerm) {
      filtered = filtered.filter(role => {
        const roleConfig = roles.find(r => r.roleId === role.id);
        const searchableText = [
          role.id,
          role.name,
          role.description,
          roleConfig?.customName,
          roleConfig?.customDescription
        ].join(' ').toLowerCase();
        return searchableText.includes(searchTerm.toLowerCase());
      });
    }

    setFilteredRoles(filtered);
  }, [availableRoles, roles, filter, searchTerm]);

  // 切换角色启用状态
  const toggleRole = async (roleId) => {
    if (!workspaceId) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const existingRole = roles.find(r => r.roleId === roleId);
      const enabled = !existingRole?.enabled;

      const response = await fetch(`/api/workspaces/${workspaceId}/promptx-roles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roleId,
          enabled,
          customName: existingRole?.customName || null,
          customDescription: existingRole?.customDescription || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '更新角色失败');
      }

      const result = await response.json();

      // 更新本地状态
      if (existingRole) {
        setRoles(roles.map(r =>
          r.roleId === roleId ? { ...r, enabled, ...result.data } : r
        ));
      } else {
        setRoles([...roles, result.data]);
      }

      setSuccess(`角色 ${enabled ? '启用' : '禁用'} 成功`);
    } catch (err) {
      console.error('切换角色状态失败:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // 批量操作
  const batchUpdateRoles = async (enabled) => {
    if (!workspaceId) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const roleIds = availableRoles.map(role => role.id);

      const response = await fetch(`/api/workspaces/${workspaceId}/promptx-roles/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roleIds,
          enabled,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '批量更新失败');
      }

      const result = await response.json();

      // 更新本地状态
      setRoles(roles.map(r => ({ ...r, enabled })));
      setSuccess(`批量${enabled ? '启用' : '禁用'}成功`);
    } catch (err) {
      console.error('批量更新失败:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // 切换PromptX功能
  // togglePromptX函数已移除 - PromptX默认启用

  // 刷新数据
  const refresh = () => {
    fetchWorkspaceConfig();
  };

  // 从MCP服务器强制刷新角色列表
  const refreshRolesFromMCP = async () => {
    if (!workspaceId) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/promptx-refresh-roles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '刷新角色列表失败');
      }

      const result = await response.json();
      setAvailableRoles(result.data || []);
      setSuccess(result.message || '角色列表刷新成功');

      // 刷新配置以获取最新的可用角色
      await fetchWorkspaceConfig();
    } catch (err) {
      console.error('刷新角色列表失败:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // 键盘快捷键支持
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Ctrl/Cmd + F 聚焦搜索框
      if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
        event.preventDefault();
        document.getElementById('role-search-input')?.focus();
      }
      // Escape 清除搜索和筛选
      if (event.key === 'Escape') {
        setSearchTerm('');
        setFilter('all');
      }
      // Ctrl/Cmd + Shift + R 刷新角色（避免浏览器刷新冲突）
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'R') {
        event.preventDefault();
        refreshRolesFromMCP();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [refreshRolesFromMCP]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <ArrowClockwise className="animate-spin text-white" size={24} />
        <span className="ml-2 text-white">加载中...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 头部操作区 */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">PromptX 角色管理</h3>
          <p className="text-sm text-white/70">
            管理工作区中可用的PromptX AI角色 ({availableRoles.length} 个角色)
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={refresh}
            className="px-3 py-2 text-sm bg-theme-bg-secondary text-white rounded-lg hover:bg-theme-bg-tertiary transition-colors"
            disabled={loading}
            title="刷新配置"
          >
            <ArrowClockwise className={loading ? "animate-spin" : ""} size={16} />
          </button>
          <button
            onClick={refreshRolesFromMCP}
            className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center space-x-1"
            disabled={loading || saving}
            title="从MCP服务器强制刷新角色列表 (Ctrl+Shift+R)"
          >
            <ArrowClockwise className={loading ? "animate-spin" : ""} size={16} />
            <span>刷新角色</span>
          </button>
        </div>
      </div>

      {/* PromptX功能开关 */}
      {/* PromptX功能默认启用，移除开关 */}

      {/* 角色统计信息 */}
      {availableRoles.length > 0 && (
        <div className="bg-theme-bg-secondary rounded-lg p-4 border border-theme-modal-border">
          <h4 className="text-white font-medium mb-3">角色统计</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-400">{availableRoles.length}</div>
              <div className="text-xs text-white/60">总角色数</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-400">
                {availableRoles.filter(role => ['assistant', 'luban', 'noface', 'nuwa', 'sean', 'writer'].includes(role.id)).length}
              </div>
              <div className="text-xs text-white/60">系统角色</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-400">
                {availableRoles.filter(role =>
                  role.id.includes('assistant') || role.id.includes('developer') ||
                  role.id.includes('analyst') || role.id.includes('haoxiaoliang') ||
                  role.id.includes('shaqing')
                ).length}
              </div>
              <div className="text-xs text-white/60">用户角色</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-400">
                {roles.filter(r => r.enabled).length}
              </div>
              <div className="text-xs text-white/60">已启用</div>
            </div>
          </div>
        </div>
      )}

      {/* 筛选和搜索栏 */}
      {config?.enabled && availableRoles.length > 0 && (
        <div className="bg-theme-bg-secondary rounded-lg p-4 border border-theme-modal-border">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* 搜索框 */}
            <div className="flex-1 relative">
              <MagnifyingGlass className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/50" size={16} />
              <input
                id="role-search-input"
                type="text"
                placeholder="搜索角色名称、ID或描述... (Ctrl+F)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-theme-bg-primary border border-theme-modal-border rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* 筛选按钮组 */}
            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-1 bg-theme-bg-primary rounded-lg border border-theme-modal-border p-1">
                <button
                  onClick={() => setFilter('all')}
                  className={`px-3 py-1.5 text-sm rounded transition-colors ${
                    filter === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'text-white/70 hover:text-white hover:bg-theme-bg-tertiary'
                  }`}
                >
                  全部 ({availableRoles.length})
                </button>
                <button
                  onClick={() => setFilter('enabled')}
                  className={`px-3 py-1.5 text-sm rounded transition-colors ${
                    filter === 'enabled'
                      ? 'bg-emerald-600 text-white'
                      : 'text-white/70 hover:text-white hover:bg-theme-bg-tertiary'
                  }`}
                >
                  已启用 ({roles.filter(r => r.enabled).length})
                </button>
                <button
                  onClick={() => setFilter('disabled')}
                  className={`px-3 py-1.5 text-sm rounded transition-colors ${
                    filter === 'disabled'
                      ? 'bg-gray-600 text-white'
                      : 'text-white/70 hover:text-white hover:bg-theme-bg-tertiary'
                  }`}
                >
                  已禁用 ({roles.filter(r => !r.enabled).length})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 批量操作 */}
      {config?.enabled && availableRoles.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => batchUpdateRoles(true)}
              className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              disabled={saving}
            >
              启用所有角色
            </button>
            <button
              onClick={() => batchUpdateRoles(false)}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              disabled={saving}
            >
              禁用所有角色
            </button>
          </div>
          <div className="text-sm text-white/60">
            {roles.filter(r => r.enabled).length} / {availableRoles.length} 个角色已启用
            {filteredRoles.length !== availableRoles.length && (
              <span className="text-blue-400">
                (显示 {filteredRoles.length} 个)
              </span>
            )}
          </div>
        </div>
      )}

      {/* 错误和成功提示 */}
      {error && (
        <div className="flex items-center space-x-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <WarningCircle className="text-red-500" size={20} />
          <span className="text-red-500 text-sm">{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center space-x-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
          <Check className="text-green-500" size={20} />
          <span className="text-green-500 text-sm">{success}</span>
        </div>
      )}

      {/* 首次使用引导 */}
      {config?.enabled && roles.length === 0 && availableRoles.length > 0 && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-6 text-center">
          <div className="text-blue-400 text-2xl mb-3">🎯</div>
          <h4 className="text-white font-medium text-lg mb-2">发现新角色！</h4>
          <p className="text-white/70 text-sm mb-4">
            我们发现了 {availableRoles.length} 个PromptX AI角色，您可以选择启用适合您工作流的角色。
          </p>
          <div className="flex items-center justify-center space-x-4">
            <button
              onClick={() => batchUpdateRoles(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              disabled={saving}
            >
              启用所有角色
            </button>
            <button
              onClick={() => {}}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm"
            >
              手动选择
            </button>
          </div>
        </div>
      )}

      {/* 角色列表 */}
      {config?.enabled && roles.length > 0 && (
        <div className="space-y-3">
          {availableRoles.length === 0 ? (
            <div className="text-center py-8">
              <Wrench className="text-gray-500 mx-auto mb-3" size={48} />
              <p className="text-gray-400">未找到可用的PromptX角色</p>
              <p className="text-sm text-gray-500 mt-1">
                请检查MCP服务器状态，或点击"刷新角色"按钮重新获取
              </p>
            </div>
          ) : filteredRoles.length === 0 ? (
            <div className="text-center py-8">
              <MagnifyingGlass className="text-gray-500 mx-auto mb-3" size={48} />
              <p className="text-gray-400">
                {searchTerm ? '未找到匹配的角色' :
                 filter === 'enabled' ? '没有已启用的角色' :
                 filter === 'disabled' ? '没有已禁用的角色' :
                 '暂无符合条件的角色'}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {searchTerm ? '请尝试其他搜索关键词或调整筛选条件' :
                 filter !== 'all' ? '尝试切换到"全部"筛选条件查看所有角色' :
                 '请检查角色发现状态'}
              </p>
              {(searchTerm || filter !== 'all') && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setFilter('all');
                  }}
                  className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
                >
                  清除筛选条件
                </button>
              )}
            </div>
          ) : (
            filteredRoles.map((role) => {
              const roleConfig = roles.find(r => r.roleId === role.id);
              const isEnabled = roleConfig?.enabled ?? false;

              // 判断是否为系统角色
              const isSystemRole = ['assistant', 'luban', 'noface', 'nuwa', 'sean', 'writer'].includes(role.id);
              // 判断是否为用户自定义角色
              const isUserRole = role.id.includes('assistant') || role.id.includes('developer') ||
                                role.id.includes('analyst') || role.id.includes('haoxiaoliang') ||
                                role.id.includes('shaqing');

              return (
                <div
                  key={role.id}
                  className={`bg-theme-bg-secondary rounded-lg p-4 border transition-all hover:border-blue-500/50 ${
                    isEnabled ? 'border-blue-500/30' : 'border-theme-modal-border'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h4 className="text-white font-medium text-lg">
                          {roleConfig?.customName || role.name}
                        </h4>
                        {roleConfig?.customName && (
                          <span className="text-xs text-blue-400 bg-blue-400/10 px-2 py-1 rounded">
                            自定义名称
                          </span>
                        )}
                        {isSystemRole && (
                          <span className="text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded">
                            系统角色
                          </span>
                        )}
                        {isUserRole && (
                          <span className="text-xs text-purple-400 bg-purple-400/10 px-2 py-1 rounded">
                            用户角色
                          </span>
                        )}
                        {isEnabled && (
                          <span className="text-xs text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded">
                            已启用
                          </span>
                        )}
                      </div>

                      <div className="space-y-2">
                        <p className="text-sm text-white/80 leading-relaxed">
                          {roleConfig?.customDescription || role.description}
                        </p>

                        <div className="flex items-center space-x-4 text-xs text-white/60">
                          <span className="flex items-center space-x-1">
                            <span className="text-gray-500">ID:</span>
                            <code className="bg-theme-bg-primary px-1 py-0.5 rounded text-blue-400">
                              {role.id}
                            </code>
                          </span>

                          {roleConfig?.addedBy_user && (
                            <span className="flex items-center space-x-1">
                              <span className="text-gray-500">添加者:</span>
                              <span>{roleConfig.addedBy_user.username}</span>
                            </span>
                          )}

                          {roleConfig?.lastUpdatedAt && (
                            <span className="flex items-center space-x-1">
                              <span className="text-gray-500">更新:</span>
                              <span>{new Date(roleConfig.lastUpdatedAt).toLocaleDateString()}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      <div className="text-right">
                        <div className="text-xs text-white/60 mb-1">状态</div>
                        <div className={`text-sm font-medium ${isEnabled ? 'text-green-400' : 'text-gray-500'}`}>
                          {isEnabled ? '已启用' : '已禁用'}
                        </div>
                      </div>

                      <button
                        onClick={() => toggleRole(role.id)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          isEnabled ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-600 hover:bg-gray-700'
                        }`}
                        disabled={saving}
                        title={isEnabled ? '点击禁用角色' : '点击启用角色'}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            isEnabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* PromptX默认启用，移除未启用提示 */}

      {/* 键盘快捷键提示 */}
      {availableRoles.length > 0 && (
        <div className="mt-6 pt-4 border-t border-theme-modal-border">
          <div className="flex items-center justify-center space-x-6 text-xs text-white/40">
            <span className="flex items-center space-x-1">
              <kbd className="px-2 py-1 bg-theme-bg-primary border border-theme-modal-border rounded text-white/60">Ctrl+F</kbd>
              <span>搜索</span>
            </span>
            <span className="flex items-center space-x-1">
              <kbd className="px-2 py-1 bg-theme-bg-primary border border-theme-modal-border rounded text-white/60">Esc</kbd>
              <span>清除筛选</span>
            </span>
            <span className="flex items-center space-x-1">
              <kbd className="px-2 py-1 bg-theme-bg-primary border border-theme-modal-border rounded text-white/60">Ctrl+Shift+R</kbd>
              <span>刷新角色</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default PromptXRoleManager;