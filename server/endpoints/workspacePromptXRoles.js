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
 * 获取fallback的PromptX角色列表
 * 注意：此函数仅在MCP服务器完全不可用时使用，返回空列表而不是硬编码角色
 * @returns {Array} 空的角色列表
 */
function getFallbackPromptXRoles() {
  console.warn('PromptX MCP服务器不可用，且无缓存数据。返回空角色列表。');
  return [];
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

      console.log(`成功解析出 ${rolesData.length} 个角色`);
      return rolesData;

      return rolesData;
    } else {
      console.warn('PromptX MCP服务器不可用');
      return null;
    }
  } catch (error) {
    console.error('MCP discover同步失败:', error);
    return null;
  }
}

/**
 * 确保工作区有对应的所有角色配置记录
 * @param {number} workspaceId - 工作区ID
 * @param {Array} availableRoles - 可用角色列表
 */
async function ensureWorkspaceRoleConfigs(workspaceId, availableRoles, prisma) {
  try {
    console.log(`确保工作区 ${workspaceId} 有 ${availableRoles.length} 个角色的配置记录`);

    // 获取工作区现有的角色配置
    const existingConfigs = await prisma.workspace_promptx_roles.findMany({
      where: { workspaceId }
    });

    const existingRoleIds = new Set(existingConfigs.map(config => config.roleId));
    console.log(`工作区现有角色配置数量: ${existingConfigs.length}`);

    // 为新角色创建配置记录
    const newRoles = availableRoles.filter(role => !existingRoleIds.has(role.id));
    if (newRoles.length > 0) {
      console.log(`为 ${newRoles.length} 个新角色创建配置记录`);

      // 使用upsert避免重复创建错误
      let createdCount = 0;
      for (const role of newRoles) {
        try {
          await prisma.workspace_promptx_roles.create({
            data: {
              workspaceId,
              roleId: role.id,
              enabled: false, // 默认禁用，让用户手动启用
              addedBy: null,   // 系统创建
              updatedBy: null
            }
          });
          createdCount++;
        } catch (error) {
          if (error.code === 'P2002') {
            console.log(`角色 ${role.id} 的配置记录已存在，跳过创建`);
          } else {
            throw error;
          }
        }
      }
      const roleConfigs = { count: createdCount };

      console.log(`成功创建 ${roleConfigs.count} 个角色配置记录`);

      // 记录审计日志
      for (const role of newRoles) {
        await roleAuth.logConfigurationChange(
          workspaceId,
          role.id,
          'ROLE_AUTO_CREATED',
          null,
          { roleId: role.id, enabled: false },
          null,
          request.ip,
          request.get('User-Agent')
        );
      }
    }

    // 检查是否有角色被移除（可选：可以清理不存在的角色配置）
    const availableRoleIds = new Set(availableRoles.map(role => role.id));
    const orphanedConfigs = existingConfigs.filter(config => !availableRoleIds.has(config.roleId));

    if (orphanedConfigs.length > 0) {
      console.log(`发现 ${orphanedConfigs.length} 个孤立的角色配置，可以选择清理`);
      // 这里可以选择删除不存在的角色配置，或者保留它们
    }

  } catch (error) {
    console.error('确保工作区角色配置失败:', error);
    throw error;
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
  app.get(
    "/workspaces/:workspaceId/promptx-available-roles",
    [validatedRequest, allowAllUsers],
    async (request, response) => {
      try {
        const workspaceId = validateWorkspaceId(request.params.workspaceId);

        // 使用现有cache_data表缓存角色数据
        const cacheKey = 'promptx_available_roles';
        let availableRoles = [];

        try {
          // 查询缓存表中的角色数据
          const cachedRoles = await prisma.cache_data.findFirst({
            where: {
              name: cacheKey,
              belongsTo: 'promptx'
            }
          });

          if (cachedRoles) {
            console.log('从cache_data表获取PromptX角色列表');
            availableRoles = JSON.parse(cachedRoles.data);

            // 检查缓存是否过期（超过24小时则刷新）
            const cacheAge = Date.now() - new Date(cachedRoles.lastUpdatedAt).getTime();
            const maxCacheAge = 24 * 60 * 60 * 1000; // 24小时

            if (cacheAge > maxCacheAge) {
              console.log('缓存已过期，尝试从MCP discover刷新角色列表');
              try {
                const mcpRoles = await getPromptXRolesFromMCP();
                if (mcpRoles && mcpRoles.length > 0) {
                  availableRoles = mcpRoles;
                  // 更新缓存
                  await prisma.cache_data.update({
                    where: { id: cachedRoles.id },
                    data: {
                      data: JSON.stringify(availableRoles),
                      lastUpdatedAt: new Date()
                    }
                  });
                  console.log('缓存已更新');
                }
              } catch (refreshError) {
                console.warn('刷新缓存失败，使用现有缓存:', refreshError.message);
                // 继续使用现有缓存，不中断服务
              }
            }
          } else {
            console.log('缓存未找到，尝试从MCP discover获取并缓存角色');
            // 如果缓存不存在，尝试从MCP discover获取并缓存
            const mcpRoles = await getPromptXRolesFromMCP();
            if (mcpRoles && mcpRoles.length > 0) {
              availableRoles = mcpRoles;
              // 保存到现有的cache_data表
              await prisma.cache_data.create({
                data: {
                  name: cacheKey,
                  data: JSON.stringify(availableRoles),
                  belongsTo: 'promptx'
                }
              });
              console.log('已创建新的角色缓存');
            } else {
              // 使用空列表作为fallback，避免硬编码
              availableRoles = getFallbackPromptXRoles();
            }
          }
        } catch (cacheError) {
          console.error('读取cache_data失败:', cacheError);
          // 尝试直接从MCP获取
          try {
            const mcpRoles = await getPromptXRolesFromMCP();
            if (mcpRoles && mcpRoles.length > 0) {
              availableRoles = mcpRoles;
              console.log('直接从MCP获取角色列表成功');
            } else {
              availableRoles = getFallbackPromptXRoles();
            }
          } catch (mcpError) {
            console.error('MCP获取也失败:', mcpError);
            availableRoles = getFallbackPromptXRoles();
          }
        }

        // 确保工作区有对应的角色配置记录
        if (availableRoles.length > 0) {
          await ensureWorkspaceRoleConfigs(workspaceId, availableRoles, prisma);
        }

        response.status(200).json({
          success: true,
          data: availableRoles
        });
      } catch (error) {
        console.error('获取可用角色失败:', error);
        response.status(500).json({
          success: false,
          error: '获取可用角色失败'
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
  app.post(
    "/workspaces/:workspaceId/promptx-refresh-roles",
    [validatedRequest, allowAllUsers],
    async (request, response) => {
      try {
        const workspaceId = validateWorkspaceId(request.params.workspaceId);

        console.log(`工作区 ${workspaceId} 请求刷新PromptX角色缓存`);

        // 强制从MCP discover获取最新角色列表
        const mcpRoles = await getPromptXRolesFromMCP();
        let availableRoles = [];

        if (mcpRoles && mcpRoles.length > 0) {
          availableRoles = mcpRoles;

          // 更新或创建缓存
          const cacheKey = 'promptx_available_roles';
          const existingCache = await prisma.cache_data.findFirst({
            where: {
              name: cacheKey,
              belongsTo: 'promptx'
            }
          });

          if (existingCache) {
            await prisma.cache_data.update({
              where: { id: existingCache.id },
              data: {
                data: JSON.stringify(availableRoles),
                lastUpdatedAt: new Date()
              }
            });
          } else {
            await prisma.cache_data.create({
              data: {
                name: cacheKey,
                data: JSON.stringify(availableRoles),
                belongsTo: 'promptx'
              }
            });
          }

          console.log(`角色缓存已刷新，共 ${availableRoles.length} 个角色`);
        } else {
          console.warn('MCP服务器未返回有效角色数据');
        }

        // 确保工作区有对应的角色配置记录
        if (availableRoles.length > 0) {
          await ensureWorkspaceRoleConfigs(workspaceId, availableRoles, prisma);
        }

        response.status(200).json({
          success: true,
          data: availableRoles,
          message: availableRoles.length > 0
            ? `成功刷新角色列表，共 ${availableRoles.length} 个角色`
            : '未获取到角色数据，请检查MCP服务器状态'
        });
      } catch (error) {
        console.error('刷新角色缓存失败:', error);
        response.status(500).json({
          success: false,
          error: '刷新角色缓存失败: ' + error.message
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