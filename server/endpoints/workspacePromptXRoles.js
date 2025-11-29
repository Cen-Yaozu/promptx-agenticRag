const { reqBody } = require("../utils/http");
const { flexUserRoleValid, ROLES } = require("../utils/middleware/multiUserProtected");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const { handleRoleUpload } = require("../utils/files/roleUploadMulter");
const roleUploadHandler = require("../utils/roleUploadHandler");
const { Workspace } = require("../models/workspace");
const MCPCompatibilityLayer = require("../utils/MCP/index");

// 在单用户模式下，允许所有用户访问
function allowAllUsers(request, response, next) {
  next();
}
const { PrismaClient } = require("@prisma/client");
const WorkspaceRoleAuth = require("../utils/workspaceRoleAuth");
const {
  handleRoleManagementError,
  validateWorkspaceId,
  validateRoleConfig,
  validateWorkspaceConfig,
  validateBatchOperation,
  RoleNotFoundError,
  WorkspaceNotFoundError
} = require("../utils/roleManagementErrors");

/**
 * 格式化角色名称，从kebab-case转换为友好的显示名称
 * @param {string} roleName - 角色ID
 * @returns {string} 格式化后的角色名称
 */
function formatRoleName(roleName) {
  // 已知的特殊角色名称映射
  const knownNames = {
    'nuwa': '女娲',
    'luban': '鲁班',
    'sean': 'Sean',
    'writer': 'Writer',
    'assistant': 'Assistant',
    'noface': 'Noface',
    'code-assistant': 'Code Assistant',
    'doc-intelligence-analyzer': 'Doc Intelligence Analyzer',
    'frontend-developer': 'Frontend Developer',
    'video-content-analyst': 'Video Content Analyst',
    'haoxiaoliang': 'Haoxiaoliang',
    'shaqing': 'Shaqing'
  };

  if (knownNames[roleName]) {
    return knownNames[roleName];
  }

  // 默认格式化：将kebab-case转换为Title Case
  return roleName
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * 从MCP discover获取PromptX角色
 * @returns {Promise<Array|null>} 角色列表
 */
async function getPromptXRolesFromMCP() {
  try {
    // 导入MCP兼容层
    const MCPCompatibilityLayer = require("../utils/MCP/index");
    const mcpLayer = new MCPCompatibilityLayer();

    // 等待MCP服务器启动
    await mcpLayer.bootMCPServers();

    // 获取promptx服务器
    const promptxServer = mcpLayer.mcps['promptx'];

    if (promptxServer && await promptxServer.ping()) {
      console.log('从MCP discover同步PromptX角色');

      // 调用discover工具获取角色列表
      const discoverResult = await promptxServer.callTool({
        name: 'discover',
        arguments: { focus: 'roles' }
      });

      console.log('discover工具调用结果:', discoverResult);

      // 解析discover返回的角色列表
      let rolesData = [];
      console.log('discover返回的类型:', typeof discoverResult);

      if (!discoverResult || !discoverResult.content || !Array.isArray(discoverResult.content)) {
        console.warn('discover工具未返回有效数据');
        return [];
      }

      // 从discover返回的内容中提取角色信息
      const textContent = discoverResult.content
        .filter(item => item.type === 'text')
        .map(item => item.text)
        .join('\n');

      console.log('discover返回的文本内容长度:', textContent.length);
      console.log('discover返回的原始文本内容前500字符:', textContent.substring(0, 500));

      // 解析角色信息
      const lines = textContent.split('\n');
      const systemRolesSection = lines.findIndex(line => line.includes('📦 **系统角色**'));
      const userRolesSection = lines.findIndex(line => line.includes('👤 **用户角色**'));
      const toolListSection = lines.findIndex(line => line.includes('📦 **系统工具**'));

      // 解析系统角色
      if (systemRolesSection !== -1) {
        for (let i = systemRolesSection + 1; i < lines.length && (toolListSection === -1 || i < toolListSection); i++) {
          const line = lines[i].trim();
          if (line.startsWith('- `') && line.includes('`:')) {
            const match = line.match(/- `([^`]+)`: (.+?) → action\([^)]+\)/);
            if (match) {
              const [, roleId, description] = match;
              // 提取角色名称（description中的第一部分）
              const nameMatch = description.match(/^(.+?)(?:\s+[-—]|$)/);
              const roleName = nameMatch ? nameMatch[1] : description;

              rolesData.push({
                id: roleId,
                name: formatRoleName(roleId),
                description: description.trim(),
                type: 'role'
              });
              console.log(`解析到系统角色: ${roleId} - ${description}`);
            }
          }
        }
      }

      // 解析用户角色
      if (userRolesSection !== -1) {
        const endOfUserRoles = toolListSection !== -1 ? toolListSection : lines.length;
        for (let i = userRolesSection + 1; i < endOfUserRoles; i++) {
          const line = lines[i].trim();
          if (line.startsWith('- `') && line.includes('`:')) {
            const match = line.match(/- `([^`]+)`: (.+?) → action\([^)]+\)/);
            if (match) {
              const [, roleId, description] = match;
              // 提取角色名称（description中的第一部分）
              const nameMatch = description.match(/^(.+?)(?:\s+[-—]|$)/);
              const roleName = nameMatch ? nameMatch[1] : description;

              rolesData.push({
                id: roleId,
                name: formatRoleName(roleId),
                description: description.trim(),
                type: 'role'
              });
              console.log(`解析到用户角色: ${roleId} - ${description}`);
            }
          }
        }
      }

      // 去重：确保没有重复的 roleId
      const uniqueRoles = [];
      const seenRoleIds = new Set();

      for (const role of rolesData) {
        if (!seenRoleIds.has(role.id)) {
          seenRoleIds.add(role.id);
          uniqueRoles.push(role);
        } else {
          console.warn(`发现重复角色，已跳过: ${role.id}`);
        }
      }

      console.log(`解析出 ${rolesData.length} 个角色，去重后剩余 ${uniqueRoles.length} 个`);
      return uniqueRoles;
    } else {
      console.warn('PromptX MCP服务器不可用');
      return null;
    }
  } catch (error) {
    console.error('MCP discover同步失败:', error);
    return null;
  }
}

function workspacePromptXRolesEndpoints(app) {
  if (!app) return;

  const prisma = new PrismaClient();
  const roleAuth = new WorkspaceRoleAuth();

  // GET /workspaces/:id/promptx-config
  app.get(
    "/workspaces/:workspaceId/promptx-config",
    [validatedRequest, allowAllUsers],
    async (request, response) => {
      try {
        const workspaceId = validateWorkspaceId(request.params.workspaceId);

        const config = await prisma.workspace_promptx_configs.findUnique({
          where: { workspaceId },
          include: {
            updatedBy_user: {
              select: { username: true }
            }
          }
        });

        if (!config) {
          // 如果没有配置，创建默认配置
          const defaultConfig = await prisma.workspace_promptx_configs.create({
            data: {
              workspaceId,
              enabled: true,
              autoSwitchEnabled: false,
              enableAllRoles: true, // 向后兼容：默认启用所有角色
              defaultRoleId: null,
              updatedBy: request.user?.id || null
            },
            include: {
              updatedBy_user: {
                select: { username: true }
              }
            }
          });

          response.status(200).json({
            success: true,
            data: defaultConfig
          });
          return;
        }

        response.status(200).json({
          success: true,
          data: config
        });
      } catch (error) {
        handleRoleManagementError(error, request, response);
      }
    }
  );

  // POST /workspaces/:id/promptx-config 已移除 - PromptX默认启用

  // GET /workspaces/:id/promptx-roles
  app.get(
    "/workspaces/:workspaceId/promptx-roles",
    [validatedRequest, allowAllUsers],
    async (request, response) => {
      try {
        const workspaceId = validateWorkspaceId(request.params.workspaceId);
        const { enabled, page = 1, limit = 50 } = request.query;

        const whereClause = { workspaceId };
        if (enabled !== undefined) {
          whereClause.enabled = enabled === 'true';
        }

        const [roles, totalCount] = await Promise.all([
          prisma.workspace_promptx_roles.findMany({
            where: whereClause,
            include: {
              addedBy_user: {
                select: { username: true }
              },
              updatedBy_user: {
                select: { username: true }
              }
            },
            orderBy: { addedAt: 'asc' },
            skip: (parseInt(page) - 1) * parseInt(limit),
            take: parseInt(limit)
          }),
          prisma.workspace_promptx_roles.count({ where: whereClause })
        ]);

        response.status(200).json({
          success: true,
          data: roles,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalCount / parseInt(limit)),
            totalItems: totalCount,
            itemsPerPage: parseInt(limit)
          }
        });
      } catch (error) {
        handleRoleManagementError(error, request, response);
      }
    }
  );

  // POST /workspaces/:id/promptx-roles
  app.post(
    "/workspaces/:workspaceId/promptx-roles",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const workspaceId = validateWorkspaceId(request.params.workspaceId);
        const roleData = validateRoleConfig(reqBody(request));

        // 检查是否已存在
        const existingRole = await prisma.workspace_promptx_roles.findUnique({
          where: {
            workspaceId_roleId: {
              workspaceId,
              roleId: roleData.roleId
            }
          }
        });

        let newRole;
        if (existingRole) {
          // 更新现有角色
          const oldRoleData = { ...existingRole };
          newRole = await prisma.workspace_promptx_roles.update({
            where: {
              workspaceId_roleId: {
                workspaceId,
                roleId: roleData.roleId
              }
            },
            data: {
              enabled: roleData.enabled,
              customName: roleData.customName,
              customDescription: roleData.customDescription,
              lastUpdatedAt: new Date(),
              updatedBy: request.user?.id || null
            },
            include: {
              addedBy_user: {
                select: { username: true }
              },
              updatedBy_user: {
                select: { username: true }
              }
            }
          });

          // 记录审计日志
          await roleAuth.logConfigurationChange(
            workspaceId,
            roleData.roleId,
            'ROLE_UPDATED',
            oldRoleData,
            newRole,
            request.user?.id || null,
            request.ip,
            request.get('User-Agent')
          );
        } else {
          // 创建新角色
          newRole = await prisma.workspace_promptx_roles.create({
            data: {
              workspaceId,
              roleId: roleData.roleId,
              enabled: roleData.enabled,
              customName: roleData.customName,
              customDescription: roleData.customDescription,
              addedAt: new Date(),
              lastUpdatedAt: new Date(),
              addedBy: request.user?.id || null,
              updatedBy: request.user?.id || null
            },
            include: {
              addedBy_user: {
                select: { username: true }
              },
              updatedBy_user: {
                select: { username: true }
              }
            }
          });

          // 记录审计日志
          await roleAuth.logConfigurationChange(
            workspaceId,
            roleData.roleId,
            'ROLE_ENABLED',
            null,
            newRole,
            request.user?.id || null,
            request.ip,
            request.get('User-Agent')
          );
        }

        response.status(200).json({
          success: true,
          data: newRole
        });
      } catch (error) {
        handleRoleManagementError(error, request, response);
      }
    }
  );

  // POST /workspaces/:id/promptx-roles/batch
  app.post(
    "/workspaces/:workspaceId/promptx-roles/batch",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const workspaceId = validateWorkspaceId(request.params.workspaceId);
        const batchData = validateBatchOperation(reqBody(request));

        // 批量操作 - 为每个角色执行upsert操作
        const results = await Promise.all(
          batchData.roleIds.map(async (roleId) => {
            const result = await prisma.workspace_promptx_roles.upsert({
              where: {
                workspaceId_roleId: {
                  workspaceId,
                  roleId
                }
              },
              update: {
                enabled: batchData.enabled,
                customName: batchData.customName,
                customDescription: batchData.customDescription,
                lastUpdatedAt: new Date(),
                updatedBy: request.user?.id || null
              },
              create: {
                workspaceId,
                roleId,
                enabled: batchData.enabled,
                customName: batchData.customName,
                customDescription: batchData.customDescription,
                addedAt: new Date(),
                lastUpdatedAt: new Date(),
                addedBy: request.user?.id || null,
                updatedBy: request.user?.id || null
              }
            });

            // 记录审计日志
            await roleAuth.logConfigurationChange(
              workspaceId,
              roleId,
              batchData.enabled ? 'ROLE_ENABLED' : 'ROLE_DISABLED',
              null,
              result,
              request.user?.id || null,
              request.ip,
              request.get('User-Agent')
            );

            return result;
          })
        );

        response.status(200).json({
          success: true,
          data: {
            updatedCount: results.length,
            skippedCount: 0,
            roles: results
          }
        });
      } catch (error) {
        handleRoleManagementError(error, request, response);
      }
    }
  );

  // DELETE /workspaces/:id/promptx-roles/:roleId
  app.delete(
    "/workspaces/:workspaceId/promptx-roles/:roleId",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const workspaceId = validateWorkspaceId(request.params.workspaceId);
        const roleId = request.params.roleId;

        // 获取要删除的角色用于审计
        const existingRole = await prisma.workspace_promptx_roles.findUnique({
          where: {
            workspaceId_roleId: {
              workspaceId,
              roleId
            }
          }
        });

        if (!existingRole) {
          throw new RoleNotFoundError(roleId, workspaceId);
        }

        // 记录审计日志
        await roleAuth.logConfigurationChange(
          workspaceId,
          roleId,
          'ROLE_DISABLED',
          existingRole,
          null,
          request.user?.id || null,
          request.ip,
          request.get('User-Agent')
        );

        // 删除角色配置（软删除：设置enabled为false）
        const deletedRole = await prisma.workspace_promptx_roles.update({
          where: {
            workspaceId_roleId: {
              workspaceId,
              roleId
            }
          },
          data: {
            enabled: false,
            lastUpdatedAt: new Date(),
            updatedBy: request.user?.id || null
          }
        });

        response.status(204).send();
      } catch (error) {
        handleRoleManagementError(error, request, response);
      }
    }
  );

  // GET /workspaces/:id/promptx-available-roles
  // 实时从MCP Discover获取角色列表，不使用缓存
  app.get(
    "/workspaces/:workspaceId/promptx-available-roles",
    [validatedRequest, allowAllUsers],
    async (request, response) => {
      try {
        const workspaceId = validateWorkspaceId(request.params.workspaceId);

        console.log(`[RoleSync] 工作区 ${workspaceId} 请求角色列表（实时查询）`);

        // 步骤1：直接从MCP Discover获取实时数据（不走缓存）
        const mcpRoles = await getPromptXRolesFromMCP();

        if (!mcpRoles || mcpRoles.length === 0) {
          console.warn('[RoleSync] MCP Discover未返回角色数据');
          return response.status(200).json({
            success: true,
            data: [],
            meta: {
              source: 'mcp-realtime',
              timestamp: new Date().toISOString(),
              warning: 'MCP Discover未返回数据'
            }
          });
        }

        console.log(`[RoleSync] MCP返回 ${mcpRoles.length} 个角色`);
      console.log('[RoleSync] MCP返回的角色列表:', mcpRoles.map(r => ({ id: r.id, name: r.name })));

        // 步骤2：获取工作区现有配置（仅配置，不是数据源）
        const configs = await prisma.workspace_promptx_roles.findMany({
          where: { workspaceId },
          include: {
            addedBy_user: {
              select: { id: true, username: true }
            }
          }
        });

        console.log(`[RoleSync] 工作区现有 ${configs.length} 个角色配置`);

        // 步骤3：清理孤立配置（MCP中不存在的角色）
        const mcpRoleIds = new Set(mcpRoles.map(r => r.id));
        const orphanedConfigs = configs.filter(c => !mcpRoleIds.has(c.roleId));

        if (orphanedConfigs.length > 0) {
          console.log(`[RoleSync] 发现 ${orphanedConfigs.length} 个孤立配置，开始清理:`,
            orphanedConfigs.map(c => c.roleId));

          await prisma.workspace_promptx_roles.deleteMany({
            where: {
              workspaceId,
              roleId: { in: orphanedConfigs.map(c => c.roleId) }
            }
          });

          // 记录审计日志
          for (const orphaned of orphanedConfigs) {
            await roleAuth.logConfigurationChange(
              workspaceId,
              orphaned.roleId,
              'ROLE_AUTO_CLEANED',
              { enabled: orphaned.enabled, customName: orphaned.customName },
              null,
              null,
              'system',
              'auto-cleanup'
            );
          }

          console.log(`[RoleSync] 已清理 ${orphanedConfigs.length} 个孤立配置`);
        }

        // 步骤4：为新角色创建默认配置
        const configMap = new Map(configs.map(c => [c.roleId, c]));
        const newRoles = mcpRoles.filter(r => !configMap.has(r.id));

        if (newRoles.length > 0) {
          console.log(`[RoleSync] 发现 ${newRoles.length} 个新角色，创建默认配置:`,
            newRoles.map(r => r.id));

          await prisma.workspace_promptx_roles.createMany({
            data: newRoles.map(r => ({
              workspaceId,
              roleId: r.id,
              enabled: false,  // 默认禁用，让用户手动启用
              addedBy: null,   // 系统创建
              updatedBy: null
            })),
            skipDuplicates: true
          });

          // 更新configMap以包含新创建的配置
          for (const role of newRoles) {
            configMap.set(role.id, {
              roleId: role.id,
              enabled: false,
              customName: null,
              customDescription: null,
              addedBy: null,
              addedBy_user: null
            });
          }

          console.log(`[RoleSync] 已创建 ${newRoles.length} 个默认配置`);
        }

        // 步骤5：合并MCP数据和配置数据返回
        const result = mcpRoles.map(role => {
          const config = configMap.get(role.id);

          return {
            // MCP数据（主数据源）
            id: role.id,
            name: role.name,
            description: role.description,

            // 配置表数据（附加配置）
            enabled: config?.enabled ?? false,
            customName: config?.customName ?? null,
            customDescription: config?.customDescription ?? null,
            addedBy: config?.addedBy ?? null,
            addedBy_user: config?.addedBy_user ?? null,
            lastUpdatedAt: config?.lastUpdatedAt ?? null,

            // 派生数据
            source: config?.addedBy ? 'user' : 'system',
            hasConfig: !!config
          };
        });

        console.log(`[RoleSync] 返回 ${result.length} 个角色（已清理 ${orphanedConfigs.length} 个，新增 ${newRoles.length} 个）`);

        // 设置防缓存头，确保浏览器获取最新数据
        response.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        response.setHeader("Pragma", "no-cache");
        response.setHeader("Expires", "0");

        response.status(200).json({
          success: true,
          data: result,
          meta: {
            source: 'mcp-realtime',
            timestamp: new Date().toISOString(),
            total: result.length,
            cleaned: orphanedConfigs.length,
            created: newRoles.length
          }
        });

      } catch (error) {
        console.error('[RoleSync] 获取可用角色失败:', error);
        response.status(500).json({
          success: false,
          error: 'MCP Discover失败: ' + error.message
        });
      }
    }
  );

  // POST /workspaces/:workspaceId/promptx-roles/upload - 上传自定义角色包
  app.post(
    "/workspaces/:workspaceId/promptx-roles/upload",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager]), handleRoleUpload],
    async (request, response) => {
      try {
        const workspaceId = validateWorkspaceId(request.params.workspaceId);
        const { customName, customDescription, customId } = request.body;

        // 验证工作区存在
        const workspace = await prisma.workspaces.findUnique({
          where: { id: workspaceId }
        });

        if (!workspace) {
          return response.status(404).json({
            success: false,
            error: '工作区不存在'
          });
        }

        // 验证上传文件
        if (!request.file) {
          return response.status(400).json({
            success: false,
            error: '未检测到上传文件'
          });
        }

        const uploadedFile = request.file;
        console.log(`[PromptXRoleUpload] 工作区 ${workspaceId} 上传角色包: ${uploadedFile.originalname}`);

        // 处理上传
        const uploadResult = await roleUploadHandler.processUpload({
          zipPath: uploadedFile.path,
          workspaceId,
          customName,
          customDescription,
          customId,
          userId: request.user?.id || null
        });

        console.log(`[PromptXRoleUpload] 上传成功，角色ID: ${uploadResult.roleId}`);

        // 创建数据库记录
        const roleRecord = await Workspace.createWorkspaceRole(
          workspaceId,
          uploadResult.roleId,
          {
            customName: uploadResult.metadata.customName,
            customDescription: uploadResult.metadata.customDescription,
            userId: request.user?.id || null
          }
        );

        console.log(`[PromptXRoleUpload] 数据库记录已创建`);

        // 记录审计日志
        await roleAuth.logConfigurationChange(
          workspaceId,
          uploadResult.roleId,
          'ROLE_UPLOADED',
          null,
          {
            roleId: uploadResult.roleId,
            customName: uploadResult.metadata.customName,
            customDescription: uploadResult.metadata.customDescription,
            source: 'user'
          },
          request.user?.id || null,
          request.ip || request.headers['x-forwarded-for'],
          request.get('User-Agent')
        );

        console.log(`[PromptXRoleUpload] 审计日志已记录`);

        // 触发MCP刷新
        try {
          const mcpLayer = new MCPCompatibilityLayer();
          await mcpLayer.refreshPromptXResources();
          console.log(`[PromptXRoleUpload] MCP资源刷新已触发`);
        } catch (mcpError) {
          console.warn(`[PromptXRoleUpload] MCP刷新失败，但不阻止上传:`, mcpError.message);
        }

        // 返回成功响应
        return response.status(200).json({
          success: true,
          data: {
            roleId: uploadResult.roleId,
            name: uploadResult.metadata.customName || uploadResult.roleId,
            description: uploadResult.metadata.customDescription || '',
            source: 'user',
            enabled: true,
            addedAt: uploadResult.metadata.addedAt
          },
          message: '角色上传成功'
        });

      } catch (error) {
        console.error('[PromptXRoleUpload] 上传失败:', error);

        // 处理特定错误
        if (error.code === 'ROLE_CONFLICT') {
          return response.status(409).json({
            success: false,
            error: '角色ID已存在',
            conflictInfo: error.conflictInfo,
            conflictOptions: ['cancel', 'overwrite', 'useCustomId']
          });
        }

        // 处理验证错误
        if (error.message.includes('无效') || error.message.includes('验证失败')) {
          return response.status(400).json({
            success: false,
            error: error.message
          });
        }

        // 通用错误
        return response.status(500).json({
          success: false,
          error: `角色上传失败: ${error.message}`
        });
      }
    }
  );

  // POST /workspaces/:id/promptx-refresh-roles
  // 手动触发角色同步（实际上GET接口已经是实时的，这个接口主要用于强制触发MCP刷新）
  app.post(
    "/workspaces/:workspaceId/promptx-refresh-roles",
    [validatedRequest, allowAllUsers],
    async (request, response) => {
      try {
        const workspaceId = validateWorkspaceId(request.params.workspaceId);

        console.log(`[RoleSync] 工作区 ${workspaceId} 手动触发角色刷新`);

        // 触发MCP资源刷新（如果需要）
        try {
          const mcpLayer = new MCPCompatibilityLayer();
          await mcpLayer.refreshPromptXResources();
          console.log(`[RoleSync] MCP资源刷新已触发`);
        } catch (mcpError) {
          console.warn(`[RoleSync] MCP刷新失败:`, mcpError.message);
        }

        // 从MCP Discover获取最新角色列表
        const mcpRoles = await getPromptXRolesFromMCP();

        if (!mcpRoles || mcpRoles.length === 0) {
          console.warn('[RoleSync] MCP Discover未返回角色数据');
          return response.status(200).json({
            success: true,
            data: [],
            message: '未获取到角色数据，请检查MCP服务器状态'
          });
        }

        // 获取工作区配置
        const configs = await prisma.workspace_promptx_roles.findMany({
          where: { workspaceId },
          include: {
            addedBy_user: {
              select: { id: true, username: true }
            }
          }
        });

        // 清理孤立配置
        const mcpRoleIds = new Set(mcpRoles.map(r => r.id));
        const orphanedConfigs = configs.filter(c => !mcpRoleIds.has(c.roleId));

        if (orphanedConfigs.length > 0) {
          await prisma.workspace_promptx_roles.deleteMany({
            where: {
              workspaceId,
              roleId: { in: orphanedConfigs.map(c => c.roleId) }
            }
          });
          console.log(`[RoleSync] 已清理 ${orphanedConfigs.length} 个孤立配置`);
        }

        // 为新角色创建默认配置
        const configMap = new Map(configs.map(c => [c.roleId, c]));
        const newRoles = mcpRoles.filter(r => !configMap.has(r.id));

        if (newRoles.length > 0) {
          await prisma.workspace_promptx_roles.createMany({
            data: newRoles.map(r => ({
              workspaceId,
              roleId: r.id,
              enabled: false,
              addedBy: null,
              updatedBy: null
            })),
            skipDuplicates: true
          });

          for (const role of newRoles) {
            configMap.set(role.id, {
              roleId: role.id,
              enabled: false,
              customName: null,
              customDescription: null,
              addedBy: null,
              addedBy_user: null
            });
          }
          console.log(`[RoleSync] 已创建 ${newRoles.length} 个默认配置`);
        }

        // 合并数据
        const result = mcpRoles.map(role => {
          const config = configMap.get(role.id);
          return {
            id: role.id,
            name: role.name,
            description: role.description,
            enabled: config?.enabled ?? false,
            customName: config?.customName ?? null,
            customDescription: config?.customDescription ?? null,
            addedBy: config?.addedBy ?? null,
            addedBy_user: config?.addedBy_user ?? null,
            source: config?.addedBy ? 'user' : 'system',
            hasConfig: !!config
          };
        });

        // 设置防缓存头，确保浏览器获取最新数据
        response.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        response.setHeader("Pragma", "no-cache");
        response.setHeader("Expires", "0");

        response.status(200).json({
          success: true,
          data: result,
          message: `成功刷新角色列表，共 ${result.length} 个角色（清理 ${orphanedConfigs.length} 个，新增 ${newRoles.length} 个）`,
          meta: {
            source: 'mcp-realtime',
            timestamp: new Date().toISOString(),
            total: result.length,
            cleaned: orphanedConfigs.length,
            created: newRoles.length
          }
        });

      } catch (error) {
        console.error('[RoleSync] 刷新角色失败:', error);
        response.status(500).json({
          success: false,
          error: '刷新角色失败: ' + error.message
        });
      }
    }
  );

  // GET /workspaces/:id/promptx-audit
  app.get(
    "/workspaces/:workspaceId/promptx-audit",
    [validatedRequest, allowAllUsers],
    async (request, response) => {
      try {
        const workspaceId = validateWorkspaceId(request.params.workspaceId);
        const {
          action,
          fromDate,
          toDate,
          page = 1,
          limit = 20
        } = request.query;

        const options = {
          action,
          fromDate,
          toDate,
          page: parseInt(page),
          limit: parseInt(limit)
        };

        const logs = await roleAuth.getAuditLogs(workspaceId, options);

        response.status(200).json({
          success: true,
          data: logs,
          pagination: {
            currentPage: options.page,
            itemsPerPage: options.limit
          }
        });
      } catch (error) {
        handleRoleManagementError(error, request, response);
      }
    }
  );
}

// Cleanup function for graceful shutdown
async function cleanup() {
  const prisma = new PrismaClient();
  await prisma.$disconnect();
}

module.exports = {
  workspacePromptXRolesEndpoints,
  cleanup
};